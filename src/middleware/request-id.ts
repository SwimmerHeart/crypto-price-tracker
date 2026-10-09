import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

export interface AlsStore {
  requestId: string
}

export const als = new AsyncLocalStorage<AlsStore>()

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  als.run({ requestId }, () => next())
}
