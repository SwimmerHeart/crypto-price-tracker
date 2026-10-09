import { DatabaseSync } from 'node:sqlite'
import type { PriceRow } from '../core/types'
import { withTransaction } from '../db/transaction'

export interface PriceFilter {
  fromMs?: number
  toMs?: number
  limit?: number
}

export interface PriceMetrics {
  count: number
  min: number | null
  max: number | null
  avg: number | null
  first_fetched_at: number | null
  last_fetched_at: number | null
}

const BASE_FILTER = 'symbol = ? AND currency = ?'

export class PriceRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(symbol: string, price: number, currency: string, fetchedAt: number): void {
    this.db
      .prepare(
        `INSERT INTO price_history (symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(symbol, currency, fetched_at) DO NOTHING`
      )
      .run(symbol, price, currency, fetchedAt)
  }

  insertBatch(rows: PriceRow[]): number {
    if (rows.length === 0) return 0

    const statement = this.db.prepare(
      `INSERT INTO price_history (symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol, currency, fetched_at) DO NOTHING`
    )

    return withTransaction(this.db, () => {
      let inserted = 0
      for (const row of rows) {
        inserted += Number(statement.run(row.symbol, row.price, row.currency, row.fetched_at).changes)
      }
      return inserted
    })
  }

  latest(symbol: string, currency: string): { price: number; fetched_at: number } | undefined {
    const row = this.db
      .prepare(`SELECT price, fetched_at FROM price_history WHERE ${BASE_FILTER} ORDER BY fetched_at DESC LIMIT 1`)
      .get(symbol, currency) as { price: number; fetched_at: number } | undefined

    return row
  }

  history(symbol: string, currency: string, filter: PriceFilter = {}): PriceRow[] {
    const limit = filter.limit ?? 100

    const rows = this.db
      .prepare(
        `SELECT symbol, price, currency, fetched_at FROM price_history
         WHERE ${BASE_FILTER} ${windowWhere(filter)}
         ORDER BY fetched_at DESC LIMIT ?`
      )
      .all(symbol, currency, ...windowParams(filter), limit) as unknown as PriceRow[]

    return rows
  }

  aggregate(symbol: string, currency: string, filter: PriceFilter = {}): PriceMetrics {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count,
                MIN(price) AS min,
                MAX(price) AS max,
                AVG(price) AS avg,
                MIN(fetched_at) AS first_fetched_at,
                MAX(fetched_at) AS last_fetched_at
         FROM price_history
         WHERE ${BASE_FILTER} ${windowWhere(filter)}`
      )
      .get(symbol, currency, ...windowParams(filter)) as {
      count: number
      min: number | null
      max: number | null
      avg: number | null
      first_fetched_at: number | null
      last_fetched_at: number | null
    }

    return {
      count: Number(row.count),
      min: row.min,
      max: row.max,
      avg: row.avg,
      first_fetched_at: row.first_fetched_at,
      last_fetched_at: row.last_fetched_at,
    }
  }
}

function windowWhere(filter: PriceFilter): string {
  const parts: string[] = []
  if (filter.fromMs !== undefined) parts.push('fetched_at >= ?')
  if (filter.toMs !== undefined) parts.push('fetched_at <= ?')
  return parts.length > 0 ? `AND ${parts.join(' AND ')}` : ''
}

function windowParams(filter: PriceFilter): number[] {
  const params: number[] = []
  if (filter.fromMs !== undefined) params.push(filter.fromMs)
  if (filter.toMs !== undefined) params.push(filter.toMs)
  return params
}