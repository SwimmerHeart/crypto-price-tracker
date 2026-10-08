import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from './connection'

let dir: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('включает PRAGMA foreign_keys и journal_mode=WAL', () => {
  const db = openDatabase(path.join(dir, 'pragmas.db'))

  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
  expect(fk.foreign_keys).toBe(1)

  const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
  expect(journal.journal_mode).toBe('wal')

  db.close()
})

test('foreign_keys реально работает: сирота отклоняется, каскад удаляет потомков', () => {
  const db = openDatabase(path.join(dir, 'foreign_keys.db'))

  db.exec(`
    CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE child (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE
    );
  `)

  expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (?)').run(999)).toThrow(
    'FOREIGN KEY constraint failed'
  )

  const inserted = db.prepare('INSERT INTO parent DEFAULT VALUES').run()
  const parentId = Number(inserted.lastInsertRowid)
  const child = db.prepare('INSERT INTO child (parent_id) VALUES (?)').run(parentId)
  expect(child.changes).toBe(1)

  const deleted = db.prepare('DELETE FROM parent WHERE id = ?').run(parentId)
  expect(deleted.changes).toBe(1)

  const left = db.prepare('SELECT COUNT(*) AS c FROM child').get() as { c: number }
  expect(left.c).toBe(0)

  db.close()
})

test('бросает на пустом и whitespace-пути вместо молчаливой базы', () => {
  expect(() => openDatabase('')).toThrow('path')
  expect(() => openDatabase('   ')).toThrow('path')
})