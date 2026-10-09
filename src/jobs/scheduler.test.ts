import { test, expect, jest, afterEach } from '@jest/globals'
import { createLogger } from '../core/logger'
import { createTaskScheduler } from './scheduler'

afterEach(() => {
  jest.useRealTimers()
})

test('задача не запускается сразу, а по истечении интервала', async () => {
  jest.useFakeTimers()

  let runs = 0
  const scheduler = createTaskScheduler({
    task: async () => {
      runs++
    },
    intervalMs: 1000,
    logger: createLogger({ level: 'silent' }),
  })

  scheduler.start()
  expect(runs).toBe(0)

  await jest.advanceTimersByTimeAsync(999)
  expect(runs).toBe(0)

  await jest.advanceTimersByTimeAsync(1)
  expect(runs).toBe(1)

  await jest.advanceTimersByTimeAsync(1000)
  expect(runs).toBe(2)

  await scheduler.stop()
})

test('повторный вызов во время выполнения не накладывается', async () => {
  jest.useFakeTimers()

  let release!: () => void
  let runs = 0
  const scheduler = createTaskScheduler({
    task: () =>
      new Promise<void>((resolve) => {
        runs++
        release = resolve
      }),
    intervalMs: 1000,
    logger: createLogger({ level: 'silent' }),
  })

  const first = scheduler.runNow()
  expect(runs).toBe(1)

  await scheduler.runNow()
  await scheduler.runNow()
  expect(runs).toBe(1)

  release()
  await first
  await scheduler.stop()

  await jest.advanceTimersByTimeAsync(10_000)
  expect(runs).toBe(1)
})

test('стоп снимает таймер и не даёт новым запускам начаться', async () => {
  jest.useFakeTimers()

  let runs = 0
  const scheduler = createTaskScheduler({
    task: async () => {
      runs++
    },
    intervalMs: 1000,
    logger: createLogger({ level: 'silent' }),
  })

  scheduler.start()
  await jest.advanceTimersByTimeAsync(1000)
  expect(runs).toBe(1)

  await scheduler.stop()
  const stopped = runs

  await jest.advanceTimersByTimeAsync(60_000)
  expect(runs).toBe(stopped)
})

test('ошибка задачи не роняет планировщик, следующий интервал отрабатывает', async () => {
  jest.useFakeTimers()

  let shouldFail = true
  let runs = 0
  const scheduler = createTaskScheduler({
    task: async () => {
      runs++
      if (shouldFail) throw new Error('boom')
    },
    intervalMs: 1000,
    logger: createLogger({ level: 'silent' }),
  })

  await scheduler.runNow()
  expect(runs).toBe(1)

  shouldFail = false
  await jest.advanceTimersByTimeAsync(1000)
  expect(runs).toBe(2)

  await scheduler.stop()
})