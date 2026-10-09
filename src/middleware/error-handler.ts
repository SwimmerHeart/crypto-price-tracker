import type { NextFunction, Request, Response } from 'express'
import { toAppError, UpstreamError } from '../core/errors'
import type { Logger } from '../core/logger'

export function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err)
      return
    }

    const appError = toAppError(err)
    const fields: Record<string, unknown> = { requestId: req.requestId }

    if (appError instanceof UpstreamError) fields.retryable = appError.retryable

    if (appError.isOperational) {
      logger.warn(`request failed: ${appError.code}`, fields)
    } else {
      logger.error('unhandled error', {
        ...fields,
        cause: err instanceof Error ? err : undefined,
      })
    }

    res.status(appError.statusCode).json({
      statusCode: appError.statusCode,
      code: appError.code,
      message: appError.message,
      timestamp: appError.timestamp,
      ...(req.requestId !== undefined && { requestId: req.requestId }),
      ...(appError.details !== undefined && { details: appError.details }),
    })
  }
}
