import { test, expect, beforeEach, afterEach } from '@jest/globals'
import request from 'supertest'
import type { CmcQuote } from '../clients/coinmarketcap.client'
import { PriceRepository } from '../repositories/price.repository'
import { createTestContext, type TestContext } from '../testing/app.factory'

const BULK_QUOTES: Record<string, CmcQuote> = {
  BTC: { id: 1, symbol: 'BTC', name: 'Bitcoin', price: 97_000 },
  ETH: { id: 1027, symbol: 'ETH', name: 'Ethereum', price: 3_400 },
}

const T0 = Date.parse('2026-10-09T10:00:00.000Z')
const T1 = Date.parse('2026-10-09T10:05:00.000Z')
const T2 = Date.parse('2026-10-09T10:10:00.000Z')

let ctx: TestContext
let priceRepo: PriceRepository

beforeEach(() => {
  ctx = createTestContext(BULK_QUOTES)
  priceRepo = new PriceRepository(ctx.db)
})

afterEach(() => {
  ctx.close()
})

function seedPrices(): void {
  priceRepo.insert('BTC', 95_000, 'USD', T0)
  priceRepo.insert('BTC', 97_000, 'USD', T1)
  priceRepo.insert('BTC', 96_000, 'USD', T2)
}

test('GET /coins/:symbol/price без ключа даёт 401', async () => {
  const res = await request(ctx.app).get('/coins/BTC/price').expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('GET /coins/:symbol/price неотслеживаемого символа даёт 404', async () => {
  const key = await ctx.register()

  const res = await request(ctx.app)
    .get('/coins/BTC/price')
    .set('Authorization', `Bearer ${key}`)
    .expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
})

test('GET /coins/:symbol/price без собранной цены даёт 404', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)

  const res = await request(ctx.app)
    .get('/coins/BTC/price')
    .set('Authorization', `Bearer ${key}`)
    .expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
  expect(res.body.message).toContain('пока не собрана')
})

test('GET /coins/:symbol/price отдаёт последнюю цену из истории', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)
  seedPrices()

  const res = await request(ctx.app)
    .get('/coins/BTC/price')
    .set('Authorization', `Bearer ${key}`)
    .expect(200)

  expect(res.body).toMatchObject({ symbol: 'BTC', price: 96_000, currency: 'USD' })
  expect(new Date(res.body.fetched_at).getTime()).toBe(T2)
})

test('GET /coins/:symbol/history без ключа даёт 401', async () => {
  const res = await request(ctx.app).get('/coins/BTC/history').expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('GET /coins/:symbol/history неотслеживаемого символа даёт 404', async () => {
  const key = await ctx.register()

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .set('Authorization', `Bearer ${key}`)
    .expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
})

test('GET /coins/:symbol/history с битым from даёт 400', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .query({ from: 'не-дата' })
    .set('Authorization', `Bearer ${key}`)
    .expect(400)

  expect(res.body.code).toBe('VALIDATION_ERROR')
  expect(res.body.details[0].field).toBe('from')
})

test('GET /coins/:symbol/history с limit вне диапазона даёт 400', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)

  for (const limit of ['0', '1001', 'abc']) {
    const res = await request(ctx.app)
      .get('/coins/BTC/history')
      .query({ limit })
      .set('Authorization', `Bearer ${key}`)
      .expect(400)

    expect(res.body.code).toBe('VALIDATION_ERROR')
  }
})

test('GET /coins/:symbol/history с перевёрнутым диапазоном даёт 400', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .query({ from: '2026-10-09T11:00:00.000Z', to: '2026-10-09T09:00:00.000Z' })
    .set('Authorization', `Bearer ${key}`)
    .expect(400)

  expect(res.body.code).toBe('VALIDATION_ERROR')
})

test('GET /coins/:symbol/history отдаёт точки по убыванию и метрики', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)
  seedPrices()

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .set('Authorization', `Bearer ${key}`)
    .expect(200)

  expect(res.body.symbol).toBe('BTC')
  expect(res.body.currency).toBe('USD')

  expect(res.body.items.map((item: { price: number }) => item.price)).toEqual([96_000, 97_000, 95_000])
  expect(new Date(res.body.items[0].fetched_at).getTime()).toBe(T2)

  expect(res.body.metrics).toMatchObject({ count: 3, min: 95_000, max: 97_000, avg: 96_000 })
  expect(res.body.metrics.first_fetched_at).toBe('2026-10-09T10:00:00.000Z')
  expect(res.body.metrics.last_fetched_at).toBe('2026-10-09T10:10:00.000Z')
})

test('GET /coins/:symbol/history фильтрует диапазон и ограничивает выборку', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)
  seedPrices()

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .query({ from: '2026-10-09T10:04:00.000Z', to: '2026-10-09T10:11:00.000Z', limit: '1' })
    .set('Authorization', `Bearer ${key}`)
    .expect(200)

  expect(res.body.items).toHaveLength(1)
  expect(res.body.items[0].price).toBe(96_000)
  expect(res.body.metrics.count).toBe(2)
  expect(res.body.limit).toBe(1)
  expect(res.body.from).toBe('2026-10-09T10:04:00.000Z')
  expect(res.body.to).toBe('2026-10-09T10:11:00.000Z')
})

test('GET /coins/:symbol/history без накопленных точек отдаёт 200 с пустой выборкой', async () => {
  const key = await ctx.register()
  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'BTC' })
    .expect(201)

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .set('Authorization', `Bearer ${key}`)
    .expect(200)

  expect(res.body.items).toEqual([])
  expect(res.body.metrics).toEqual({
    count: 0,
    min: null,
    max: null,
    avg: null,
    first_fetched_at: null,
    last_fetched_at: null,
  })
})

test('история пользователя ограничена его подпиской', async () => {
  const alice = await ctx.register()
  const bob = await ctx.register()

  await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${alice}`)
    .send({ symbol: 'BTC' })
    .expect(201)
  seedPrices()

  const res = await request(ctx.app)
    .get('/coins/BTC/history')
    .set('Authorization', `Bearer ${bob}`)
    .expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
})