import { DatabaseSync } from 'node:sqlite'
import { ConflictError, InternalError } from '../core/errors'
import type { UserRow } from '../core/types'

export class UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(apiKeyHash: string): number {
    try {
      const result = this.db
        .prepare('INSERT INTO users (api_key_hash, created_at) VALUES (?, ?)')
        .run(apiKeyHash, Date.now())

      return Number(result.lastInsertRowid)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed')) {
        throw new ConflictError('такой ключ уже зарегистрирован', {
          context: { apiKeyHash },
        })
      }
      throw new InternalError('ошибка записи в базу', { cause: error })
    }
  }

  findByKeyHash(apiKeyHash: string): UserRow | undefined {
    const row = this.db
      .prepare('SELECT id, api_key_hash, created_at FROM users WHERE api_key_hash = ?')
      .get(apiKeyHash) as UserRow | undefined

    return row
  }
}
