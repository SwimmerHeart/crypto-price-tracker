import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { ConflictError } from '../core/errors'
import { UserRepository } from './user.repository'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let repo: UserRepository

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-users-'))
  db = openDatabase(path.join(dir, 'users.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  repo = new UserRepository(db)
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('create возвращает id, findByKeyHash находит строку по хешу', () => {
  const id = repo.create('hash-one')

  expect(id).toBeGreaterThan(0)

  const row = repo.findByKeyHash('hash-one')
  expect(row?.id).toBe(id)
  expect(row?.api_key_hash).toBe('hash-one')
  expect(row?.created_at).toEqual(expect.any(Number))
})

test('повторный create с тем же хешем бросает ConflictError', () => {
  repo.create('hash-duplicate')

  expect(() => repo.create('hash-duplicate')).toThrow(ConflictError)
})

test('findByKeyHash без совпадения возвращает undefined', () => {
  expect(repo.findByKeyHash('hash-absent')).toBeUndefined()
})