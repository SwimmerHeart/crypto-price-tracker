import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { ConflictError } from '../core/errors'
import { UserRepository } from './user.repository'
import { CoinRepository } from './coin.repository'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let userRepo: UserRepository
let coinRepo: CoinRepository

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-coins-'))
  db = openDatabase(path.join(dir, 'coins.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  userRepo = new UserRepository(db)
  coinRepo = new CoinRepository(db)
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

function createUser(apiKeyHash: string): number {
  return userRepo.create(apiKeyHash)
}

test('create добавляет монету, listByUser её видит', () => {
  const userId = createUser('owner-one')

  const id = coinRepo.create(userId, 'BTC', 'Bitcoin')

  expect(id).toBeGreaterThan(0)

  const rows = coinRepo.listByUser(userId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ id, user_id: userId, symbol: 'BTC', name: 'Bitcoin' })
  expect(rows[0]?.last_updated_at).toBeNull()
  expect(rows[0]?.created_at).toEqual(expect.any(Number))
})

test('повторный create той же пары (user, symbol) бросает ConflictError', () => {
  const userId = createUser('owner-two')

  coinRepo.create(userId, 'ETH', 'Ethereum')

  expect(() => coinRepo.create(userId, 'ETH', 'Ethereum')).toThrow(ConflictError)
})

test('remove удаляет и сообщает, существовала ли монета', () => {
  const userId = createUser('owner-three')

  coinRepo.create(userId, 'SOL', 'Solana')

  expect(coinRepo.remove(userId, 'SOL')).toBe(true)
  expect(coinRepo.listByUser(userId)).toHaveLength(0)

  expect(coinRepo.remove(userId, 'SOL')).toBe(false)
})

test('монеты одного пользователя не видны другому', () => {
  const alice = createUser('alice')
  const bob = createUser('bob')

  coinRepo.create(alice, 'BTC', 'Bitcoin')

  expect(coinRepo.listByUser(bob)).toHaveLength(0)
  expect(coinRepo.findByUserAndSymbol(bob, 'BTC')).toBeUndefined()
  expect(coinRepo.findByUserAndSymbol(alice, 'BTC')).toBeDefined()
})

test('findByUserAndSymbol без совпадения возвращает undefined', () => {
  const userId = createUser('empty-user')

  expect(coinRepo.findByUserAndSymbol(userId, 'DOGE')).toBeUndefined()
})