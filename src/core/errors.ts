export interface ErrorContext {
  [key: string]: unknown
}

export interface ValidationErrorDetail {
  field: string
  message: string
  rule?: string
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly timestamp: string
  public requestId?: string
  public readonly context?: ErrorContext
  public readonly details?: unknown
  public readonly isOperational: boolean

  constructor(
    message: string,
    statusCode: number,
    code: string,
    options?: {
      context?: ErrorContext;
      details?: unknown;
      isOperational?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, {
      cause: options?.cause
    })

    this.name = new.target.name

    this.statusCode = statusCode
    this.code = code
    this.timestamp = new Date().toISOString()
    this.context = options?.context
    this.details = options?.details
    this.isOperational = options?.isOperational ?? true

    Error.captureStackTrace(this, new.target)
  }

  toJSON(): Record<string, unknown> {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      ...(this.requestId !== undefined && { requestId: this.requestId }),
      ...(this.details !== undefined && { details: this.details }),
    }
  }
}

export class ValidationError extends AppError {
  declare public readonly details?: ValidationErrorDetail[]

  constructor(
    message: string,
    options?: {
      context?: ErrorContext
      details?: ValidationErrorDetail[]
      cause?: unknown
    }
  ) {
    super(message, 400, 'VALIDATION_ERROR', { ...options })
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message: string,
    options?: {
      context?: ErrorContext
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, 401, 'AUTHENTICATION_ERROR', { ...options })
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string,
    options?: {
      context?: ErrorContext
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, 404, 'NOT_FOUND', { ...options })
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    options?: {
      context?: ErrorContext
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, 409, 'CONFLICT', { ...options })
  }
}

export class UpstreamError extends AppError {
  public readonly upstreamCode?: string | number
  public readonly retryable: boolean

  constructor(
    message: string,
    options?: {
      upstreamCode?: string | number
      retryable?: boolean
      context?: ErrorContext
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, 502, 'UPSTREAM_ERROR', { ...options })

    this.upstreamCode = options?.upstreamCode
    this.retryable = options?.retryable ?? true
  }
}

export class InternalError extends AppError {
  constructor(
    message: string,
    options?: {
      context?: ErrorContext
      details?: unknown
      cause?: unknown
    }
  ) {
    super(message, 500, 'INTERNAL_ERROR', { ...options, isOperational: false })
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err

  return new InternalError('Internal server error', { cause: err })
}
