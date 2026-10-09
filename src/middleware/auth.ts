import type { NextFunction, Request, Response } from 'express'
import { AuthenticationError } from '../core/errors'
import type { AuthService } from '../services/auth.service'

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i

export function createAuthMiddleware(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization
    const match = typeof header === 'string' ? BEARER_PATTERN.exec(header) : null

    if (!match) {
      next(new AuthenticationError('требуется Bearer-токен'))
      return
    }

    try {
      req.user = authService.verifyToken(match[1]!)
      next()
    } catch (error) {
      next(error)
    }
  }
}
