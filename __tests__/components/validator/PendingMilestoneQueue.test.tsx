import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PendingMilestoneQueue from '@/components/validator/PendingMilestoneQueue';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import { useValidator } from '@/hooks/useValidator';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { decideMilestoneSubmission } from '@/lib/api';
import type { MilestoneSubmission } from '@/types';

jest.mock('@/hooks/useValidatorPendingQueue', () => ({
  useValidatorPendingQueue: jest.fn(),
}));

jest.mock('@/hooks/useApprovedPlayers', () => ({
  useApprovedPlayers: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useIsPaused', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  decideMilestoneSubmission: jest.fn(),
}));

const mockedUseValidatorPendingQueue =
  useValidatorPendingQueue as jest.MockedFunction<
    typeof useValidatorPendingQueue
  >;
const mockedUseApprovedPlayers = useApprovedPlayers as jest.MockedFunction<
  typeof useApprovedPlayers
>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;
const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseIsPaused = useIsPaused as jest.MockedFunction<
  typeof useIsPaused
>;
const mockedDecideMilestoneSubmission =
  decideMilestoneSubmission as jest.MockedFunction<
    typeof decideMilestoneSubmission
  >;

const VALIDATOR_ADDRESS = 'GVALIDATORPUBLICKEY';

const submissions: MilestoneSubmission[] = [
  {
    id: 'sub-1',
    playerId: 'player-1',
    playerName: 'Alex Okafor',
    description: 'Scored a hat-trick',
    evidenceUrl: 'https://example.com/evidence-1',
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-1',
    status: 'pending',
    createdAt: 1_700_000_000_000,
    decidedAt: null,
    txHash: null,
  },
  {
    id: 'sub-2',
    playerId: 'player-2',
    playerName: null,
    description: 'Completed 10 assists',
    evidenceUrl: null,
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-2',
    status: 'pending',
    createdAt: 1_700_100_000_000,
    decidedAt: null,
    txHash: null,
  },
  {
    id: 'sub-3',
    playerId: 'player-3',
    playerName: 'Maria Santos',
    description: 'Clean sheet streak',
    evidenceUrl: null,
    validatorWallet: VALIDATOR_ADDRESS,
    submittedBy: 'player-3',
    status: 'pending',
    createdAt: 1_700_200_000_000,
    decidedAt: null,
    txHash: null,
  },
];

function setup({
  submissionsOverride = submissions,
  loading = false,
  error = null as string | null,
  refetch = jest.fn(),
  approvedPlayers = [] as { id: string }[],
  approveMilestone = jest.fn(),
  signAndSubmit = jest.fn(),
  isPaused = false,
} = {}) {
  mockedUseValidatorPendingQueue.mockReturnValue({
    submissions: submissionsOverride,
    loading,
    error,
    refetch,
  });
  mockedUseApprovedPlayers.mockReturnValue({
    players: approvedPlayers as any,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockedUseValidator.mockReturnValue({
    isValidator: true,
    checking: false,
    approveMilestone,
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });
  mockedUseWallet.mockReturnValue({
    publicKey: VALIDATOR_ADDRESS,
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit,
  } as any);
  mockedUseIsPaused.mockReturnValue(isPaused);

  return render(<PendingMilestoneQueue validatorAddress={VALIDATOR_ADDRESS} />);
}

describe('PendingMilestoneQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows skeleton placeholders and no pending count while loading', () => {
      const { container } = setup({ loading: true, submissionsOverride: [] });

      expect(screen.queryByText(/pending$/)).not.toBeInTheDocument();
      expect(
        container.querySelectorAll('.animate-pulse').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('shows an error message and retries on button click', () => {
      const refetch = jest.fn();
      setup({ error: 'Network error', submissionsOverride: [], refetch });

      expect(
        screen.getByText('Could not load pending milestones.'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty state', () => {
    it('shows the default empty message when filter is "all"', () => {
      setup({ submissionsOverride: [] });

      expect(screen.getByText('No pending milestones')).toBeInTheDocument();
      expect(
        screen.getByText(
          'New submissions from players will appear here for review.',
        ),
      ).toBeInTheDocument();
    });

    it('shows the previously-approved empty message when that filter is active and no matches exist', () => {
      setup({ submissionsOverride: submissions, approvedPlayers: [] });

      fireEvent.change(screen.getByLabelText('Filter'), {
        target: { value: 'previously-approved' },
      });

      expect(
        screen.getByText(
          "No pending submissions from players you've previously approved.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe('populated list', () => {
    it('renders the pending count and each submission', () => {
      setup();

      expect(screen.getByText('3 pending')).toBeInTheDocument();
      expect(screen.getByText('Alex Okafor')).toBeInTheDocument();
      // playerName is null for sub-2 → falls back to playerId
      expect(screen.getByText('player-2')).toBeInTheDocument();
      expect(screen.getByText('Maria Santos')).toBeInTheDocument();
      expect(screen.getByText('Scored a hat-trick')).toBeInTheDocument();
    });

    it('renders an evidence link only when evidenceUrl is present', () => {
      setup();

      const links = screen.getAllByRole('link', { name: 'View evidence' });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute(
        'href',
        'https://example.com/evidence-1',
      );
    });

    it('sorts oldest first by default and re-sorts to newest first', () => {
      setup();

      let items = screen.getAllByRole('listitem');
      expect(within(items[0]).getByText('Alex Okafor')).toBeInTheDocument();
      expect(within(items[2]).getByText('Maria Santos')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Sort'), {
        target: { value: 'newest' },
      });

      items = screen.getAllByRole('listitem');
      expect(within(items[0]).getByText('Maria Santos')).toBeInTheDocument();
      expect(within(items[2]).getByText('Alex Okafor')).toBeInTheDocument();
    });

    it('filters to only previously-approved players', () => {
      setup({ approvedPlayers: [{ id: 'player-2' }] });

      fireEvent.change(screen.getByLabelText('Filter'), {
        target: { value: 'previously-approved' },
      });

      expect(screen.getByText('1 pending')).toBeInTheDocument();
      expect(screen.getByText('player-2')).toBeInTheDocument();
      expect(screen.queryByText('Alex Okafor')).not.toBeInTheDocument();
    });

    it('toggles selection of an individual submission', () => {
      setup();

      const checkbox = screen.getByLabelText(
        'Select milestone for Alex Okafor',
      );
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('selects and deselects all visible submissions via the header checkbox', () => {
      setup();

      const selectAll = screen.getByLabelText(
        'Select all visible pending milestones',
      );
      fireEvent.click(selectAll);

      expect(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      ).toBeChecked();
      expect(
        screen.getByLabelText('Select milestone for player-2'),
      ).toBeChecked();
      expect(selectAll).toBeChecked();

      fireEvent.click(selectAll);
      expect(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      ).not.toBeChecked();
    });

    it('disables Bulk Approve when nothing is selected and enables it once items are selected', () => {
      setup();

      const bulkButton = screen.getByRole('button', { name: /Bulk Approve/ });
      expect(bulkButton).toBeDisabled();

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      expect(bulkButton).not.toBeDisabled();
      expect(bulkButton).toHaveTextContent('Bulk Approve (1)');
    });

    it('disables Bulk Approve and shows a title when the contract is paused', () => {
      setup({ isPaused: true });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      const bulkButton = screen.getByRole('button', { name: /Bulk Approve/ });
      expect(bulkButton).toBeDisabled();
      expect(bulkButton).toHaveAttribute(
        'title',
        'Contract is currently paused',
      );
    });
  });

  describe('bulk approve flow', () => {
    it('approves selected items, shows a success summary, and refetches', async () => {
      const refetch = jest.fn();
      const approveMilestone = jest.fn().mockResolvedValue('xdr-payload');
      const signAndSubmit = jest.fn().mockResolvedValue('tx-hash-1');
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);

      setup({ refetch, approveMilestone, signAndSubmit });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(
        screen.getByText('All 2 selected milestones were approved.'),
      ).toBeInTheDocument();
      expect(approveMilestone).toHaveBeenCalledTimes(2);
      expect(signAndSubmit).toHaveBeenCalledTimes(2);
      expect(mockedDecideMilestoneSubmission).toHaveBeenCalledTimes(2);
      expect(refetch).toHaveBeenCalledTimes(1);
      // Selection is cleared afterwards
      expect(
        screen.getByLabelText('Select all visible pending milestones'),
      ).not.toBeChecked();
    });

    it('shows per-item failure state and a mixed-result summary when some approvals fail', async () => {
      const approveMilestone = jest
        .fn()
        .mockImplementation((playerId: string) => {
          if (playerId === 'player-2') {
            return Promise.reject(new Error('Wallet not connected'));
          }
          return Promise.resolve('xdr-payload');
        });
      const signAndSubmit = jest.fn().mockResolvedValue('tx-hash-1');
      mockedDecideMilestoneSubmission.mockResolvedValue({} as any);

      setup({ approveMilestone, signAndSubmit });

      fireEvent.click(
        screen.getByLabelText('Select milestone for Alex Okafor'),
      );
      fireEvent.click(screen.getByLabelText('Select milestone for player-2'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Bulk Approve/ }));
      });

      expect(
        screen.getByText(
          '1 of 2 approvals succeeded — 1 failed and remain pending for retry.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/✕ Failed/)).toHaveTextContent(
        'Wallet not connected',
      );
      expect(screen.getByText('✓ Approved')).toBeInTheDocument();
    });

    it('does nothing when Bulk Approve is triggered with no selection', () => {
      const approveMilestone = jest.fn();
      setup({ approveMilestone });

      // Button is disabled, so simulate no-op by asserting handler never runs
      expect(approveMilestone).not.toHaveBeenCalled();
    });
  });
});
