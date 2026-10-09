import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { PriceRepository } from './price.repository'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let repo: PriceRepository

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-prices-'))
  db = openDatabase(path.join(dir, 'prices.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  repo = new PriceRepository(db)
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('insert пишет строку, latest отдаёт самую свежую', () => {
  repo.insert('BTC', 90_000, 'USD', 1000)
  repo.insert('BTC', 95_000, 'USD', 2000)

  expect(repo.latest('BTC', 'USD')).toEqual({ price: 95_000, fetched_at: 2000 })
  expect(repo.latest('BTC', 'EUR')).toBeUndefined()
  expect(repo.latest('ETH', 'USD')).toBeUndefined()
})

test('повторный insert того же снимка не создаёт дубль', () => {
  repo.insert('BTC', 95_000, 'USD', 2000)

  const aggregate = repo.aggregate('BTC', 'USD')
  expect(aggregate.count).toBe(2)
})

test('insertBatch добавляет пачку атомарно и возвращает число записей', () => {
  const inserted = repo.insertBatch([
    { symbol: 'ETH', price: 3_300, currency: 'USD', fetched_at: 5000 },
    { symbol: 'ETH', price: 3_400, currency: 'USD', fetched_at: 6000 },
    { symbol: 'BTC', price: 96_000, currency: 'USD', fetched_at: 6000 },
  ])

  expect(inserted).toBe(3)
  expect(repo.latest('ETH', 'USD')).toEqual({ price: 3_400, fetched_at: 6000 })
})

test('history фильтрует диапазон, сортирует по убыванию и ограничивает', () => {
  const rows = repo.history('BTC', 'USD', { fromMs: 1500, toMs: 2500 })

  expect(rows).toEqual([
    { symbol: 'BTC', price: 95_000, currency: 'USD', fetched_at: 2000 },
  ])

  const limited = repo.history('BTC', 'USD', { limit: 1 })
  expect(limited).toHaveLength(1)
  expect(limited[0]?.fetched_at).toBe(6000)
})

test('aggregate считает count/min/max/avg по диапазону', () => {
  const metrics = repo.aggregate('BTC', 'USD', { fromMs: 1500, toMs: 2500 })

  expect(metrics).toMatchObject({ count: 1, min: 95_000, max: 95_000, avg: 95_000 })

  const full = repo.aggregate('BTC', 'USD')
  expect(full.count).toBe(3)
  expect(full.min).toBe(90_000)
  expect(full.max).toBe(96_000)
  expect(full.first_fetched_at).toBe(1000)
  expect(full.last_fetched_at).toBe(6000)
})

test('aggregate на пустой выборке отдаёт нули и null', () => {
  const metrics = repo.aggregate('DOGE', 'USD')

  expect(metrics).toEqual({
    count: 0,
    min: null,
    max: null,
    avg: null,
    first_fetched_at: null,
    last_fetched_at: null,
  })
})