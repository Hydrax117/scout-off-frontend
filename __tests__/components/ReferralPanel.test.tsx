import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock lib/api at the Axios instance level so fetchReferralStats /
// generateReferralCode (which use api.get / api.post) are controllable.
jest.mock('@/lib/api', () => {
  const mockApi = {
    get: jest.fn(),
    post: jest.fn(),
  };
  // Default export is the axios instance; also expose named exports unchanged.
  return {
    __esModule: true,
    default: mockApi,
    // Keep any named exports that other modules may import from lib/api.
    fetchScoutStats: jest.fn(),
    fetchScoutProfile: jest.fn(),
    fetchScoutContacts: jest.fn(),
    fetchPlayerProfile: jest.fn(),
    fetchPlayerComments: jest.fn(),
    fetchChatHistory: jest.fn(),
    postChatMessage: jest.fn(),
  };
});

jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));

// ── Typed imports (after mocks) ───────────────────────────────────────────────

import api from '@/lib/api';
import ReferralPanel, {
  type ReferralStats,
  type ReferralCode,
} from '@/components/scout/ReferralPanel';
import { useToast } from '@/components/ui/Toast';

const mockApiGet = api.get as jest.Mock;
const mockApiPost = api.post as jest.Mock;
const mockUseToast = useToast as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCOUT_ID = 'scout-abc-123';

function makeStats(overrides: Partial<ReferralStats> = {}): ReferralStats {
  return {
    totalCodes: 5,
    successfulReferrals: 3,
    ...overrides,
  };
}

function makeNewCode(code = 'CODE-NEW'): ReferralCode {
  return { code, scoutWallet: '', createdAt: Date.now() / 1000, usedBy: null, usedAt: null };
}

function makeToast() {
  const show = jest.fn();
  mockUseToast.mockReturnValue({ show });
  return { show };
}

/** Setup api.get to resolve with the given stats wrapped as an axios response. */
function resolveStats(stats: ReferralStats) {
  mockApiGet.mockResolvedValue({ data: stats });
}

/** Setup api.get to reject. */
function rejectStats(err = new Error('Network Error')) {
  mockApiGet.mockRejectedValue(err);
}

/** Setup api.post to resolve with a new code. */
function resolveGenerate(code: ReferralCode) {
  mockApiPost.mockResolvedValue({ data: code });
}

/** Setup api.post to reject. */
function rejectGenerate(err = new Error('Server Error')) {
  mockApiPost.mockRejectedValue(err);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReferralPanel — initial loading state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    makeToast();
  });

  it('shows a loading skeleton while stats are being fetched', () => {
    // A promise that never resolves keeps the component in the loading state.
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<ReferralPanel scoutId={SCOUT_ID} />);
    expect(screen.getByLabelText('Loading stats')).toBeInTheDocument();
  });

  it('disables the Generate button while stats are loading', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<ReferralPanel scoutId={SCOUT_ID} />);
    expect(
      screen.getByRole('button', { name: /generate invite link/i }),
    ).toBeDisabled();
  });

  it('renders stats and codes after a successful load', async () => {
    resolveStats(makeStats());
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // totalReferrals
    });
    expect(screen.getByText('3')).toBeInTheDocument(); // activeReferrals
    expect(screen.getByText('CODE-001')).toBeInTheDocument();
    expect(screen.getByText('CODE-002')).toBeInTheDocument();
  });

  it('shows the "no invite links yet" message when codes list is empty', async () => {
    resolveStats(makeStats({ codes: [] }));
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/no invite links yet/i)).toBeInTheDocument();
    });
  });

  it('enables the Generate button after stats finish loading', async () => {
    resolveStats(makeStats());
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /generate invite link/i }),
      ).not.toBeDisabled(),
    );
  });
});

// ── Error state on initial load ───────────────────────────────────────────────

describe('ReferralPanel — API failure on load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an error toast when fetchReferralStats rejects', async () => {
    const { show } = makeToast();
    rejectStats();
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('error toast message mentions referral stats', async () => {
    const { show } = makeToast();
    rejectStats(new Error('500'));
    render(<ReferralPanel scoutId={SCOUT_ID} />);

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/referral stats/i),
          variant: 'error',
        }),
      );
    });
  });
});

// ── Generate invite link ──────────────────────────────────────────────────────

describe('ReferralPanel — generate invite link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    makeToast();
  });

  it('adds the new code to the list after successful generation', async () => {
    resolveStats(makeStats({ codes: [] }));
    resolveGenerate(makeNewCode('CODE-NEW'));

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /generate invite link/i }),
      ).not.toBeDisabled(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('CODE-NEW')).toBeInTheDocument();
    });
  });

  it('calls api.post with the correct endpoint', async () => {
    resolveStats(makeStats({ codes: [] }));
    resolveGenerate(makeNewCode());

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /generate invite link/i }),
      ).not.toBeDisabled(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      `/scouts/${SCOUT_ID}/referrals`,
    );
  });

  it('disables the Generate button while generation is in-flight', async () => {
    resolveStats(makeStats({ codes: [] }));
    // Promise that never resolves keeps the component generating
    mockApiPost.mockReturnValue(new Promise(() => {}));

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /generate invite link/i }),
      ).not.toBeDisabled(),
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    // After click, generating state is true → button is disabled and text changes.
    // The aria-label stays "Generate Invite Link"; check disabled + text content.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /generate invite link/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent(/generating/i);
    });
  });

  it('shows an error toast when generateReferralCode rejects', async () => {
    const { show } = makeToast();
    resolveStats(makeStats({ codes: [] }));
    rejectGenerate();

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /generate invite link/i }),
      ).not.toBeDisabled(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /generate invite link/i }),
      );
    });

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/generate invite link/i),
        variant: 'error',
      }),
    );
  });
});

// ── Copy to clipboard ─────────────────────────────────────────────────────────

describe('ReferralPanel — copy to clipboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    makeToast();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function mockClipboardSuccess() {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    return { writeText };
  }

  function mockClipboardFailure() {
    const writeText = jest
      .fn()
      .mockRejectedValue(new Error('ClipboardError'));
    Object.assign(navigator, { clipboard: { writeText } });
    return { writeText };
  }

  it('shows "Copied!" confirmation after clicking a copy button', async () => {
    mockClipboardSuccess();
    resolveStats(makeStats());

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText('CODE-001')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /copy invite link for code-001/i }),
      );
    });

    expect(
      screen.getByRole('button', { name: /copy invite link for code-001/i }),
    ).toHaveTextContent('Copied!');
  });

  it('"Copied!" label clears after ~2 seconds', async () => {
    mockClipboardSuccess();
    resolveStats(makeStats());

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText('CODE-001')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /copy invite link for code-001/i }),
      );
    });

    expect(
      screen.getByRole('button', { name: /copy invite link for code-001/i }),
    ).toHaveTextContent('Copied!');

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(
      screen.getByRole('button', { name: /copy invite link for code-001/i }),
    ).toHaveTextContent('Copy');
  });

  it('only shows "Copied!" on the clicked code, not others', async () => {
    mockClipboardSuccess();
    resolveStats(makeStats());

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText('CODE-001')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /copy invite link for code-001/i }),
      );
    });

    expect(
      screen.getByRole('button', { name: /copy invite link for code-001/i }),
    ).toHaveTextContent('Copied!');

    // The second code's button should still say "Copy"
    expect(
      screen.getByRole('button', { name: /copy invite link for code-002/i }),
    ).toHaveTextContent('Copy');
  });

  it('shows an error toast when the clipboard API fails', async () => {
    const { show } = makeToast();
    mockClipboardFailure();
    resolveStats(makeStats());

    render(<ReferralPanel scoutId={SCOUT_ID} />);
    await waitFor(() =>
      expect(screen.getByText('CODE-001')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /copy invite link for code-001/i }),
      );
    });

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error' }),
    );
  });
});
