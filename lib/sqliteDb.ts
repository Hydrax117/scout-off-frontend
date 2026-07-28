/**
 * Shared better-sqlite3 bootstrap for off-chain, per-scout stores (watchlist,
 * saved searches). Mirrors lib/adminAuditStore.ts's DB-open conventions
 * (idempotent schema, WAL journal mode, `:memory:` in tests) without
 * repeating that boilerplate in every store.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export function openSqliteDb(
  defaultFilename: string,
  envVar: string,
): Database.Database {
  const dbPath =
    process.env[envVar] ??
    (process.env.NODE_ENV === 'test'
      ? ':memory:'
      : path.join(process.cwd(), 'data', defaultFilename));

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  return db;
}
