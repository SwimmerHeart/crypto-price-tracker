import path from 'node:path'
import process from 'node:process'
import type { Server } from 'node:http'
import express from 'express'
import { createApp } from './app'
import { createCmcClient } from './clients/coinmarketcap.client'
import { config } from './config'
import { openDatabase } from './db/connection'
import { applyMigrations } from './db/migrate'
import { createLogger } from './core/logger'
import { createTaskScheduler } from './jobs/scheduler'
import { CoinRepository } from './repositories/coin.repository'
import { JobRepository } from './repositories/job.repository'
import { PriceRepository } from './repositories/price.repository'
import { SyncService } from './services/sync.service'

const MIGRATIONS_DIR = path.join(__dirname, 'db', 'migrations')
const PUBLIC_DIR = path.join(__dirname, 'public')
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'app.db')

const logger = createLogger({ level: 'info' })

if (!config.cmcApiKey) {
  logger.error('CMC_API_KEY обязателен: создайте файл .env и положите ключ с https://pro.coinmarketcap.com/signup')
  process.exit(1)
}

const db = openDatabase(DB_PATH)
applyMigrations(db, MIGRATIONS_DIR)

const cmc = createCmcClient({
  baseUrl: config.cmcBaseUrl,
  apiKey: config.cmcApiKey,
  timeoutMs: config.cmcTimeoutMs,
  currency: config.currency,
})

const app = createApp({ db, cmc, logger, currency: config.currency })
app.use('/docs', express.static(PUBLIC_DIR))

const coinRepository = new CoinRepository(db)
const priceRepository = new PriceRepository(db)
const jobRepository = new JobRepository(db)

const syncService = new SyncService(
  coinRepository,
  priceRepository,
  jobRepository,
  cmc,
  config.currency,
  logger
)

const scheduler = createTaskScheduler({
  task: () => syncService.runOnce(),
  intervalMs: config.syncIntervalMs,
  logger,
})

const server: Server = app.listen(config.port, () => {
  logger.info('сервер запущен', {
    port: config.port,
    dbPath: DB_PATH,
    syncIntervalMs: config.syncIntervalMs,
    currency: config.currency,
  })
  scheduler.start()
})

async function shutdown(signal: string): Promise<void> {
  logger.warn(`получен сигнал ${signal}, останавливаюсь`)

  await scheduler.stop()

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeAllConnections()
  })

  db.close()
  logger.info('сервер остановлен')
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('uncaughtException', (error) => {
  logger.error('необработанное исключение', { cause: error })
  process.exit(1)
})