import type {
  AdminAuditActionType,
  AdminAuditQueryResult,
  ReconciliationResult,
} from '@/lib/adminAudit';

/** Client for app/api/admin/audit-log/* — same-origin, cookie-authenticated. */

export interface AuditLogQuery {
  actionType?: AdminAuditActionType;
  /** Unix seconds. */
  from?: number;
  /** Unix seconds. */
  to?: number;
  before?: number;
  limit?: number;
}

export async function fetchAuditLog(
  query: AuditLogQuery = {},
): Promise<AdminAuditQueryResult> {
  const params = new URLSearchParams();
  if (query.actionType) params.set('actionType', query.actionType);
  if (query.from !== undefined) params.set('from', String(query.from));
  if (query.to !== undefined) params.set('to', String(query.to));
  if (query.before !== undefined) params.set('before', String(query.before));
  if (query.limit !== undefined) params.set('limit', String(query.limit));

  const qs = params.toString();
  const res = await fetch(`/api/admin/audit-log${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}

export interface RecordAuditEntryInput {
  actionType: AdminAuditActionType;
  target?: string;
  amountStroops?: number;
  txHash?: string;
  status: 'submitted' | 'confirmed' | 'failed';
  data?: Record<string, unknown>;
}

/**
 * Records one admin action right after it's signed and submitted. Errors
 * are deliberately swallowed by callers (see app/[locale]/admin/page.tsx) —
 * a failure to *log* an action must never block or roll back the action
 * itself, which has already gone on-chain by the time this is called.
 */
export async function recordAuditEntry(
  input: RecordAuditEntryInput,
): Promise<void> {
  const res = await fetch('/api/admin/audit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to record audit log entry');
}

export async function fetchReconciliation(): Promise<ReconciliationResult> {
  const res = await fetch('/api/admin/audit-log/reconcile');
  if (!res.ok) throw new Error('Failed to run reconciliation');
  return res.json();
}
