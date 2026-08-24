import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Server-side session store backing the chunked/resumable upload flow
 * (app/api/ipfs/upload/{init,chunk,status,complete}). Chunks are written to
 * disk as they arrive and concatenated on completion — Pinata's
 * `pinFileToIPFS` endpoint has no native chunked-upload API, so chunking is
 * purely a client<->this-Next.js-app concern; the final assembled file is
 * still sent to Pinata in one request, exactly as the whole-file upload
 * route already does.
 *
 * In-memory session map: this assumes a single, long-running Node process
 * (already true of app/api/ipfs/upload's own rate-limit Map, and of
 * server/'s referral-request rate limiting) rather than a stateless
 * per-request serverless deployment. If this app is ever deployed across
 * multiple instances/regions, this store would need to move to a shared
 * backing store (e.g. the SQLite services already used elsewhere in this
 * repo) so chunk requests can land on any instance.
 */

const UPLOAD_DIR = path.join(os.tmpdir(), 'scout-off-chunked-uploads');

/** Abandoned sessions older than this are swept proactively (see sweepExpired). */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface UploadSession {
  sessionId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  createdAt: number;
  dir: string;
  /** Optional owner wallet, recorded when the upload was initiated by an authenticated session. */
  ownerWallet: string | null;
}

const sessions = new Map<string, UploadSession>();

// Called from every store entry point that already touches `sessions`
// (init/status/chunk) rather than on a setInterval: a timer would need
// explicit .unref()/shutdown handling to stay compatible with this
// module's single-process assumption, whereas piggybacking on requests
// that already scan/mutate this in-memory Map is free and keeps quiet
// periods (no uploads at all) from being the only way sweeping is skipped
// — any request that touches the store is now also an opportunity to sweep.
function sweepExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      fs.rm(session.dir, { recursive: true, force: true }, () => {});
      sessions.delete(id);
    }
  }
}

function chunkPath(session: UploadSession, index: number): string {
  return path.join(session.dir, `chunk-${String(index).padStart(6, '0')}`);
}

export interface InitParams {
  filename: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
  /** Optional owner wallet to associate with the session for data export. */
  ownerWallet?: string | null;
}

export interface SessionStatus {
  receivedChunks: number[];
  totalChunks: number;
}

/** Starts a new upload session and returns its id. */
export function initSession(params: InitParams): { sessionId: string } {
  sweepExpired();

  const sessionId = crypto.randomUUID();
  const dir = path.join(UPLOAD_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });

  sessions.set(sessionId, {
    sessionId,
    filename: params.filename,
    fileType: params.fileType,
    fileSize: params.fileSize,
    totalChunks: params.totalChunks,
    receivedChunks: new Set(),
    createdAt: Date.now(),
    dir,
    ownerWallet: params.ownerWallet ?? null,
  });

  return { sessionId };
}

export interface SessionSummary {
  sessionId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: number;
  createdAt: number;
}

/** Returns summaries of all active sessions owned by the given wallet. */
export function listSessionsForWallet(wallet: string): SessionSummary[] {
  const result: SessionSummary[] = [];
  for (const session of sessions.values()) {
    if (session.ownerWallet !== wallet) continue;
    result.push({
      sessionId: session.sessionId,
      filename: session.filename,
      fileType: session.fileType,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks.size,
      createdAt: session.createdAt,
    });
  }
  return result;
}

/** Removes every active session owned by the given wallet. Returns the count removed. */
export function clearSessionsForWallet(wallet: string): number {
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.ownerWallet !== wallet) continue;
    fs.rm(session.dir, { recursive: true, force: true }, () => {});
    sessions.delete(id);
    removed++;
  }
  return removed;
}

/** Returns the current status of a session, or null if unknown/expired. */
export function getSessionStatus(sessionId: string): SessionStatus | null {
  sweepExpired();
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    receivedChunks: Array.from(session.receivedChunks).sort((a, b) => a - b),
    totalChunks: session.totalChunks,
  };
}

/** Persists one chunk to disk and records it as received. */
export async function writeChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
): Promise<SessionStatus> {
  sweepExpired();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Upload session not found or expired');
  }
  if (
    !Number.isInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= session.totalChunks
  ) {
    throw new Error('Chunk index out of range');
  }

  // Copy into a plain-ArrayBuffer-backed Uint8Array: @types/node's Buffer is
  // generic over ArrayBufferLike (which includes SharedArrayBuffer), which
  // this project's DOM-lib-inclusive tsconfig can't unify with fs/DOM APIs
  // typed against a concrete ArrayBuffer. A fresh copy sidesteps the clash.
  await fs.promises.writeFile(
    chunkPath(session, chunkIndex),
    new Uint8Array(data),
  );
  session.receivedChunks.add(chunkIndex);

  return {
    receivedChunks: Array.from(session.receivedChunks).sort((a, b) => a - b),
    totalChunks: session.totalChunks,
  };
}

export interface AssembledFile {
  buffer: Buffer;
  filename: string;
  fileType: string;
}

/**
 * Concatenates every received chunk, in order, into a single Buffer.
 * Throws if the session is unknown/expired or any chunk is still missing.
 */
export async function assembleFile(sessionId: string): Promise<AssembledFile> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Upload session not found or expired');
  }
  if (session.receivedChunks.size !== session.totalChunks) {
    throw new Error(
      `Incomplete upload: received ${session.receivedChunks.size}/${session.totalChunks} chunks`,
    );
  }

  const parts: Buffer[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    parts.push(await fs.promises.readFile(chunkPath(session, i)));
  }

  return {
    buffer: Buffer.concat(parts.map((p) => new Uint8Array(p))),
    filename: session.filename,
    fileType: session.fileType,
  };
}

/** Removes a session's temp files and its in-memory record. */
export function cleanupSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  fs.rm(session.dir, { recursive: true, force: true }, () => {});
  sessions.delete(sessionId);
}

/** Test-only: reset all in-memory session state and remove temp files. */
export function __resetForTests(): void {
  for (const session of sessions.values()) {
    fs.rmSync(session.dir, { recursive: true, force: true });
  }
  sessions.clear();
}
