import { DatabaseSync } from 'node:sqlite'
import { ConflictError, InternalError } from '../core/errors'
import type { CoinRow } from '../core/types'

export class CoinRepository {
  constructor(private readonly db: DatabaseSync) {}

  listByUser(userId: number): CoinRow[] {
    return this.db
      .prepare('SELECT id, user_id, symbol, name, last_updated_at, created_at FROM tracked_coins WHERE user_id = ? ORDER BY symbol')
      .all(userId) as unknown as CoinRow[]
  }

  findByUserAndSymbol(userId: number, symbol: string): CoinRow | undefined {
    const row = this.db
      .prepare('SELECT id, user_id, symbol, name, last_updated_at, created_at FROM tracked_coins WHERE user_id = ? AND symbol = ?')
      .get(userId, symbol) as unknown as CoinRow | undefined

    return row
  }

  create(userId: number, symbol: string, name: string, lastUpdatedAt: number): CoinRow {
    try {
      const result = this.db
        .prepare('INSERT INTO tracked_coins (user_id, symbol, name, last_updated_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(userId, symbol, name, lastUpdatedAt, Date.now())

      const row = this.db
        .prepare('SELECT id, user_id, symbol, name, last_updated_at, created_at FROM tracked_coins WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as unknown as CoinRow | undefined

      if (row) return row
      throw new InternalError('запись не найдена после вставки')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed')) {
        throw new ConflictError('монета уже отслеживается', {
          context: { userId, symbol },
        })
      }
      throw new InternalError('ошибка записи в базу', { cause: error })
    }
  }

  remove(userId: number, symbol: string): boolean {
    const result = this.db
      .prepare('DELETE FROM tracked_coins WHERE user_id = ? AND symbol = ?')
      .run(userId, symbol)

    return Number(result.changes) > 0
  }

  listAllSymbols(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT symbol FROM tracked_coins ORDER BY symbol')
      .all() as { symbol: string }[]

    return rows.map((row) => row.symbol)
  }

  touch(symbols: string[], updatedAt: number): void {
    if (symbols.length === 0) return

    const placeholders = symbols.map(() => '?').join(', ')
    this.db
      .prepare(`UPDATE tracked_coins SET last_updated_at = ? WHERE symbol IN (${placeholders})`)
      .run(updatedAt, ...symbols)
  }
}
