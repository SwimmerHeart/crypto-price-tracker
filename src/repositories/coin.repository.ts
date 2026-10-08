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

  create(userId: number, symbol: string, name: string): number {
    try {
      const result = this.db
        .prepare('INSERT INTO tracked_coins (user_id, symbol, name, last_updated_at, created_at) VALUES (?, ?, ?, NULL, ?)')
        .run(userId, symbol, name, Date.now())

      return Number(result.lastInsertRowid)
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
}
