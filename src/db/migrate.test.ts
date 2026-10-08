import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from './connection'
import { applyMigrations } from './migrate'

const REAL_001_PATH = path.join(__dirname, 'migrations', '001_init.sql')

let rootDir: string

beforeAll(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-migrate-'))
})

afterAll(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

function makeMigrationsDir(sqlFiles: Record<string, string>): string {
  const dir = mkdtempSync(path.join(rootDir, 'migs-'))
  for (const [name, body] of Object.entries(sqlFiles)) {
    writeFileSync(path.join(dir, `${name}.sql`), body)
  }
  return dir
}

test('применяет реальную миграцию 001 и возвращает применённые версии', () => {
  const migrationsDir = makeMigrationsDir({
    '001_init': readFileSync(REAL_001_PATH, 'utf8'),
  })
  const db = openDatabase(path.join(rootDir, 'first.db'))

  const applied = applyMigrations(db, migrationsDir)

  expect(applied).toEqual(['001_init'])

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  expect(tables.map(row => row.name)).toEqual(
    expect.arrayContaining(['users', 'tracked_coins', 'price_history', 'schema_migrations'])
  )

  const versions = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]
  expect(versions).toEqual([{ version: '001_init' }])

  db.close()
})

test('второй вызов не применяет ничего повторно', () => {
  const migrationsDir = makeMigrationsDir({
    '001_init': readFileSync(REAL_001_PATH, 'utf8'),
  })
  const db = openDatabase(path.join(rootDir, 'second.db'))

  expect(applyMigrations(db, migrationsDir)).toEqual(['001_init'])
  expect(applyMigrations(db, migrationsDir)).toEqual([])

  const versions = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]
  expect(versions).toEqual([{ version: '001_init' }])

  db.close()
})

test('применяет миграции по порядку имён файлов', () => {
  const migrationsDir = makeMigrationsDir({
    '001_create_parent': 'CREATE TABLE parent (id INTEGER PRIMARY KEY);',
    '002_create_child':
      'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));',
  })
  const db = openDatabase(path.join(rootDir, 'order.db'))

  const applied = applyMigrations(db, migrationsDir)

  expect(applied).toEqual(['001_create_parent', '002_create_child'])

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  const names = tables.map(row => row.name)
  expect(names).toContain('parent')
  expect(names).toContain('child')

  db.close()
})

test('битая миграция откатывается целиком и не помечается применённой', () => {
  const migrationsDir = makeMigrationsDir({
    '001_ok': 'CREATE TABLE ok_table (id INTEGER PRIMARY KEY);',
    '002_bad': 'CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY);\nTHIS IS NOT VALID SQL;',
  })
  const db = openDatabase(path.join(rootDir, 'rollback.db'))

  expect(() => applyMigrations(db, migrationsDir)).toThrow()

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  const names = tables.map(row => row.name)
  expect(names).toContain('ok_table')
  expect(names).not.toContain('should_not_exist')

  const versions = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]
  expect(versions).toEqual([{ version: '001_ok' }])

  db.close()
})