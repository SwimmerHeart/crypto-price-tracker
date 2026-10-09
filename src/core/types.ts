export interface UserRow {
  id: number
  api_key_hash: string
  created_at: number
}

export interface CoinRow {
  id: number
  user_id: number
  symbol: string
  name: string
  last_updated_at: number
  created_at: number
}

export interface PriceRow {
  symbol: string
  price: number
  currency: string
  fetched_at: number
}

export type SyncJobStatus = 'running' | 'success' | 'failed'

export interface SyncJobRow {
  id: number
  started_at: number
  finished_at: number | null
  status: SyncJobStatus
  symbols_count: number
  price_points: number
  error: string | null
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string
      user?: UserRow
    }
  }
}
