/** @jest-environment node */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  initSession,
  getSessionStatus,
  writeChunk,
  assembleFile,
  cleanupSession,
  __resetForTests,
} from '@/lib/chunkedUploadStore';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // must match lib/chunkedUploadStore.ts
const UPLOAD_DIR = path.join(os.tmpdir(), 'scout-off-chunked-uploads');

/** sweepExpired's fs.rm is fire-and-forget, so poll briefly for removal. */
async function waitForRemoval(dir: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (fs.existsSync(dir)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${dir} was not removed within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(() => {
  __resetForTests();
  jest.restoreAllMocks();
});

describe('chunkedUploadStore', () => {
  it('starts a session and reports zero received chunks', () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });

    expect(sessionId).toBeTruthy();
    expect(getSessionStatus(sessionId)).toEqual({
      receivedChunks: [],
      totalChunks: 3,
    });
  });

  it('returns null status for an unknown session', () => {
    expect(getSessionStatus('does-not-exist')).toBeNull();
  });

  it('writes chunks and tracks which indices have been received', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 30,
      totalChunks: 3,
    });

    await writeChunk(sessionId, 1, Buffer.from('bbbbbbbbbb'));
    const status = await writeChunk(sessionId, 0, Buffer.from('aaaaaaaaaa'));

    expect(status).toEqual({ receivedChunks: [0, 1], totalChunks: 3 });
  });

  it('re-uploading the same chunk index overwrites it (idempotent retry)', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });

    await writeChunk(sessionId, 0, Buffer.from('first-attempt'));
    await writeChunk(sessionId, 0, Buffer.from('second-attempt'));

    const { buffer } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('second-attempt');
  });

  it('rejects a chunk index outside [0, totalChunks)', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 2,
    });

    await expect(writeChunk(sessionId, 2, Buffer.from('x'))).rejects.toThrow(
      /out of range/i,
    );
    await expect(writeChunk(sessionId, -1, Buffer.from('x'))).rejects.toThrow(
      /out of range/i,
    );
  });

  it('rejects writing a chunk to an unknown session', async () => {
    await expect(writeChunk('nope', 0, Buffer.from('x'))).rejects.toThrow(
      /not found or expired/i,
    );
  });

  it('assembles chunks in index order regardless of upload order', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 6,
      totalChunks: 3,
    });

    await writeChunk(sessionId, 2, Buffer.from('cc'));
    await writeChunk(sessionId, 0, Buffer.from('aa'));
    await writeChunk(sessionId, 1, Buffer.from('bb'));

    const { buffer, filename, fileType } = await assembleFile(sessionId);
    expect(buffer.toString()).toBe('aabbcc');
    expect(filename).toBe('clip.mp4');
    expect(fileType).toBe('video/mp4');
  });

  it('refuses to assemble an incomplete upload', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 20,
      totalChunks: 2,
    });

    await writeChunk(sessionId, 0, Buffer.from('aa'));

    await expect(assembleFile(sessionId)).rejects.toThrow(/incomplete/i);
  });

  it('cleanupSession removes the session so it can no longer be used', async () => {
    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 2,
      totalChunks: 1,
    });
    await writeChunk(sessionId, 0, Buffer.from('aa'));

    cleanupSession(sessionId);

    expect(getSessionStatus(sessionId)).toBeNull();
    await expect(assembleFile(sessionId)).rejects.toThrow(
      /not found or expired/i,
    );
  });

  it('cleanupSession on an unknown session is a harmless no-op', () => {
    expect(() => cleanupSession('does-not-exist')).not.toThrow();
  });

  it('proactively sweeps a session abandoned past its TTL without a new initSession call', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

    const { sessionId } = initSession({
      filename: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });
    await writeChunk(sessionId, 0, Buffer.from('abandoned'));

    const dir = path.join(UPLOAD_DIR, sessionId);
    expect(fs.existsSync(dir)).toBe(true);

    // Advance past the TTL without ever calling initSession again.
    nowSpy.mockReturnValue(realNow + SESSION_TTL_MS + 1);

    // getSessionStatus is a read-only status check, not a new upload — it
    // now proactively sweeps as a side effect, same as writeChunk does.
    expect(getSessionStatus(sessionId)).toBeNull();

    await waitForRemoval(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('writeChunk on an unrelated session also proactively sweeps expired sessions', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

    const expired = initSession({
      filename: 'old.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });
    const expiredDir = path.join(UPLOAD_DIR, expired.sessionId);
    await writeChunk(expired.sessionId, 0, Buffer.from('stale'));

    // A second session created 1s later, before `expired` has aged out —
    // both sessions co-exist at this point.
    nowSpy.mockReturnValue(realNow + 1000);
    const fresh = initSession({
      filename: 'new.mp4',
      fileType: 'video/mp4',
      fileSize: 10,
      totalChunks: 1,
    });

    // Advance past `expired`'s TTL, but not past `fresh`'s (created 1s later).
    nowSpy.mockReturnValue(realNow + SESSION_TTL_MS + 500);

    // No new initSession call here: writeChunk on the still-fresh session
    // is what must trigger the sweep of the unrelated expired one.
    await writeChunk(fresh.sessionId, 0, Buffer.from('active'));

    expect(getSessionStatus(expired.sessionId)).toBeNull();
    expect(getSessionStatus(fresh.sessionId)).toEqual({
      receivedChunks: [0],
      totalChunks: 1,
    });
    await waitForRemoval(expiredDir);
  });
});
