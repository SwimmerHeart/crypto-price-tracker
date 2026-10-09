import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { test, expect, beforeAll, afterAll } from '@jest/globals'
import { openDatabase } from '../db/connection'
import { applyMigrations } from '../db/migrate'
import { JobRepository } from './job.repository'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')

let dir: string
let db: DatabaseSync
let repo: JobRepository

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crypto-price-tracker-jobs-'))
  db = openDatabase(path.join(dir, 'jobs.db'))
  applyMigrations(db, MIGRATIONS_DIR)
  repo = new JobRepository(db)
})

afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('start создаёт запуск со статусом running', () => {
  const id = repo.start()

  expect(id).toBeGreaterThan(0)
  const row = repo.latest()
  expect(row?.id).toBe(id)
  expect(row?.status).toBe('running')
  expect(row?.finished_at).toBeNull()
})

test('finish фиксирует успех с количеством символов и точек', () => {
  const id = repo.start()
  repo.finish(id, { status: 'success', symbolsCount: 3, pricePoints: 3 })

  const row = repo.latest()
  expect(row).toMatchObject({ id, status: 'success', symbols_count: 3, price_points: 3 })
  expect(row?.error).toBeNull()
  expect(row?.finished_at).toEqual(expect.any(Number))
})

test('finish фиксирует неуспех с текстом ошибки', () => {
  const id = repo.start()
  repo.finish(id, { status: 'failed', symbolsCount: 1, pricePoints: 0, error: 'timeout' })

  const row = repo.latest()
  expect(row?.status).toBe('failed')
  expect(row?.error).toBe('timeout')
})

test('list возвращает последние запуски по убыванию', () => {
  repo.start()
  repo.start()

  const rows = repo.list(2)
  expect(rows).toHaveLength(2)
  expect(rows[0]!.id).toBeGreaterThan(rows[1]!.id)
})