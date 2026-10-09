import { DatabaseSync } from 'node:sqlite'
import type { SyncJobRow, SyncJobStatus } from '../core/types'

export interface JobOutcome {
  status: Exclude<SyncJobStatus, 'running'>
  symbolsCount: number
  pricePoints: number
  error?: string
}

export class JobRepository {
  constructor(private readonly db: DatabaseSync) {}

  start(): number {
    const result = this.db
      .prepare('INSERT INTO sync_jobs (started_at, status) VALUES (?, ?)')
      .run(Date.now(), 'running')

    return Number(result.lastInsertRowid)
  }

  finish(id: number, outcome: JobOutcome): void {
    this.db
      .prepare(
        'UPDATE sync_jobs SET finished_at = ?, status = ?, symbols_count = ?, price_points = ?, error = ? WHERE id = ?'
      )
      .run(
        Date.now(),
        outcome.status,
        outcome.symbolsCount,
        outcome.pricePoints,
        outcome.error ?? null,
        id
      )
  }

  latest(): SyncJobRow | undefined {
    const row = this.db
      .prepare(
        'SELECT id, started_at, finished_at, status, symbols_count, price_points, error FROM sync_jobs ORDER BY id DESC LIMIT 1'
      )
      .get() as unknown as SyncJobRow | undefined

    return row
  }

  list(limit = 20): SyncJobRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, started_at, finished_at, status, symbols_count, price_points, error FROM sync_jobs ORDER BY id DESC LIMIT ?'
      )
      .all(limit) as unknown as SyncJobRow[]

    return rows
  }
}