/**
 * notificationPreferencesStore — SQLite-backed persistence for per-wallet
 * notification category toggles (issue #560). One row per wallet; a
 * missing row means "all categories on" (the default), matching the
 * `getPreferences` fallback below rather than requiring a row-seeding step.
 *
 * Mirrors lib/watchlistStore.ts's conventions: idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL run on construction, a process-wide
 * singleton, DB bootstrap shared via lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notificationPreferencesClient';
import type { NotificationPreferences } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_preferences (
  wallet TEXT PRIMARY KEY,
  milestone_approvals INTEGER NOT NULL DEFAULT 1,
  contact_unlocks INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
`;

interface PreferencesRow {
  wallet: string;
  milestone_approvals: number;
  contact_unlocks: number;
  updated_at: number;
}

function rowToPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    milestoneApprovals: row.milestone_approvals === 1,
    contactUnlocks: row.contact_unlocks === 1,
  };
}

export class NotificationPreferencesStore {
  private static _instance: NotificationPreferencesStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): NotificationPreferencesStore {
    if (!NotificationPreferencesStore._instance) {
      NotificationPreferencesStore._instance = new NotificationPreferencesStore(
        openSqliteDb(
          'notification-preferences.db',
          'NOTIFICATION_PREFERENCES_DB_PATH',
        ),
      );
    }
    return NotificationPreferencesStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (NotificationPreferencesStore._instance) {
      NotificationPreferencesStore._instance.db.close();
    }
    NotificationPreferencesStore._instance = null;
  }

  get(wallet: string): NotificationPreferences {
    const row = this.db
      .prepare('SELECT * FROM notification_preferences WHERE wallet = ?')
      .get(wallet) as PreferencesRow | undefined;
    return row
      ? rowToPreferences(row)
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  set(
    wallet: string,
    preferences: NotificationPreferences,
  ): NotificationPreferences {
    this.db
      .prepare(
        `INSERT INTO notification_preferences (wallet, milestone_approvals, contact_unlocks, updated_at)
         VALUES (@wallet, @milestone_approvals, @contact_unlocks, @updated_at)
         ON CONFLICT(wallet) DO UPDATE SET
           milestone_approvals = excluded.milestone_approvals,
           contact_unlocks = excluded.contact_unlocks,
           updated_at = excluded.updated_at`,
      )
      .run({
        wallet,
        milestone_approvals: preferences.milestoneApprovals ? 1 : 0,
        contact_unlocks: preferences.contactUnlocks ? 1 : 0,
        updated_at: Date.now(),
      });
    return this.get(wallet);
  }

  /** Removes the preferences row for wallet. Returns the number of rows removed. */
  clearForWallet(wallet: string): number {
    const result = this.db
      .prepare('DELETE FROM notification_preferences WHERE wallet = ?')
      .run(wallet);
    return result.changes;
  }
}
