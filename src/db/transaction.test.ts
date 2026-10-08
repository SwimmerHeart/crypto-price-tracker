import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { openDatabase } from './connection'
import { withTransaction } from './transaction'

let dir: string
let db: DatabaseSync

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-tx-'))
  db = openDatabase(path.join(dir, 'tx.db'))
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)')
})

beforeEach(() => {
  db.exec('DELETE FROM items')
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('фиксирует изменения внутри fn', () => {
  withTransaction(db, () => {
    db.prepare('INSERT INTO items (name) VALUES (?)').run('a')
    db.prepare('INSERT INTO items (name) VALUES (?)').run('b')
  })

  const rows = db.prepare('SELECT name FROM items ORDER BY name').all() as { name: string }[]
  expect(rows.map(row => row.name)).toEqual(['a', 'b'])
})

test('откатывает изменения при ошибке в fn', () => {
  expect(() =>
    withTransaction(db, () => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('x')
      throw new Error('boom')
    })
  ).toThrow('boom')

  const count = db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }
  expect(count.c).toBe(0)
})

test('возвращает значение из fn', () => {
  const result = withTransaction(db, () =>
    db.prepare('INSERT INTO items (name) VALUES (?)').run('c')
  )

  expect(Number(result.lastInsertRowid)).toBeGreaterThan(0)
})

test('вложенная транзакция не глотает ошибку и откатывает внешнюю', () => {
  expect(() =>
    withTransaction(db, () => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('y')
      withTransaction(db, () => {})
    })
  ).toThrow('cannot start a transaction within a transaction')

  const count = db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }
  expect(count.c).toBe(0)
})
