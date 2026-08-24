/**
 * milestoneDisputeStore — SQLite-backed persistence for player-raised
 * milestone disputes (issue #562). Off-chain moderation record only: this
 * store never calls the contract itself. When an admin resolves a dispute
 * as 'reversed', the actual on-chain revoke happens through the existing
 * validator `revoke_milestone` flow (see useValidator().revokeMilestone in
 * components/admin/DisputedMilestonesPanel.tsx) — the resulting tx hash is
 * then recorded here via `decide()`.
 *
 * Mirrors lib/adminAuditStore.ts's conventions: better-sqlite3, idempotent
 * `CREATE TABLE IF NOT EXISTS` DDL run on construction, a process-wide
 * singleton, DB bootstrap shared via lib/sqliteDb.ts.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';
import type { MilestoneDispute, MilestoneDisputeStatus } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS milestone_disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  player_wallet TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  milestone_description TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  resolution_note TEXT,
  revoke_tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_milestone_disputes_player_wallet ON milestone_disputes(player_wallet);
CREATE INDEX IF NOT EXISTS idx_milestone_disputes_status ON milestone_disputes(status);
-- At most one *open* dispute per milestone — re-disputing a milestone that
-- was already resolved (upheld or reversed) is still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_disputes_open
  ON milestone_disputes(milestone_id) WHERE status = 'pending';
`;

interface DisputeRow {
  id: number;
  player_id: string;
  player_wallet: string;
  milestone_id: string;
  milestone_description: string;
  reason: string;
  status: MilestoneDisputeStatus;
  created_at: number;
  decided_at: number | null;
  decided_by: string | null;
  resolution_note: string | null;
  revoke_tx_hash: string | null;
}

function rowToDispute(row: DisputeRow): MilestoneDispute {
  return {
    id: row.id,
    playerId: row.player_id,
    playerWallet: row.player_wallet,
    milestoneId: row.milestone_id,
    milestoneDescription: row.milestone_description,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    resolutionNote: row.resolution_note,
    revokeTxHash: row.revoke_tx_hash,
  };
}

export interface CreateDisputeInput {
  playerId: string;
  playerWallet: string;
  milestoneId: string;
  milestoneDescription: string;
  reason: string;
}

export interface DecideDisputeInput {
  status: Exclude<MilestoneDisputeStatus, 'pending'>;
  decidedBy: string;
  resolutionNote: string | null;
  revokeTxHash: string | null;
}

/** Thrown by `create()` when the milestone already has an open dispute. */
export class DuplicateDisputeError extends Error {
  constructor(milestoneId: string) {
    super(`Milestone ${milestoneId} already has a pending dispute`);
    this.name = 'DuplicateDisputeError';
  }
}

export class MilestoneDisputeStore {
  private static _instance: MilestoneDisputeStore | null = null;

  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA);
  }

  static getInstance(): MilestoneDisputeStore {
    if (!MilestoneDisputeStore._instance) {
      MilestoneDisputeStore._instance = new MilestoneDisputeStore(
        openSqliteDb('milestone-disputes.db', 'MILESTONE_DISPUTES_DB_PATH'),
      );
    }
    return MilestoneDisputeStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (MilestoneDisputeStore._instance) {
      MilestoneDisputeStore._instance.db.close();
    }
    MilestoneDisputeStore._instance = null;
  }

  create(input: CreateDisputeInput): MilestoneDispute {
    const existing = this.db
      .prepare(
        `SELECT id FROM milestone_disputes WHERE milestone_id = ? AND status = 'pending'`,
      )
      .get(input.milestoneId);
    if (existing) {
      throw new DuplicateDisputeError(input.milestoneId);
    }

    const result = this.db
      .prepare(
        `INSERT INTO milestone_disputes
           (player_id, player_wallet, milestone_id, milestone_description, reason, status, created_at)
         VALUES (@player_id, @player_wallet, @milestone_id, @milestone_description, @reason, 'pending', @created_at)`,
      )
      .run({
        player_id: input.playerId,
        player_wallet: input.playerWallet,
        milestone_id: input.milestoneId,
        milestone_description: input.milestoneDescription,
        reason: input.reason,
        created_at: Date.now(),
      });

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): MilestoneDispute | undefined {
    const row = this.db
      .prepare('SELECT * FROM milestone_disputes WHERE id = ?')
      .get(id) as DisputeRow | undefined;
    return row ? rowToDispute(row) : undefined;
  }

  listForWallet(playerWallet: string): MilestoneDispute[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM milestone_disputes WHERE player_wallet = ? ORDER BY created_at DESC',
      )
      .all(playerWallet) as DisputeRow[];
    return rows.map(rowToDispute);
  }

  /** Deletes every dispute owned by playerWallet. Returns the number of rows removed. */
  deleteForWallet(playerWallet: string): number {
    const result = this.db
      .prepare('DELETE FROM milestone_disputes WHERE player_wallet = ?')
      .run(playerWallet);
    return result.changes;
  }

  listAll(status?: MilestoneDisputeStatus): MilestoneDispute[] {
    const rows = status
      ? (this.db
          .prepare(
            'SELECT * FROM milestone_disputes WHERE status = ? ORDER BY created_at DESC',
          )
          .all(status) as DisputeRow[])
      : (this.db
          .prepare('SELECT * FROM milestone_disputes ORDER BY created_at DESC')
          .all() as DisputeRow[]);
    return rows.map(rowToDispute);
  }

  decide(id: number, input: DecideDisputeInput): MilestoneDispute {
    this.db
      .prepare(
        `UPDATE milestone_disputes
         SET status = @status, decided_at = @decided_at, decided_by = @decided_by,
             resolution_note = @resolution_note, revoke_tx_hash = @revoke_tx_hash
         WHERE id = @id`,
      )
      .run({
        id,
        status: input.status,
        decided_at: Date.now(),
        decided_by: input.decidedBy,
        resolution_note: input.resolutionNote,
        revoke_tx_hash: input.revokeTxHash,
      });
    const updated = this.findById(id);
    if (!updated) {
      throw new Error(`Dispute ${id} not found`);
    }
    return updated;
  }
}
