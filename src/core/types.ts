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
  last_updated_at: number | null
  created_at: number
}
