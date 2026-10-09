import { test, expect, beforeEach, afterEach } from '@jest/globals'
import request from 'supertest'
import type { CmcQuote } from '../clients/coinmarketcap.client'
import { createTestContext, type TestContext } from '../testing/app.factory'

const BULK_QUOTES: Record<string, CmcQuote> = {
  BTC: { id: 1, symbol: 'BTC', name: 'Bitcoin', price: 97_000 },
  ETH: { id: 1027, symbol: 'ETH', name: 'Ethereum', price: 3_400 },
}

let ctx: TestContext

beforeEach(() => {
  ctx = createTestContext(BULK_QUOTES)
})

afterEach(() => {
  ctx.close()
})

test('GET /health отвечает ok и timestamp', async () => {
  const res = await request(ctx.app).get('/health').expect(200)

  expect(res.body.status).toBe('ok')
  expect(new Date(res.body.timestamp).getTime()).not.toBeNaN()
})

test('POST /health даёт 404', async () => {
  await request(ctx.app).post('/health').expect(404)
})

test('POST /auth/register выдаёт apiKey, который проходит аутентификацию', async () => {
  const key = await ctx.register()

  expect(key).toMatch(/^[a-f0-9]{64}$/)

  const res = await request(ctx.app).get('/coins').set('Authorization', `Bearer ${key}`).expect(200)
  expect(res.body).toEqual([])
})

test('GET /auth/register даёт 404', async () => {
  await request(ctx.app).get('/auth/register').expect(404)
})

test('GET /coins без ключа даёт 401', async () => {
  const res = await request(ctx.app).get('/coins').expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('GET /coins с несуществующим ключом даёт 401', async () => {
  const badKey = 'b'.repeat(64)

  const res = await request(ctx.app).get('/coins').set('Authorization', `Bearer ${badKey}`).expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('GET /coins с заголовком без токена даёт 401', async () => {
  await request(ctx.app).get('/coins').set('Authorization', 'Bearer').expect(401)
})

test('POST /coins с недопустимым символом даёт 400 с details', async () => {
  const key = await ctx.register()

  const res = await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'btc!' })
    .expect(400)

  expect(res.body.code).toBe('VALIDATION_ERROR')
  expect(res.body.details).toEqual([
    { field: 'symbol', message: 'допустимо: 1–10 латинских букв или цифр', rule: 'pattern' },
  ])
})

test('POST /coins с неизвестным символом даёт 404', async () => {
  const key = await ctx.register()

  const res = await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'NOPE' })
    .expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
})

test('POST + GET: добавленная монета видна в списке', async () => {
  const key = await ctx.register()

  const created = await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'btc' })
    .expect(201)

  expect(created.body).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' })
  expect(new Date(created.body.last_updated_at).getTime()).not.toBeNaN()

  const list = await request(ctx.app).get('/coins').set('Authorization', `Bearer ${key}`).expect(200)
  expect(list.body).toEqual([created.body])
})

test('дубликат POST /coins даёт 409', async () => {
  const key = await ctx.register()

  await request(ctx.app).post('/coins').set('Authorization', `Bearer ${key}`).send({ symbol: 'BTC' }).expect(201)

  const res = await request(ctx.app)
    .post('/coins')
    .set('Authorization', `Bearer ${key}`)
    .send({ symbol: 'btc' })
    .expect(409)

  expect(res.body.code).toBe('CONFLICT')
})

test('DELETE удаляет монету, повторный DELETE даёт 404', async () => {
  const key = await ctx.register()

  await request(ctx.app).post('/coins').set('Authorization', `Bearer ${key}`).send({ symbol: 'ETH' }).expect(201)

  await request(ctx.app).delete('/coins/ETH').set('Authorization', `Bearer ${key}`).expect(204)

  const list = await request(ctx.app).get('/coins').set('Authorization', `Bearer ${key}`).expect(200)
  expect(list.body).toEqual([])

  const res = await request(ctx.app).delete('/coins/ETH').set('Authorization', `Bearer ${key}`).expect(404)
  expect(res.body.code).toBe('NOT_FOUND')
})

test('DELETE неотслеживаемого символа даёт 404', async () => {
  const key = await ctx.register()

  const res = await request(ctx.app).delete('/coins/DOGE').set('Authorization', `Bearer ${key}`).expect(404)

  expect(res.body.code).toBe('NOT_FOUND')
})

test('POST /coins без ключа даёт 401', async () => {
  const res = await request(ctx.app).post('/coins').send({ symbol: 'BTC' }).expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('DELETE /coins/:symbol без ключа даёт 401', async () => {
  const res = await request(ctx.app).delete('/coins/BTC').expect(401)

  expect(res.body.code).toBe('AUTHENTICATION_ERROR')
})

test('монеты одного пользователя не видны другому', async () => {
  const alice = await ctx.register()
  const bob = await ctx.register()

  await request(ctx.app).post('/coins').set('Authorization', `Bearer ${alice}`).send({ symbol: 'BTC' }).expect(201)

  const bobList = await request(ctx.app).get('/coins').set('Authorization', `Bearer ${bob}`).expect(200)
  expect(bobList.body).toEqual([])
})