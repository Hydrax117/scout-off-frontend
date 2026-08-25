/**
 * adminAuditStore — SQLite-backed persistence for the admin audit log
 * (issue #670). Every admin action recorded by the admin panel
 * (validator add/remove, fee withdrawal, pause/unpause) is written here via
 * POST /api/admin/audit-log, and read back for the audit view and for
 * reconciliation (GET /api/admin/audit-log/reconcile).
 *
 * DB bootstrap and schema are shared via lib/sqliteDb.ts's openSqliteDb,
 * with schema applied through lib/sqliteMigrations.ts's versioned migration
 * runner (see lib/migrations/adminAuditMigrations.ts) rather than a bare
 * `CREATE TABLE IF NOT EXISTS` — a process-wide singleton and keyset
 * pagination rather than OFFSET otherwise unchanged.
 */
import Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import { applyMigrations } from './sqliteMigrations';
import { adminAuditMigrations } from './migrations/adminAuditMigrations';
import type {
  AdminAuditEntry,
  AdminAuditQueryFilter,
  AdminAuditQueryResult,
  AdminAuditStatus,
} from './adminAudit';
import type { AdminAuditActionType } from './adminAudit';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface AuditRow {
  id: number;
  action_type: string;
  admin_wallet: string;
  target: string | null;
  amount_stroops: number | null;
  tx_hash: string | null;
  status: string;
  timestamp: number;
  data: string;
}

function rowToEntry(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actionType: row.action_type as AdminAuditActionType,
    adminWallet: row.admin_wallet,
    target: row.target,
    amountStroops: row.amount_stroops,
    txHash: row.tx_hash,
    status: row.status as AdminAuditStatus,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
  };
}

export interface NewAdminAuditEntry {
  actionType: AdminAuditActionType;
  adminWallet: string;
  target?: string | null;
  amountStroops?: number | null;
  txHash?: string | null;
  status: AdminAuditStatus;
  timestamp: number;
  data?: Record<string, unknown>;
}

export class AdminAuditStore {
  private static _instance: AdminAuditStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  /** Returns the process-wide singleton, matching EventStore's pattern. */
  static getInstance(dbPath?: string): AdminAuditStore {
    if (!AdminAuditStore._instance) {
      let db: Database.Database;
      if (dbPath) {
        db = new Database(dbPath);
        if (dbPath !== ':memory:') {
          db.pragma('journal_mode = WAL');
        }
        applyMigrations(db, adminAuditMigrations);
      } else {
        db = openSqliteDb(
          'admin-audit.db',
          'ADMIN_AUDIT_DB_PATH',
          adminAuditMigrations,
        );
      }
      AdminAuditStore._instance = new AdminAuditStore(db);
    }
    return AdminAuditStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (AdminAuditStore._instance) {
      AdminAuditStore._instance.db.close();
    }
    AdminAuditStore._instance = null;
  }

  insertEntry(entry: NewAdminAuditEntry): AdminAuditEntry {
    const result = this.db
      .prepare(
        `INSERT INTO admin_audit_log
           (action_type, admin_wallet, target, amount_stroops, tx_hash, status, timestamp, data, inserted_at)
         VALUES (@action_type, @admin_wallet, @target, @amount_stroops, @tx_hash, @status, @timestamp, @data, @inserted_at)`,
      )
      .run({
        action_type: entry.actionType,
        admin_wallet: entry.adminWallet,
        target: entry.target ?? null,
        amount_stroops: entry.amountStroops ?? null,
        tx_hash: entry.txHash ?? null,
        status: entry.status,
        timestamp: entry.timestamp,
        data: JSON.stringify(entry.data ?? {}),
        inserted_at: Date.now(),
      });

    const row = this.db
      .prepare('SELECT * FROM admin_audit_log WHERE id = ?')
      .get(result.lastInsertRowid) as AuditRow;
    return rowToEntry(row);
  }

  getEntries(filter: AdminAuditQueryFilter = {}): AdminAuditQueryResult {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const clauses: string[] = [];
    const params: Record<string, unknown> = { limit: limit + 1 };

    if (filter.actionType) {
      clauses.push('action_type = @actionType');
      params.actionType = filter.actionType;
    }
    if (filter.from !== undefined) {
      clauses.push('timestamp >= @from');
      params.from = filter.from;
    }
    if (filter.to !== undefined) {
      clauses.push('timestamp <= @to');
      params.to = filter.to;
    }
    if (filter.before !== undefined) {
      clauses.push('id < @before');
      params.before = filter.before;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM admin_audit_log ${where} ORDER BY id DESC LIMIT @limit`,
      )
      .all(params) as AuditRow[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries: page.map(rowToEntry),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** All entries for a given action type, oldest first — used by reconciliation to replay state. */
  getAllByActionTypeOldestFirst(
    actionTypes: AdminAuditActionType[],
  ): AdminAuditEntry[] {
    if (actionTypes.length === 0) return [];
    const placeholders = actionTypes.map((_, i) => `@t${i}`).join(', ');
    const params: Record<string, unknown> = {};
    actionTypes.forEach((t, i) => (params[`t${i}`] = t));

    const rows = this.db
      .prepare(
        `SELECT * FROM admin_audit_log WHERE action_type IN (${placeholders}) ORDER BY timestamp ASC, id ASC`,
      )
      .all(params) as AuditRow[];
    return rows.map(rowToEntry);
  }

  close(): void {
    this.db.close();
  }
}
