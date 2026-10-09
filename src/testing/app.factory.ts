import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../app'
import type { CmcClient, CmcQuote } from '../clients/coinmarketcap.client'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { NotFoundError } from '../core/errors'
import { createLogger } from '../core/logger'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

export interface TestContext {
  db: DatabaseSync
  app: Express
  register(): Promise<string>
  close(): void
}

export function createFakeCmcClient(quotes: Record<string, CmcQuote>): CmcClient {
  return {
    async getLatestQuotes(symbols: string[]): Promise<CmcQuote[]> {
      const missing = symbols.filter((symbol) => !quotes[symbol])

      if (missing.length > 0) {
        throw new NotFoundError(`символы не найдены: ${missing.join(', ')}`, {
          context: { missing },
        })
      }

      return symbols.map((symbol) => quotes[symbol]!)
    },
  }
}

export interface TestContextOptions {
  currency?: string
}

export function createTestContext(
  quotes: Record<string, CmcQuote> = {},
  options: TestContextOptions = {}
): TestContext {
  const dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-app-'))
  const db = openDatabase(path.join(dir, 'app.db'))
  applyMigrations(db, MIGRATIONS_DIR)

  const cmc = createFakeCmcClient(quotes)
  const app = createApp({ db, cmc, logger: createLogger({ level: 'silent' }), currency: options.currency })

  return {
    db,
    app,
    async register(): Promise<string> {
      const res = await request(app).post('/auth/register').expect(201)
      return res.body.apiKey as string
    },
    close(): void {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}