import express, { type Express } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { CmcClient } from './clients/coinmarketcap.client'
import { createLogger, type Logger } from './core/logger'
import { createErrorHandler } from './middleware/error-handler'
import { requestIdMiddleware } from './middleware/request-id'
import { createAuthMiddleware } from './middleware/auth'
import { UserRepository } from './repositories/user.repository'
import { CoinRepository } from './repositories/coin.repository'
import { PriceRepository } from './repositories/price.repository'
import { AuthService } from './services/auth.service'
import { CoinService } from './services/coin.service'
import { PriceService } from './services/price.service'
import { createAuthRouter } from './routes/auth.routes'
import { createCoinRouter } from './routes/coin.routes'
import { createPriceRouter } from './routes/price.routes'
import { healthRouter } from './routes/health.routes'

export interface AppOptions {
  db: DatabaseSync
  cmc: CmcClient
  logger?: Logger
  currency?: string
}

export function createApp(options: AppOptions): Express {
  const logger = options.logger ?? createLogger()
  const currency = options.currency ?? 'USD'

  const app = express()

  const userRepository = new UserRepository(options.db)
  const coinRepository = new CoinRepository(options.db)
  const priceRepository = new PriceRepository(options.db)
  const authService = new AuthService(userRepository)
  const coinService = new CoinService(coinRepository, options.cmc)
  const priceService = new PriceService(coinRepository, priceRepository, currency)

  app.use(express.json())
  app.use(requestIdMiddleware)

  app.use('/health', healthRouter)
  app.use('/auth', createAuthRouter(authService))
  app.use('/coins', createAuthMiddleware(authService), createCoinRouter(coinService))
  app.use('/coins', createAuthMiddleware(authService), createPriceRouter(priceService))

  app.use(createErrorHandler(logger))

  return app
}
