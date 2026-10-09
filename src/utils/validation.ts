import { ValidationError } from '../core/errors'

const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}$/

export function parseSymbol(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError('поле symbol обязательно', {
      details: [
        { field: 'symbol', message: 'обязательное строковое поле', rule: 'required' },
      ],
    })
  }

  const normalized = value.trim().toUpperCase()

  if (!SYMBOL_PATTERN.test(normalized)) {
    throw new ValidationError(`недопустимый символ: "${normalized}"`, {
      details: [
        { field: 'symbol', message: 'допустимо: 1–10 латинских букв или цифр', rule: 'pattern' },
      ],
    })
  }

  return normalized
}

export function parseLimit(value: unknown, max = 1000, fallback = 100): number {
  if (value === undefined) return fallback

  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ValidationError('параметр limit невалиден', {
      details: [{ field: 'limit', message: `целое число от 1 до ${max}`, rule: 'range' }],
    })
  }

  return n
}

export function parseOptionalISO(value: unknown, field: string): number | undefined {
  if (value === undefined || value === '') return undefined

  if (typeof value !== 'string') {
    throw new ValidationError(`параметр ${field} невалиден`, {
      details: [{ field, message: 'ожидается строка ISO 8601', rule: 'iso8601' }],
    })
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`параметр ${field} невалиден`, {
      details: [
        {
          field,
          message: 'ожидается ISO 8601, например 2026-10-09T00:00:00.000Z',
          rule: 'iso8601',
        },
      ],
    })
  }

  return parsed
}
