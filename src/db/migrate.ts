import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function applyMigrations(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)

  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  const selectStmt = db.prepare('SELECT version FROM schema_migrations')
  const appliedRows = selectStmt.all() as { version: string }[]

  const appliedVersions = new Set(appliedRows.map(row => row.version))
  const newlyApplied: string[] = []

  const insertStmt = db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`)

  for (const file of files) {
    const version = path.basename(file, '.sql')
    if (appliedVersions.has(version)) continue

    const sqlContent = readFileSync(path.join(migrationsDir, file), 'utf8')

    db.exec('BEGIN')
    try {
      db.exec(sqlContent)
      insertStmt.run(version, Date.now())
      db.exec('COMMIT')
      newlyApplied.push(version)
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return newlyApplied
}
