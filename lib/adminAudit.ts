/**
 * Shared types for the admin audit log (issue #670). Split out from
 * lib/adminAuditStore.ts (server-only, imports better-sqlite3) so client
 * components and API route handlers can share the same shapes without
 * pulling a native module into client bundles.
 */

export const ADMIN_AUDIT_ACTION_TYPES = [
  'validator_add',
  'validator_remove',
  'fee_withdrawal',
  'pause',
  'unpause',
] as const;

export type AdminAuditActionType = (typeof ADMIN_AUDIT_ACTION_TYPES)[number];

export function isAdminAuditActionType(
  value: unknown,
): value is AdminAuditActionType {
  return (
    typeof value === 'string' &&
    (ADMIN_AUDIT_ACTION_TYPES as readonly string[]).includes(value)
  );
}

export type AdminAuditStatus = 'submitted' | 'confirmed' | 'failed';

export interface AdminAuditEntry {
  id: number;
  actionType: AdminAuditActionType;
  /** Wallet that performed the action, per the frontend's own session. */
  adminWallet: string;
  /** Validator address for validator_add/validator_remove; null otherwise. */
  target: string | null;
  /** Fee amount in stroops for fee_withdrawal; null otherwise. */
  amountStroops: number | null;
  /** Submitted transaction hash, when known. */
  txHash: string | null;
  status: AdminAuditStatus;
  /** Unix seconds. */
  timestamp: number;
  /** Any extra context (e.g. contract error message on a failed submit). */
  data: Record<string, unknown>;
}

export interface AdminAuditQueryFilter {
  actionType?: AdminAuditActionType;
  /** Unix seconds, inclusive lower bound. */
  from?: number;
  /** Unix seconds, inclusive upper bound. */
  to?: number;
  /** Keyset cursor: only entries with id strictly less than this. */
  before?: number;
  limit?: number;
}

export interface AdminAuditQueryResult {
  entries: AdminAuditEntry[];
  nextCursor: number | null;
}

export const ADMIN_AUDIT_ACTION_LABELS: Record<AdminAuditActionType, string> = {
  validator_add: 'Validator Added',
  validator_remove: 'Validator Removed',
  fee_withdrawal: 'Fees Withdrawn',
  pause: 'Contract Paused',
  unpause: 'Contract Unpaused',
};

export interface ReconciliationMismatch {
  actionType: AdminAuditActionType;
  /** 'missing_audit_entry': on-chain reality has no matching audit log record (e.g. a direct CLI call). */
  /** 'missing_onchain_effect': audit log recorded an action that isn't reflected on-chain. */
  kind: 'missing_audit_entry' | 'missing_onchain_effect';
  description: string;
  target?: string;
}

export interface ReconciliationResult {
  checkedAt: number;
  mismatches: ReconciliationMismatch[];
  /** Sections of the reconciliation that couldn't run (e.g. indexer unreachable). */
  skipped: string[];
}
