import { test, expect, jest } from '@jest/globals'
import type { AxiosInstance } from 'axios'
import {
  NotFoundError,
  UpstreamError,
  ValidationError,
} from '../core/errors'
import { createCmcClient, type CmcClient } from './coinmarketcap.client'

const BASE_URL = 'https://pro-api.coinmarketcap.com'
const API_KEY = 'test-key'

interface HttpGetMock extends jest.Mock {
  mockResolvedValue(value: unknown): this
  mockResolvedValueOnce(value: unknown): this
  mockRejectedValue(value: unknown): this
  mockRejectedValueOnce(value: unknown): this
}

interface Setup {
  client: CmcClient
  get: HttpGetMock
}

function makeClient(overrides: Record<string, unknown> = {}): Setup {
  const get = jest.fn() as unknown as HttpGetMock
  const http = { get } as unknown as AxiosInstance
  const client = createCmcClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    timeoutMs: 5000,
    baseDelayMs: 1,
    http,
    ...overrides,
  })
  return { client, get }
}

function axiosErr(
  status: number | undefined,
  body?: unknown,
  code?: string
): Error {
  const err: Record<string, unknown> = { isAxiosError: true }

  if (status === undefined) {
    err.code = code ?? 'ECONNABORTED'
  } else {
    err.response = { status, data: body }
  }

  return err as unknown as Error
}

function coin(
  id: number,
  symbol: string,
  name: string,
  price: number | null
): object {
  return {
    id,
    symbol,
    name,
    quote: [{ symbol: 'USD', price }],
  }
}

function responseBody(data: object[], stale: Record<string, unknown> = {}): object {
  return { status: { error_code: '0', ...stale }, data }
}

test('возвращает каноническую запись на каждый символ одним запросом', async () => {
  const { client, get } = makeClient()
  get.mockResolvedValue({
    data: responseBody([
      coin(38133, 'BTC', 'Bitcoin AI', 0.0013),
      coin(1, 'BTC', 'Bitcoin', 81558.95),
      coin(1027, 'ETH', 'Ethereum', 4000.12),
      coin(52, 'XRP', 'XRP', 1.36),
    ]),
  })

  const result = await client.getLatestQuotes(['BTC', 'ETH', 'XRP'])

  expect(result).toEqual([
    { id: 1, name: 'Bitcoin', symbol: 'BTC', price: 81558.95 },
    { id: 1027, name: 'Ethereum', symbol: 'ETH', price: 4000.12 },
    { id: 52, name: 'XRP', symbol: 'XRP', price: 1.36 },
  ])
  expect(get).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledWith('/v3/cryptocurrency/quotes/latest', {
    params: { symbol: 'BTC,ETH,XRP', convert: 'USD' },
  })
})

test('пустой ответ data считает несуществующими все символы', async () => {
  const { client, get } = makeClient()
  get.mockResolvedValue({ data: responseBody([]) })

  await expect(client.getLatestQuotes(['NOPE'])).rejects.toThrow(NotFoundError)
})

test('частично ненайденные символы перечисляются в ошибке', async () => {
  const { client, get } = makeClient()
  get.mockResolvedValue({
    data: responseBody([coin(1, 'BTC', 'Bitcoin', 100.5)]),
  })

  await expect(client.getLatestQuotes(['BTC', 'NOPE'])).rejects.toThrow(
    'символы не найдены: NOPE'
  )
})

test('отбрасывает записи с null-ценой при выборе канона', async () => {
  const { client, get } = makeClient()
  get.mockResolvedValue({
    data: responseBody([
      coin(30938, 'BTC', 'Satoshi Pumpomoto', null),
      coin(1, 'BTC', 'Bitcoin', 100.5),
    ]),
  })

  const result = await client.getLatestQuotes(['BTC'])

  expect(result).toEqual([{ id: 1, name: 'Bitcoin', symbol: 'BTC', price: 100.5 }])
})

test('error_code числом нормализуется и не утекает наружу', async () => {
  const { client, get } = makeClient()
  get.mockRejectedValue(
    axiosErr(403, {
      status: {
        error_code: 1005,
        error_message: 'An API Key is required for this call.',
      },
    })
  )

  let error: UpstreamError | undefined
  try {
    await client.getLatestQuotes(['BTC'])
  } catch (err) {
    error = err as UpstreamError
  }

  expect(error).toBeInstanceOf(UpstreamError)
  expect(error?.upstreamCode).toBe(1005)
  expect(error?.retryable).toBe(false)
  expect(error?.message).toContain('An API Key is required')
  expect(get).toHaveBeenCalledTimes(1)
})

test('429 повторяется с задержкой, затем успех', async () => {
  const { client, get } = makeClient()
  get
    .mockRejectedValueOnce(axiosErr(429, { status: { error_code: '1008' } }))
    .mockRejectedValueOnce(axiosErr(429, { status: { error_code: '1008' } }))
    .mockRejectedValueOnce(axiosErr(429, { status: { error_code: '1008' } }))
    .mockResolvedValue({ data: responseBody([coin(1, 'BTC', 'Bitcoin', 100.5)]) })

  const result = await client.getLatestQuotes(['BTC'])

  expect(result).toHaveLength(1)
  expect(get).toHaveBeenCalledTimes(4)
})

test('исчерпание повторов на 429 бросает retryable UpstreamError', async () => {
  const { client, get } = makeClient()
  get.mockRejectedValue(axiosErr(429, { status: { error_code: '1008' } }))

  let error: UpstreamError | undefined
  try {
    await client.getLatestQuotes(['BTC'])
  } catch (err) {
    error = err as UpstreamError
  }

  expect(error).toBeInstanceOf(UpstreamError)
  expect(error?.retryable).toBe(true)
  expect(error?.upstreamCode).toBe(1008)
  expect(get).toHaveBeenCalledTimes(4)
})

test('401 не повторяется', async () => {
  const { client, get } = makeClient()
  get.mockRejectedValue(
    axiosErr(401, { status: { error_code: '1001', error_message: 'invalid key' } })
  )

  let error: UpstreamError | undefined
  try {
    await client.getLatestQuotes(['BTC'])
  } catch (err) {
    error = err as UpstreamError
  }

  expect(error).toBeInstanceOf(UpstreamError)
  expect(error?.retryable).toBe(false)
  expect(error?.upstreamCode).toBe(1001)
  expect(get).toHaveBeenCalledTimes(1)
})

test('сетевой сбой повторяется, финал — retryable UpstreamError', async () => {
  const { client, get } = makeClient()
  get.mockRejectedValue(axiosErr(undefined))

  let error: UpstreamError | undefined
  try {
    await client.getLatestQuotes(['BTC'])
  } catch (err) {
    error = err as UpstreamError
  }

  expect(error).toBeInstanceOf(UpstreamError)
  expect(error?.retryable).toBe(true)
  expect(get).toHaveBeenCalledTimes(4)
})

test('пустой список символов — ValidationError, запроса нет', async () => {
  const { client, get } = makeClient()

  await expect(client.getLatestQuotes([])).rejects.toThrow(ValidationError)
  expect(get).not.toHaveBeenCalled()
})