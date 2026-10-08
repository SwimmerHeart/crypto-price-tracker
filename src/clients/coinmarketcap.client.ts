import axios, { type AxiosInstance } from 'axios'
import {
  InternalError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from '../core/errors'
import { retryWithBackoff } from '../utils/async'

export interface CmcQuote {
  id: number
  name: string
  symbol: string
  price: number
}

export interface CmcClient {
  getLatestQuotes(symbols: string[]): Promise<CmcQuote[]>
}

export interface CmcClientOptions {
  baseUrl: string
  apiKey: string
  timeoutMs: number
  currency?: string
  retries?: number
  baseDelayMs?: number
  http?: AxiosInstance
}

interface CmcStatus {
  error_code?: string | number
  error_message?: string
}

interface CmcRawQuote {
  symbol?: string
  price?: number | null
}

interface CmcRawCoin {
  id: number
  name: string
  symbol: string
  quote?: CmcRawQuote[]
}

interface CmcErrorBody {
  status?: CmcStatus
  error_code?: string | number
  error_message?: string
}

export function createCmcClient(options: CmcClientOptions): CmcClient {
  if (!options.apiKey) throw new Error('createCmcClient: apiKey обязателен')

  const http =
    options.http ??
    axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: { 'X-CMC_PRO_API_KEY': options.apiKey },
    })

  const currency = options.currency ?? 'USD'
  const retries = options.retries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 200

  return {
    async getLatestQuotes(symbols: string[]): Promise<CmcQuote[]> {
      const normalized = symbols.map((symbol) => symbol.toUpperCase())

      if (normalized.length === 0) throw new ValidationError('список символов не может быть пустым')

      let data: CmcRawCoin[]

      try {
        const response = await retryWithBackoff(
          () =>
            http.get('/v3/cryptocurrency/quotes/latest', {
              params: { symbol: normalized.join(','), convert: currency },
            }),
          { retries, baseDelayMs, shouldRetry: isRetryableError }
        )
        data = response.data.data as CmcRawCoin[]
      } catch (error) {
        throw translateError(error)
      }

      return pickCanonicalQuotes(data, normalized, currency)
    },
  }
}

function pickCanonicalQuotes(
  data: CmcRawCoin[],
  symbols: string[],
  currency: string
): CmcQuote[] {
  const bySymbol = new Map<string, CmcQuote[]>()

  for (const record of data) {
    const price = priceIn(record, currency)
    if (price === undefined) continue

    const symbolKey = record.symbol.toUpperCase()
    const candidates = bySymbol.get(symbolKey) ?? []
    candidates.push({ id: record.id, name: record.name, symbol: record.symbol, price })
    bySymbol.set(symbolKey, candidates)
  }

  const found: CmcQuote[] = []
  const missing: string[] = []

  for (const symbol of symbols) {
    const candidates = bySymbol.get(symbol)
    if (!candidates) {
      missing.push(symbol)
      continue
    }

    const canonical = candidates.reduce((min, current) =>
      current.id < min.id ? current : min
    )
    found.push(canonical)
  }

  if (missing.length > 0) {
    throw new NotFoundError(`символы не найдены: ${missing.join(', ')}`, {
      context: { missing, symbols },
    })
  }

  return found
}

function priceIn(record: CmcRawCoin, currency: string): number | undefined {
  const quotes = record.quote ?? []
  const quote = quotes.find((q) => q.symbol === currency)

  if (quote?.price === undefined || quote.price === null) return undefined
  return quote.price
}

function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status

    if (status === undefined) return true
    return status === 429 || status >= 500
  }

  return false
}

function readErrorCode(body: unknown): string | number | undefined {
  if (body === null || typeof body !== 'object') return undefined

  const record = body as CmcErrorBody
  const code = record.error_code ?? record.status?.error_code
  return code === undefined ? undefined : Number(code)
}

function translateError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const upstreamCode = readErrorCode(error.response?.data)
    const body = error.response?.data as CmcErrorBody | undefined

    if (status === undefined) {
      throw new UpstreamError(
        error.code === 'ECONNABORTED'
          ? 'CoinMarketCap: таймаут запроса'
          : 'CoinMarketCap: сеть недоступна',
        { upstreamCode, retryable: true, cause: error, context: { code: error.code } }
      )
    }

    const message =
      body?.error_message ?? body?.status?.error_message ?? `CoinMarketCap: HTTP ${status}`

    throw new UpstreamError(`CoinMarketCap: ${message}`, {
      upstreamCode,
      retryable: status === 429 || status >= 500,
      cause: error,
      context: { httpStatus: status },
    })
  }

  if (error instanceof Error) {
    throw new InternalError('неожиданная ошибка клиента CoinMarketCap', { cause: error })
  }

  throw new InternalError('неожиданная ошибка клиента CoinMarketCap')
}