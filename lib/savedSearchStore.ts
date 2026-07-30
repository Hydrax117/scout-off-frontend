/**
 * savedSearchStore — SQLite-backed persistence for scouts' saved player
 * searches. Mirrors lib/adminAuditStore.ts's conventions: one table with
 * idempotent `CREATE TABLE IF NOT EXISTS` DDL run on construction, a
 * process-wide singleton, DB bootstrap shared via lib/sqliteDb.ts. `filter`
 * is stored as a JSON column, same pattern as adminAuditStore's `data` field.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import type { PlayerFilter, SavedSearch } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS saved_search (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scout_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  filter TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_search_scout_wallet ON saved_search(scout_wallet);
`;

interface SavedSearchRow {
  id: number;
  scout_wallet: string;
  name: string;
  filter: string;
  created_at: number;
}

function rowToEntry(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    scoutWallet: row.scout_wallet,
    name: row.name,
    filter: JSON.parse(row.filter),
    createdAt: row.created_at,
  };
}

export class SavedSearchStore {
  private static _instance: SavedSearchStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): SavedSearchStore {
    if (!SavedSearchStore._instance) {
      SavedSearchStore._instance = new SavedSearchStore(
        openSqliteDb('saved-search.db', 'SAVED_SEARCH_DB_PATH'),
      );
    }
    return SavedSearchStore._instance;
  }

  rename(scoutWallet: string, id: number, newName: string): SavedSearch | null {
    const result = this.db
      .prepare(
        'UPDATE saved_search SET name = ? WHERE id = ? AND scout_wallet = ?',
      )
      .run(newName, id, scoutWallet);
    if (result.changes === 0) return null;

    const row = this.db
      .prepare('SELECT * FROM saved_search WHERE id = ?')
      .get(id) as SavedSearchRow;
    return rowToEntry(row);
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (SavedSearchStore._instance) {
      SavedSearchStore._instance.db.close();
    }
    SavedSearchStore._instance = null;
  }

  add(scoutWallet: string, name: string, filter: PlayerFilter): SavedSearch {
    const result = this.db
      .prepare(
        `INSERT INTO saved_search (scout_wallet, name, filter, created_at)
         VALUES (@scout_wallet, @name, @filter, @created_at)`,
      )
      .run({
        scout_wallet: scoutWallet,
        name,
        filter: JSON.stringify(filter),
        created_at: Date.now(),
      });

    const row = this.db
      .prepare('SELECT * FROM saved_search WHERE id = ?')
      .get(result.lastInsertRowid) as SavedSearchRow;
    return rowToEntry(row);
  }

  /** Deletes an entry scoped to its owner. Returns false if not found or not owned by scoutWallet. */
  remove(scoutWallet: string, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM saved_search WHERE id = ? AND scout_wallet = ?')
      .run(id, scoutWallet);
    return result.changes > 0;
  }

  list(scoutWallet: string): SavedSearch[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM saved_search WHERE scout_wallet = ? ORDER BY created_at DESC, id DESC',
      )
      .all(scoutWallet) as SavedSearchRow[];
    return rows.map(rowToEntry);
  }

  close(): void {
    this.db.close();
  }
}
