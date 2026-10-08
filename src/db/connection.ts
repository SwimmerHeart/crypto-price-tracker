import { DatabaseSync } from 'node:sqlite'

export function openDatabase(path: string): DatabaseSync {
  if (!path.trim()) throw new Error('openDatabase: path не должен быть пустой строкой')

  const db = new DatabaseSync(path)

  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')

  return db
}
