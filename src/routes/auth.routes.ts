import { Router } from 'express'
import type { AuthService } from '../services/auth.service'

export function createAuthRouter(authService: AuthService): Router {
  const router = Router()

  router.post('/register', (_req, res) => {
    res.status(201).json({ apiKey: authService.register() })
  })

  return router
}
