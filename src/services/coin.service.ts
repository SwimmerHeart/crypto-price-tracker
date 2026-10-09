import { ConflictError, NotFoundError } from '../core/errors'
import type { CmcClient } from '../clients/coinmarketcap.client'
import type { CoinRow } from '../core/types'
import { CoinRepository } from '../repositories/coin.repository'
import { parseSymbol } from '../utils/validation'

export class CoinService {
  constructor(
    private readonly coinRepository: CoinRepository,
    private readonly cmc: CmcClient
  ) {}

  list(userId: number): CoinRow[] {
    return this.coinRepository.listByUser(userId)
  }

  async add(userId: number, rawSymbol: unknown): Promise<CoinRow> {
    const symbol = parseSymbol(rawSymbol)

    const existing = this.coinRepository.findByUserAndSymbol(userId, symbol)
    if (existing) {
      throw new ConflictError(`символ ${symbol} уже отслеживается`)
    }

    const [quote] = await this.cmc.getLatestQuotes([symbol])
    if (!quote) {
      throw new NotFoundError(`символ ${symbol} не найден`)
    }

    return this.coinRepository.create(userId, quote.symbol, quote.name, Date.now())
  }

  remove(userId: number, rawSymbol: unknown): void {
    const symbol = parseSymbol(rawSymbol)
    const removed = this.coinRepository.remove(userId, symbol)

    if (!removed) {
      throw new NotFoundError(`символ ${symbol} не отслеживается`)
    }
  }
}