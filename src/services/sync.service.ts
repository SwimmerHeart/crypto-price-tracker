import type { CmcClient } from '../clients/coinmarketcap.client'
import type { Logger } from '../core/logger'
import { CoinRepository } from '../repositories/coin.repository'
import { JobRepository } from '../repositories/job.repository'
import { PriceRepository } from '../repositories/price.repository'

export class SyncService {
  constructor(
    private readonly coinRepository: CoinRepository,
    private readonly priceRepository: PriceRepository,
    private readonly jobRepository: JobRepository,
    private readonly cmc: CmcClient,
    private readonly currency: string,
    private readonly logger: Logger
  ) {}

  async runOnce(): Promise<void> {
    const jobId = this.jobRepository.start()
    const symbols = this.coinRepository.listAllSymbols()

    try {
      let pricePoints = 0

      if (symbols.length > 0) {
        const quotes = await this.cmc.getLatestQuotes(symbols)
        const fetchedAt = Date.now()

        pricePoints = this.priceRepository.insertBatch(
          quotes.map((quote) => ({
            symbol: quote.symbol,
            price: quote.price,
            currency: this.currency,
            fetched_at: fetchedAt,
          }))
        )
        this.coinRepository.touch(
          quotes.map((quote) => quote.symbol),
          fetchedAt
        )
      }

      this.jobRepository.finish(jobId, {
        status: 'success',
        symbolsCount: symbols.length,
        pricePoints,
      })
      this.logger.info('фоновый цикл завершён', { jobId, symbols: symbols.length, pricePoints })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.jobRepository.finish(jobId, {
        status: 'failed',
        symbolsCount: symbols.length,
        pricePoints: 0,
        error: message,
      })
      this.logger.error('фоновый цикл упал', {
        jobId,
        cause: error instanceof Error ? error : undefined,
      })

      throw error
    }
  }
}