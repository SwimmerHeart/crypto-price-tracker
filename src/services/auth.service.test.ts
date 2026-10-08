import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { AuthenticationError } from '../core/errors'
import { UserRepository } from '../repositories/user.repository'
import { AuthService } from './auth.service'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let auth: AuthService
let userRepo: UserRepository

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-auth-'))
  db = openDatabase(path.join(dir, 'auth.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  userRepo = new UserRepository(db)
  auth = new AuthService(userRepo)
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('register возвращает ключ, verifyToken с этим ключом находит пользователя', () => {
  const apiKey = auth.register()

  const row = auth.verifyToken(apiKey)

  expect(row.id).toBeGreaterThan(0)
  expect(row.api_key_hash).toBe(sha256(apiKey))
})

test('verifyToken с несуществующим ключом бросает AuthenticationError', () => {
  expect(() => auth.verifyToken('definitely-not-a-key')).toThrow(AuthenticationError)
})

test('в базе хранится только хеш, сам ключ не обратим', () => {
  const apiKey = auth.register()

  expect(userRepo.findByKeyHash(apiKey)).toBeUndefined()
  expect(userRepo.findByKeyHash(sha256(apiKey))).toBeDefined()
})