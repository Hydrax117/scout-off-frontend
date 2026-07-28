/**
 * watchlistStore — SQLite-backed persistence for scouts' player watchlists.
 * Mirrors lib/adminAuditStore.ts's conventions: one table with idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL run on construction, a process-wide
 * singleton, DB bootstrap shared via lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import type { WatchlistEntry } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scout_wallet TEXT NOT NULL,
  player_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(scout_wallet, player_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_scout_wallet ON watchlist(scout_wallet);
`;

interface WatchlistRow {
  id: number;
  scout_wallet: string;
  player_id: string;
  created_at: number;
}

function rowToEntry(row: WatchlistRow): WatchlistEntry {
  return {
    id: row.id,
    scoutWallet: row.scout_wallet,
    playerId: row.player_id,
    createdAt: row.created_at,
  };
}

export class WatchlistStore {
  private static _instance: WatchlistStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): WatchlistStore {
    if (!WatchlistStore._instance) {
      WatchlistStore._instance = new WatchlistStore(
        openSqliteDb('watchlist.db', 'WATCHLIST_DB_PATH'),
      );
    }
    return WatchlistStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (WatchlistStore._instance) {
      WatchlistStore._instance.db.close();
    }
    WatchlistStore._instance = null;
  }

  add(scoutWallet: string, playerId: string): WatchlistEntry {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO watchlist (scout_wallet, player_id, created_at)
         VALUES (@scout_wallet, @player_id, @created_at)`,
      )
      .run({
        scout_wallet: scoutWallet,
        player_id: playerId,
        created_at: Date.now(),
      });

    const row = this.db
      .prepare(
        'SELECT * FROM watchlist WHERE scout_wallet = ? AND player_id = ?',
      )
      .get(scoutWallet, playerId) as WatchlistRow;
    return rowToEntry(row);
  }

  /** Deletes an entry scoped to its owner. Returns false if not found or not owned by scoutWallet. */
  remove(scoutWallet: string, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM watchlist WHERE id = ? AND scout_wallet = ?')
      .run(id, scoutWallet);
    return result.changes > 0;
  }

  list(scoutWallet: string): WatchlistEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM watchlist WHERE scout_wallet = ? ORDER BY created_at DESC, id DESC',
      )
      .all(scoutWallet) as WatchlistRow[];
    return rows.map(rowToEntry);
  }

  close(): void {
    this.db.close();
  }
}
