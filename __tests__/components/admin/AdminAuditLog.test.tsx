import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminAuditLog from '@/components/admin/AdminAuditLog';
import { useAdminAuditLog } from '@/hooks/useAdminAuditLog';
import type { AdminAuditEntry, ReconciliationResult } from '@/lib/adminAudit';

jest.mock('@/hooks/useAdminAuditLog', () => ({
  useAdminAuditLog: jest.fn(),
}));

const mockUseAdminAuditLog = useAdminAuditLog as jest.Mock;

const runReconciliation = jest.fn();
const setFilter = jest.fn();
const refetch = jest.fn();

function makeEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: 1,
    actionType: 'validator_add',
    adminWallet: 'GADMIN1234567890GADMIN1234567890GADMIN1234567890GADM',
    target: 'GVAL1234567890GVAL1234567890GVAL1234567890GVAL1234567890',
    amountStroops: null,
    txHash: 'txhash1',
    status: 'submitted',
    timestamp: 1_700_000_000,
    data: {},
    ...overrides,
  };
}

function baseState(overrides: Partial<ReturnType<typeof useAdminAuditLog>> = {}) {
  return {
    entries: [],
    loading: false,
    error: false,
    filter: {},
    setFilter,
    reconciliation: null,
    reconciling: false,
    runReconciliation,
    refetch,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
});

describe('AdminAuditLog', () => {
  it('shows an empty state when there are no entries', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState());
    render(<AdminAuditLog />);
    expect(screen.getByText(/no admin actions recorded/i)).toBeInTheDocument();
  });

  it('renders a row per audit entry', () => {
    mockUseAdminAuditLog.mockReturnValue(
      baseState({ entries: [makeEntry(), makeEntry({ id: 2, actionType: 'pause', target: null })] }),
    );
    render(<AdminAuditLog />);
    expect(screen.getByText('Validator Added')).toBeInTheDocument();
    expect(screen.getByText('Contract Paused')).toBeInTheDocument();
  });

  it('does not show a mismatch banner when reconciliation found nothing', () => {
    mockUseAdminAuditLog.mockReturnValue(
      baseState({
        reconciliation: { checkedAt: 1, mismatches: [], skipped: [] } as ReconciliationResult,
      }),
    );
    render(<AdminAuditLog />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a non-dismissible alert banner listing each mismatch', () => {
    mockUseAdminAuditLog.mockReturnValue(
      baseState({
        reconciliation: {
          checkedAt: 1,
          mismatches: [
            {
              actionType: 'pause',
              kind: 'missing_audit_entry',
              description: 'Contract is paused on-chain with no audit record.',
            },
          ],
          skipped: [],
        } as ReconciliationResult,
      }),
    );
    render(<AdminAuditLog />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('1 reconciliation mismatch');
    expect(alert).toHaveTextContent(
      'Contract is paused on-chain with no audit record.',
    );
    // Non-dismissible: no dismiss/close button inside the alert.
    expect(
      screen.queryByRole('button', { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the skipped-section note when part of reconciliation could not run', () => {
    mockUseAdminAuditLog.mockReturnValue(
      baseState({
        reconciliation: {
          checkedAt: 1,
          mismatches: [],
          skipped: ['fee_withdrawal: indexer unavailable, skipped'],
        } as ReconciliationResult,
      }),
    );
    render(<AdminAuditLog />);
    expect(screen.getByText(/indexer unavailable/i)).toBeInTheDocument();
  });

  it('disables the export button when there are no entries', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState());
    render(<AdminAuditLog />);
    expect(screen.getByRole('button', { name: /export as csv/i })).toBeDisabled();
  });

  it('triggers a CSV download when export is clicked with entries present', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState({ entries: [makeEntry()] }));
    render(<AdminAuditLog />);

    fireEvent.click(screen.getByRole('button', { name: /export as csv/i }));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('calls runReconciliation when "Run Reconciliation" is clicked', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState());
    render(<AdminAuditLog />);

    fireEvent.click(screen.getByRole('button', { name: /run reconciliation/i }));
    expect(runReconciliation).toHaveBeenCalled();
  });

  it('applies a date range filter', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState());
    render(<AdminAuditLog />);

    fireEvent.change(screen.getByLabelText(/from/i), {
      target: { value: '2024-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(setFilter).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Number) }),
    );
  });

  it('filters by action type', () => {
    mockUseAdminAuditLog.mockReturnValue(baseState());
    render(<AdminAuditLog />);

    fireEvent.change(screen.getByLabelText(/action type/i), {
      target: { value: 'pause' },
    });

    expect(setFilter).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'pause' }),
    );
  });
});
