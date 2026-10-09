import { Router } from 'express'
import type { PriceService } from '../services/price.service'
import { toISO } from '../utils/time'

export function createPriceRouter(priceService: PriceService): Router {
  const router = Router()

  router.get('/:symbol/price', async (req, res) => {
    const price = priceService.current(req.user!.id, req.params.symbol)

    res.json({
      symbol: price.symbol,
      price: price.price,
      currency: price.currency,
      fetched_at: toISO(price.fetched_at),
    })
  })

  router.get('/:symbol/history', async (req, res) => {
    const result = priceService.history(req.user!.id, req.params.symbol, {
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
    })

    res.json({
      symbol: result.symbol,
      currency: result.currency,
      limit: result.limit,
      ...(result.from !== undefined && { from: toISO(result.from) }),
      ...(result.to !== undefined && { to: toISO(result.to) }),
      items: result.items.map((item) => ({
        price: item.price,
        fetched_at: toISO(item.fetched_at),
      })),
      metrics: {
        count: result.metrics.count,
        min: result.metrics.min,
        max: result.metrics.max,
        avg: result.metrics.avg,
        first_fetched_at:
          result.metrics.first_fetched_at !== null ? toISO(result.metrics.first_fetched_at) : null,
        last_fetched_at:
          result.metrics.last_fetched_at !== null ? toISO(result.metrics.last_fetched_at) : null,
      },
    })
  })

  return router
}