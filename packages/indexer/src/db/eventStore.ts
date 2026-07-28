/**
 * eventStore — SQLite-backed persistence and query layer for decoded contract
 * events.
 *
 * This is the datastore promised by README.md's architecture diagram
 * ("persists them for fast querying, so the frontend can query historical
 * data without hitting the RPC node for every page load") but never
 * implemented. Every event `eventPoller.pollOnce` successfully decodes is
 * written here; `server.ts`'s query endpoints read from here.
 *
 * Design:
 *  - better-sqlite3: synchronous, embedded, zero-ops file database. No
 *    separate DB server to run/deploy alongside a small indexer process.
 *  - One `events` table shared by all 7 event types. Type-specific fields
 *    (e.g. `new_level` on milestone_approved, `fee_xlm` on scout_subscribed)
 *    live in the `data` JSON column rather than as dedicated columns —
 *    conservative schema, per the issue's guidance not to generalize before
 *    there's a second use case. The handful of fields shared across event
 *    types that queries actually filter/sort by (`event_type`, `player_id`,
 *    `scout`, `validator`, `ledger`) get real indexed columns.
 *  - Keyset pagination on `ledger` (not OFFSET) so query cost stays
 *    proportional to page size, not to how deep into the history you are.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { EventType } from '../metrics/IndexerMetrics';
import type { DecodedEvent } from '../eventPoller';

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'indexer.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  player_id TEXT,
  scout TEXT,
  validator TEXT,
  ledger INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,
  inserted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_player_ledger ON events(player_id, ledger DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_ledger ON events(event_type, ledger DESC);
CREATE INDEX IF NOT EXISTS idx_events_validator ON events(validator, ledger DESC);
CREATE INDEX IF NOT EXISTS idx_events_ledger ON events(ledger DESC);
`;

export interface EventRecord {
  id: number;
  type: EventType;
  playerId: string | null;
  scout: string | null;
  validator: string | null;
  ledger: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface QueryFilter {
  type?: EventType;
  playerId?: string;
  validator?: string;
  /** Keyset cursor: only return events with ledger strictly less than this. */
  before?: number;
  /** Page size, capped at MAX_LIMIT. */
  limit?: number;
}

export interface QueryResult {
  events: EventRecord[];
  /** Pass as `before` on the next call to fetch the next page; null when exhausted. */
  nextCursor: number | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface EventRow {
  id: number;
  event_type: string;
  player_id: string | null;
  scout: string | null;
  validator: string | null;
  ledger: number;
  timestamp: number;
  data: string;
}

function rowToRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    type: row.event_type as EventType,
    playerId: row.player_id,
    scout: row.scout,
    validator: row.validator,
    ledger: row.ledger,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
  };
}

function fieldAsString(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const v = data[key];
  return typeof v === 'string' ? v : null;
}

export class EventStore {
  private static _instance: EventStore | null = null;

  private db: Database.Database;

  private constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    if (dbPath !== ':memory:') {
      // WAL: readers (the query API) don't block the writer (the poller).
      this.db.pragma('journal_mode = WAL');
    }
    this.db.exec(SCHEMA);
  }

  /**
   * Returns the process-wide singleton, matching IndexerMetrics's pattern.
   * `dbPath` is only honored on first construction; pass it once at startup
   * (or via INDEXER_DB_PATH) rather than relying on call order elsewhere.
   */
  static getInstance(dbPath?: string): EventStore {
    if (!EventStore._instance) {
      const resolvedPath =
        dbPath ??
        process.env.INDEXER_DB_PATH ??
        (process.env.NODE_ENV === 'test' ? ':memory:' : DEFAULT_DB_PATH);
      EventStore._instance = new EventStore(resolvedPath);
    }
    return EventStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (EventStore._instance) {
      EventStore._instance.db.close();
    }
    EventStore._instance = null;
  }

  /** Persists one decoded event. Called from the poll loop after a successful decode. */
  insertEvent(decoded: DecodedEvent): void {
    this.db
      .prepare(
        `INSERT INTO events (event_type, player_id, scout, validator, ledger, timestamp, data, inserted_at)
         VALUES (@event_type, @player_id, @scout, @validator, @ledger, @timestamp, @data, @inserted_at)`,
      )
      .run({
        event_type: decoded.type,
        player_id: fieldAsString(decoded.data, 'player_id'),
        scout: fieldAsString(decoded.data, 'scout'),
        validator: fieldAsString(decoded.data, 'validator'),
        ledger: decoded.ledger,
        timestamp: decoded.timestamp,
        data: JSON.stringify(decoded.data),
        inserted_at: Date.now(),
      });
  }

  /** General event query, optionally filtered by type and/or player. */
  getEvents(filter: QueryFilter = {}): QueryResult {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const clauses: string[] = [];
    const params: Record<string, unknown> = { limit: limit + 1 };

    if (filter.type) {
      clauses.push('event_type = @type');
      params.type = filter.type;
    }
    if (filter.playerId) {
      clauses.push('player_id = @playerId');
      params.playerId = filter.playerId;
    }
    if (filter.validator) {
      clauses.push('validator = @validator');
      params.validator = filter.validator;
    }
    if (filter.before !== undefined) {
      clauses.push('ledger < @before');
      params.before = filter.before;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM events ${where} ORDER BY ledger DESC, id DESC LIMIT @limit`,
      )
      .all(params) as EventRow[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      events: page.map(rowToRecord),
      nextCursor: hasMore ? page[page.length - 1].ledger : null,
    };
  }

  /** Convenience wrapper for the per-player query endpoint. */
  getEventsByPlayer(
    playerId: string,
    filter: Omit<QueryFilter, 'playerId'> = {},
  ): QueryResult {
    return this.getEvents({ ...filter, playerId });
  }

  close(): void {
    this.db.close();
  }
}
