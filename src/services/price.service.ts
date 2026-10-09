import { NotFoundError, ValidationError } from '../core/errors'
import { CoinRepository } from '../repositories/coin.repository'
import { PriceRepository } from '../repositories/price.repository'
import { parseLimit, parseOptionalISO, parseSymbol } from '../utils/validation'

export interface HistoryQuery {
  from?: unknown
  to?: unknown
  limit?: unknown
}

export interface CurrentPrice {
  symbol: string
  price: number
  currency: string
  fetched_at: number
}

export class PriceService {
  constructor(
    private readonly coinRepository: CoinRepository,
    private readonly priceRepository: PriceRepository,
    private readonly currency: string
  ) {}

  current(userId: number, rawSymbol: unknown): CurrentPrice {
    const symbol = parseSymbol(rawSymbol)
    this.assertTracked(userId, symbol)

    const latest = this.priceRepository.latest(symbol, this.currency)
    if (!latest) {
      throw new NotFoundError(`цена по символу ${symbol} пока не собрана`)
    }

    return { symbol, price: latest.price, currency: this.currency, fetched_at: latest.fetched_at }
  }

  history(userId: number, rawSymbol: unknown, query: HistoryQuery): CurrentHistory {
    const symbol = parseSymbol(rawSymbol)
    this.assertTracked(userId, symbol)

    const fromMs = parseOptionalISO(query.from, 'from')
    const toMs = parseOptionalISO(query.to, 'to')
    const limit = parseLimit(query.limit)

    if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
      throw new ValidationError('диапазон невалиден', {
        details: [
          { field: 'from', message: 'from не может быть позже to', rule: 'range' },
        ],
      })
    }

    const filter = { fromMs, toMs, limit }
    const items = this.priceRepository
      .history(symbol, this.currency, filter)
      .map((row) => ({ price: row.price, fetched_at: row.fetched_at }))
    const metrics = this.priceRepository.aggregate(symbol, this.currency, { fromMs, toMs })

    return { symbol, currency: this.currency, limit, from: fromMs, to: toMs, items, metrics }
  }

  private assertTracked(userId: number, symbol: string): void {
    const tracked = this.coinRepository.findByUserAndSymbol(userId, symbol)
    if (!tracked) {
      throw new NotFoundError(`символ ${symbol} не отслеживается`)
    }
  }
}

export interface CurrentHistory {
  symbol: string
  currency: string
  limit: number
  from?: number
  to?: number
  items: Array<{ price: number; fetched_at: number }>
  metrics: {
    count: number
    min: number | null
    max: number | null
    avg: number | null
    first_fetched_at: number | null
    last_fetched_at: number | null
  }
}