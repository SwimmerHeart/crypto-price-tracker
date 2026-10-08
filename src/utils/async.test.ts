import { test, expect, jest } from '@jest/globals'
import { retryWithBackoff } from './async'

test('повторяет попытки и возвращает результат, когда сбой временный', async () => {
  let calls = 0

  const result = await retryWithBackoff(
    async () => {
      calls += 1
      if (calls < 3) throw new Error('временный сбой')
      return 'ok'
    },
    { retries: 3, baseDelayMs: 1, shouldRetry: () => true }
  )

  expect(result).toBe('ok')
  expect(calls).toBe(3)
})

test('не повторяет ошибку, для которой shouldRetry вернул false', async () => {
  const fn = jest.fn(async (): Promise<string> => {
    throw new Error('фатальная ошибка')
  })

  await expect(
    retryWithBackoff(fn, { retries: 5, baseDelayMs: 1, shouldRetry: () => false })
  ).rejects.toThrow('фатальная ошибка')

  expect(fn).toHaveBeenCalledTimes(1)
})

test('после исчерпания попыток бросает последнюю ошибку', async () => {
  let calls = 0

  await expect(
    retryWithBackoff(
      async (): Promise<string> => {
        calls += 1
        throw new Error('не проходит')
      },
      { retries: 2, baseDelayMs: 1, shouldRetry: () => true }
    )
  ).rejects.toThrow('не проходит')

  expect(calls).toBe(3)
})