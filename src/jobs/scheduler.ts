import { createLogger, type Logger } from '../core/logger'

export interface TaskScheduler {
  start(): void
  runNow(): Promise<void>
  stop(): Promise<void>
}

export interface TaskSchedulerOptions {
  task: () => Promise<void>
  intervalMs: number
  logger?: Logger
}

export function createTaskScheduler(options: TaskSchedulerOptions): TaskScheduler {
  const logger = options.logger ?? createLogger()
  let timer: NodeJS.Timeout | null = null
  let running: Promise<void> | null = null
  let stopped = false

  function schedule(): void {
    if (stopped) return
    timer = setTimeout(() => {
      void tick()
    }, options.intervalMs)
  }

  async function tick(): Promise<void> {
    if (running) return

    running = (async () => {
      try {
        await options.task()
      } catch (error) {
        logger.error('задача планировщика упала', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      }
    })()

    try {
      await running
    } finally {
      running = null
      schedule()
    }
  }

  return {
    start(): void {
      stopped = false
      schedule()
    },
    runNow(): Promise<void> {
      return tick()
    },
    async stop(): Promise<void> {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (running) await running
    },
  }
}