import { createHash, randomBytes } from 'node:crypto'
import type { UserRow } from '../core/types'
import { AuthenticationError } from '../core/errors'
import { UserRepository } from '../repositories/user.repository'

export class AuthService {
  constructor(private readonly userRepository: UserRepository) {}

  register(): string {
    const apiKey = randomBytes(32).toString('hex')
    this.userRepository.create(hashApiKey(apiKey))

    return apiKey
  }

  verifyToken(token: string): UserRow {
    const row = this.userRepository.findByKeyHash(hashApiKey(token))
    if (!row) throw new AuthenticationError('недействительный API-ключ')

    return row
  }
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}
