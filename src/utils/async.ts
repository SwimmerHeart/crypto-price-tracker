export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RetryOptions {
  retries: number
  baseDelayMs: number
  shouldRetry: (error: unknown) => boolean
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attempt = 0

  for (;;) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= options.retries || !options.shouldRetry(error)) {
        throw error
      }

      attempt += 1
      await sleep(options.baseDelayMs * 2 ** (attempt - 1))
    }
  }
}