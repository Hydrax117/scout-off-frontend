/**
 * chunkedUploadChunkStore — SQLite-backed storage for chunked/resumable
 * upload chunk bytes (issue #1175). Companion to lib/chunkedUploadStore.ts's
 * session metadata store: metadata answers "which chunks has this session
 * received," this store holds the bytes themselves.
 *
 * Chunk bytes are larger binary payloads than the counters Redis backs
 * elsewhere in this repo (lib/rateLimit.ts), so rather than Redis they go
 * to the shared-disk-backed better-sqlite3 infrastructure already used
 * throughout lib/*Store.ts, per docs/chunked-video-upload.md's own note
 * that this store "would need to move to shared storage (e.g. one of the
 * SQLite services already used elsewhere in this repo)." This resolves the
 * bug (a chunk landing on one instance's local os.tmpdir() being invisible
 * to another instance) as long as the SQLite database file itself is on
 * shared/persistent storage reachable from every instance (a shared volume,
 * not per-instance ephemeral disk) — see CHUNKED_UPLOAD_DB_PATH in
 * .env.example. On a truly stateless/ephemeral-disk serverless deployment
 * with no shared volume, this same limitation would resurface one layer
 * down; that's an explicit, documented tradeoff, not a silent gap.
 */
import type Database from 'better-sqlite3';
import { openSqliteDb } from './sqliteDb';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chunked_upload_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunked_upload_chunks_session ON chunked_upload_chunks(session_id);
`;

interface ChunkRow {
  chunk_index: number;
  data: Buffer;
}

export class ChunkedUploadChunkStore {
  private static _instance: ChunkedUploadChunkStore | null = null;

  private db: Database.Database;

  private constructor() {
    this.db = openSqliteDb('chunked-uploads.db', 'CHUNKED_UPLOAD_DB_PATH');
    this.db.exec(SCHEMA);
  }

  static getInstance(): ChunkedUploadChunkStore {
    if (!ChunkedUploadChunkStore._instance) {
      ChunkedUploadChunkStore._instance = new ChunkedUploadChunkStore();
    }
    return ChunkedUploadChunkStore._instance;
  }

  /** Closes the DB connection and clears the singleton. Use ONLY in tests. */
  static resetInstance(): void {
    if (ChunkedUploadChunkStore._instance) {
      ChunkedUploadChunkStore._instance.db.close();
    }
    ChunkedUploadChunkStore._instance = null;
  }

  /** Idempotent per (sessionId, chunkIndex) — re-uploading a chunk overwrites it. */
  writeChunk(sessionId: string, chunkIndex: number, data: Buffer): void {
    this.db
      .prepare(
        `INSERT INTO chunked_upload_chunks (session_id, chunk_index, data, created_at)
         VALUES (@session_id, @chunk_index, @data, @created_at)
         ON CONFLICT(session_id, chunk_index) DO UPDATE SET
           data = excluded.data, created_at = excluded.created_at`,
      )
      .run({
        session_id: sessionId,
        chunk_index: chunkIndex,
        // Copy into a plain-ArrayBuffer-backed Uint8Array: @types/node's
        // Buffer is generic over ArrayBufferLike, which this project's
        // DOM-lib-inclusive tsconfig can't unify with better-sqlite3's BLOB
        // binding — same pattern as the whole-file /complete route.
        data: new Uint8Array(data),
        created_at: Date.now(),
      });
  }

  /** Which chunk indices this store currently holds for a session. */
  receivedIndices(sessionId: string): number[] {
    const rows = this.db
      .prepare(
        `SELECT chunk_index FROM chunked_upload_chunks WHERE session_id = ? ORDER BY chunk_index ASC`,
      )
      .all(sessionId) as Array<{ chunk_index: number }>;
    return rows.map((r) => r.chunk_index);
  }

  /**
   * Concatenates every chunk for a session, in index order, into one
   * Buffer. Throws if the count doesn't match `totalChunks` — a defense-in-
   * depth check independent of the caller's own metadata-based check.
   */
  readAllInOrder(sessionId: string, totalChunks: number): Buffer {
    const rows = this.db
      .prepare(
        `SELECT chunk_index, data FROM chunked_upload_chunks WHERE session_id = ? ORDER BY chunk_index ASC`,
      )
      .all(sessionId) as ChunkRow[];
    if (rows.length !== totalChunks) {
      throw new Error(
        `Incomplete upload: received ${rows.length}/${totalChunks} chunks`,
      );
    }
    return Buffer.concat(rows.map((r) => new Uint8Array(r.data)));
  }

  deleteForSession(sessionId: string): void {
    this.db
      .prepare(`DELETE FROM chunked_upload_chunks WHERE session_id = ?`)
      .run(sessionId);
  }

  close(): void {
    this.db.close();
  }
}
