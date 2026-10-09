import { Router } from 'express'
import type { CoinService } from '../services/coin.service'
import { toISO } from '../utils/time'

export function createCoinRouter(coinService: CoinService): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const coins = await coinService.list(req.user!.id)
    res.json(
      coins.map(({ id, symbol, name, last_updated_at }) => ({
        id,
        symbol,
        name,
        last_updated_at: toISO(last_updated_at),
      }))
    )
  })

  router.post('/', async (req, res) => {
    const coin = await coinService.add(req.user!.id, req.body?.symbol)
    res.status(201).json({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      last_updated_at: toISO(coin.last_updated_at),
    })
  })

  router.delete('/:symbol', async (req, res) => {
    await coinService.remove(req.user!.id, req.params.symbol)
    res.status(204).end()
  })

  return router
}
