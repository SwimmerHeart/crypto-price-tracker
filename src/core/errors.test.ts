import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  UpstreamError,
  InternalError,
  toAppError,
} from './errors'
import { test, expect } from '@jest/globals'

test('заполняет statusCode, code, timestamp и ставит isOperational по умолчанию', () => {
  const err = new AppError('плохо', 418, 'TEAPOT')

  expect(err.statusCode).toBe(418)
  expect(err.code).toBe('TEAPOT')
  expect(err.message).toBe('плохо')
  expect(err.timestamp).toEqual(expect.any(String))
  expect(err.isOperational).toBe(true)
  expect(err.name).toBe('AppError')
})

test('toJSON отдаёт только поля контракта ответа', () => {
  const err = new AppError('плохо', 418, 'TEAPOT')
  const body = err.toJSON()

  expect(body).toEqual({
    statusCode: 418,
    code: 'TEAPOT',
    message: 'плохо',
    timestamp: expect.any(String)
  })
})

test('toJSON не отдаёт context — он только для лога', () => {
  const err = new AppError('плохо', 500, 'X', { context: { userId: 7 } })

  expect('context' in err.toJSON()).toBe(false)
  expect(err.context).toEqual({ userId: 7 })
});

test('toJSON не отдаёт name и isOperational', () => {
  const body = new InternalError('внутренняя').toJSON()

  expect('name' in body).toBe(false)
  expect('isOperational' in body).toBe(false)
})

test('toJSON не маскирует сообщение внутренней ошибки', () => {
  const body = new InternalError('SQL syntax near ...').toJSON()

  expect(body.message).toBe('SQL syntax near ...')
})

test('toJSON включает requestId и details только если они заданы', () => {
  const err = new AppError('x', 400, 'X')
  expect('requestId' in err.toJSON()).toBe(false)
  expect('details' in err.toJSON()).toBe(false)

  err.requestId = 'abc'
  expect(err.toJSON().requestId).toBe('abc')
})

test('cause пробрасывается в Error', () => {
  const cause = new Error('оригинал')
  const err = new AppError('обёртка', 500, 'X', { cause })

  expect(err.cause).toBe(cause)
})

test('подклассы несут свои statusCode и code', () => {
  expect(new ValidationError('x')).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  expect(new AuthenticationError('x')).toMatchObject({ statusCode: 401, code: 'AUTHENTICATION_ERROR' })
  expect(new NotFoundError('x')).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  expect(new ConflictError('x')).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  expect(new InternalError('x')).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
})

test('UpstreamError фиксирует 502/UPSTREAM_ERROR без обязательных аргументов', () => {
  const err = new UpstreamError('CoinMarketCap недоступен')

  expect(err.statusCode).toBe(502)
  expect(err.code).toBe('UPSTREAM_ERROR')
  expect(err.retryable).toBe(true)
  expect(err.upstreamCode).toBeUndefined()
})

test('UpstreamError сохраняет код внешней стороны и retryable', () => {
  const err = new UpstreamError('лимит', { upstreamCode: '1005', retryable: false })

  expect(err.upstreamCode).toBe('1005')
  expect(err.retryable).toBe(false)
  expect(err.toJSON().statusCode).toBe(502)
})

test('InternalError — единственная неоперационная', () => {
  expect(new InternalError('x').isOperational).toBe(false)
  expect(new ValidationError('x').isOperational).toBe(true)
  expect(new UpstreamError('x').isOperational).toBe(true)
})

test('ValidationError принимает массив details', () => {
  const details = [
    { field: 'symbol', message: 'обязательное поле', rule: 'required' },
    { field: 'symbol', message: 'слишком длинное', rule: 'maxLength' },
  ]
  const err = new ValidationError('невалидный запрос', { details })

  expect(err.details).toEqual(details)
  expect(err.toJSON().details).toEqual(details)
  expect(Array.isArray(err.details)).toBe(true)
})

test('name подкласса совпадает с именем класса', () => {
  expect(new ValidationError('x').name).toBe('ValidationError')
  expect(new UpstreamError('x').name).toBe('UpstreamError')
  expect(new NotFoundError('x').name).toBe('NotFoundError')
})

test('toAppError возвращает ту же ошибку, если это уже AppError', () => {
  const original = new NotFoundError('нет')

  expect(toAppError(original)).toBe(original)
})

test('toAppError оборачивает неизвестное в InternalError с isOperational false', () => {
  const err = toAppError(new TypeError('undefined is not a function'))

  expect(err).toBeInstanceOf(InternalError)
  expect(err.isOperational).toBe(false)
  expect(err.statusCode).toBe(500)
  expect(err.message).toBe('Internal server error')
  expect(err.cause).toBeInstanceOf(TypeError)
})

test('toAppError оборачивает даже строку', () => {
  const err = toAppError('просто строка')

  expect(err).toBeInstanceOf(InternalError)
  expect(err.cause).toBe('просто строка')
})
