'use client';

import { useEffect, useRef, useState } from 'react';

export type EventType =
  | 'player_registered'
  | 'milestone_approved'
  | 'milestone_revoked'
  | 'scout_subscribed'
  | 'player_contacted'
  | 'trial_offer_logged'
  | 'fees_withdrawn';

export interface FeedEvent {
  id: string;
  type: EventType;
  createdAt: string | number;
  payload?: Record<string, unknown>;
}

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const POLL_INTERVAL = 30_000;

// Reconnect tuning for the SSE path: exponential backoff between attempts,
// capped at MAX_RECONNECT_DELAY_MS, giving up on SSE (and falling back to
// polling) after MAX_RECONNECT_ATTEMPTS consecutive failures.
export const MAX_RECONNECT_ATTEMPTS = 5;
export const BASE_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

/** Map a raw Horizon operation record to the FeedEvent schema. */
function toFeedEvent(op: Record<string, unknown>): FeedEvent | null {
  const raw = op as {
    id?: string;
    type?: string;
    created_at?: string;
    transaction_hash?: string;
    [key: string]: unknown;
  };
  if (!raw.id) return null;

  // Derive a FeedEvent type from the Horizon operation type string.
  let type: EventType;
  switch (raw.type) {
    case 'invoke_host_function':
      // Heuristic: inspect function name hints if present, fall back to milestone_approved
      if (String(raw.function ?? '').includes('register')) {
        type = 'player_registered';
      } else if (String(raw.function ?? '').includes('trial')) {
        type = 'trial_offer_logged';
      } else {
        type = 'milestone_approved';
      }
      break;
    default:
      return null; // Skip non-contract operations
  }

  return {
    id: String(raw.id),
    type,
    createdAt: raw.created_at ?? new Date().toISOString(),
    payload: { txHash: raw.transaction_hash },
  };
}

async function fetchOperations(
  cursor?: string,
): Promise<{ events: FeedEvent[]; nextCursor: string }> {
  const params = new URLSearchParams({ order: 'desc', limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const url = `${HORIZON_URL}/accounts/${CONTRACT_ID}/operations?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Horizon ${resp.status}`);
  const json = await resp.json();
  const records: Record<string, unknown>[] = json?._embedded?.records ?? [];
  const nextCursor: string =
    records.length > 0
      ? String((records[0] as { paging_token?: unknown }).paging_token ?? '')
      : (cursor ?? '');
  const events = records.flatMap((r) => {
    const ev = toFeedEvent(r);
    return ev ? [ev] : [];
  });
  return { events, nextCursor };
}

export function useContractEvents(contractId?: string) {
  const contract = contractId ?? CONTRACT_ID;
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const cursorRef = useRef<string>('now');

  /** Prepend genuinely new events, newest first. */
  function mergeEvents(incoming: FeedEvent[]) {
    const novel = incoming.filter((e) => !seenRef.current.has(e.id));
    if (novel.length === 0) return;
    novel.forEach((e) => seenRef.current.add(e.id));
    setEvents((prev) => [...novel, ...prev].slice(0, 50));
  }

  useEffect(() => {
    if (!contract) return;

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;

    // ── Polling fallback ────────────────────────────────────────────────────
    function startPolling() {
      if (pollTimer) return;
      setIsLive(false);

      async function poll() {
        try {
          const { events: incoming, nextCursor } = await fetchOperations(
            cursorRef.current === 'now' ? undefined : cursorRef.current,
          );
          if (!cancelled) {
            cursorRef.current = nextCursor;
            mergeEvents(incoming);
          }
        } catch {
          // network errors — silent
        }
      }

      poll();
      pollTimer = setInterval(poll, POLL_INTERVAL);
    }

    // ── SSE path, with bounded exponential-backoff reconnect ────────────────
    function connectSSE() {
      if (cancelled) return;

      const url = `${HORIZON_URL}/accounts/${contract}/operations?cursor=now`;
      es = new EventSource(url);

      es.addEventListener('message', (ev) => {
        try {
          const op = JSON.parse((ev as MessageEvent).data) as Record<
            string,
            unknown
          >;
          const feedEv = toFeedEvent(op);
          if (feedEv) mergeEvents([feedEv]);
        } catch {
          // malformed frame — ignore
        }
      });

      es.addEventListener('open', () => {
        reconnectAttempts = 0;
        setIsLive(true);
      });

      es.addEventListener('error', () => {
        setIsLive(false);
        es?.close();
        es = null;

        if (cancelled) return;

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          // SSE has failed too many times in a row — stop retrying it and
          // fall back to the polling path instead of staying silently dead.
          startPolling();
          return;
        }

        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts,
          MAX_RECONNECT_DELAY_MS,
        );
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connectSSE, delay);
      });
    }

    if (typeof EventSource !== 'undefined') {
      connectSSE();
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      es = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      setIsLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  return { events, isLive };
}
