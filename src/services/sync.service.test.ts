import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeEach, afterEach } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { createLogger } from '../core/logger'
import { NotFoundError, UpstreamError } from '../core/errors'
import type { CmcClient, CmcQuote } from '../clients/coinmarketcap.client'
import { UserRepository } from '../repositories/user.repository'
import { CoinRepository } from '../repositories/coin.repository'
import { PriceRepository } from '../repositories/price.repository'
import { JobRepository } from '../repositories/job.repository'
import { SyncService } from './sync.service'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let userRepo: UserRepository
let coinRepo: CoinRepository
let priceRepo: PriceRepository
let jobRepo: JobRepository

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-sync-'))
  db = openDatabase(path.join(dir, 'sync.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  userRepo = new UserRepository(db)
  coinRepo = new CoinRepository(db)
  priceRepo = new PriceRepository(db)
  jobRepo = new JobRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

function seedCoin(owner: string, symbol: string, name: string): void {
  const userId = userRepo.create(owner)
  coinRepo.create(userId, symbol, name, Date.now())
}

function fakeCmc(quotes: Record<string, CmcQuote>): CmcClient {
  return {
    async getLatestQuotes(symbols: string[]): Promise<CmcQuote[]> {
      const missing = symbols.filter((symbol) => !quotes[symbol])
      if (missing.length > 0) {
        throw new NotFoundError(`символы не найдены: ${missing.join(', ')}`)
      }
      return symbols.map((symbol) => quotes[symbol]!)
    },
  }
}

function createService(cmc: CmcClient): SyncService {
  return new SyncService(coinRepo, priceRepo, jobRepo, cmc, 'USD', createLogger({ level: 'silent' }))
}

test('успешный цикл пишет цены, обновляет время и фиксирует задачу успешной', async () => {
  seedCoin('owner-sync-a', 'BTC', 'Bitcoin')
  seedCoin('owner-sync-b', 'ETH', 'Ethereum')

  const cmc = fakeCmc({
    BTC: { id: 1, symbol: 'BTC', name: 'Bitcoin', price: 97_000 },
    ETH: { id: 1027, symbol: 'ETH', name: 'Ethereum', price: 3_400 },
  })

  const before = Date.now()
  await createService(cmc).runOnce()

  const btc = priceRepo.latest('BTC', 'USD')
  expect(btc?.price).toBe(97_000)
  expect(btc?.fetched_at).toBeGreaterThanOrEqual(before)

  const eth = priceRepo.latest('ETH', 'USD')
  expect(eth?.price).toBe(3_400)

  expect(btc?.fetched_at).toBeGreaterThanOrEqual(before)

  const job = jobRepo.latest()
  expect(job?.status).toBe('success')
  expect(job?.symbols_count).toBe(2)
  expect(job?.price_points).toBe(2)
  expect(job?.error).toBeNull()

  const history = priceRepo.aggregate('BTC', 'USD')
  expect(history.count).toBeGreaterThan(0)
})

test('цикл без отслеживаемых монет завершается успешно с нулями', async () => {
  const cmc = fakeCmc({})
  await createService(cmc).runOnce()

  const job = jobRepo.latest()
  expect(job?.status).toBe('success')
  expect(job?.symbols_count).toBe(0)
  expect(job?.price_points).toBe(0)
})

test('падение CoinMarketCap пишет неуспех в БД и пробрасывает ошибку', async () => {
  seedCoin('owner-sync-fail', 'SOL', 'Solana')

  const cmc: CmcClient = {
    async getLatestQuotes(): Promise<CmcQuote[]> {
      throw new UpstreamError('CoinMarketCap: HTTP 429', {
        upstreamCode: 1008,
        retryable: true,
      })
    },
  }

  await expect(createService(cmc).runOnce()).rejects.toThrow(UpstreamError)

  const job = jobRepo.latest()
  expect(job?.status).toBe('failed')
  expect(job?.symbols_count).toBe(1)
  expect(job?.error).toContain('CoinMarketCap')

  expect(priceRepo.latest('SOL', 'USD')).toBeUndefined()
})