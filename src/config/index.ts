export const config = {
  port: Number(process.env.PORT ?? 3000),
  cmcApiKey: process.env.CMC_API_KEY,
  cmcBaseUrl: process.env.CMC_BASE_URL ?? 'https://pro-api.coinmarketcap.com',
  cmcTimeoutMs: Number(process.env.CMC_TIMEOUT_MS ?? 10_000),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 300_000),
  currency: process.env.CURRENCY ?? 'USD',
}
