import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletButton from '@/components/WalletButton';
import { ToastProvider } from '@/components/ui/Toast';

function renderWalletButton() {
  return render(
    <ToastProvider>
      <WalletButton />
    </ToastProvider>,
  );
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockConnectWithProvider = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnecting: false,
    connectingProvider: null,
    xlmBalance: null,
    balanceError: null,
    isLoadingBalance: false,
    walletProviderInfo: null,
    showWalletModal: true,
    closeWalletModal: jest.fn(),
    connectWithProvider: mockConnectWithProvider,
  }),
}));

// Mirrors context/WalletContext.tsx's real WALLET_PROVIDERS/WALLET_INSTALL_URLS
// — LOBSTR flagged comingSoon since lib/walletAdapters.ts's lobstr adapter is
// still a stub that unconditionally throws.
jest.mock('@/context/WalletContext', () => ({
  WALLET_PROVIDERS: [
    { provider: 'freighter', label: 'Freighter', icon: '🔶' },
    { provider: 'albedo', label: 'Albedo', icon: '✨' },
    { provider: 'lobstr', label: 'LOBSTR', icon: '🌐', comingSoon: true },
    { provider: 'ledger', label: 'Ledger', icon: '💎' },
  ],
  WALLET_INSTALL_URLS: {
    freighter: 'https://freighter.app',
    albedo: 'https://albedo.link',
    lobstr: 'https://lobstr.co',
    ledger: 'https://www.ledger.com/stellar-wallet',
  },
  isWalletInstalled: jest.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WalletButton — wallet-connect modal', () => {
  it('renders the LOBSTR option as disabled', async () => {
    renderWalletButton();

    const lobstrButton = (await screen.findByText('LOBSTR')).closest(
      'button',
    );

    expect(lobstrButton).not.toBeNull();
    expect(lobstrButton).toBeDisabled();
  });

  it('cannot be driven to trigger a LOBSTR connect attempt through normal interaction', async () => {
    const user = userEvent.setup();
    renderWalletButton();

    const lobstrButton = (await screen.findByText('LOBSTR')).closest(
      'button',
    ) as HTMLButtonElement;

    await user.click(lobstrButton);

    expect(mockConnectWithProvider).not.toHaveBeenCalled();
  });

  it('still allows connecting to a fully supported provider like Freighter', async () => {
    const user = userEvent.setup();
    renderWalletButton();

    const freighterButton = (await screen.findByText('Freighter')).closest(
      'button',
    ) as HTMLButtonElement;

    await user.click(freighterButton);

    expect(mockConnectWithProvider).toHaveBeenCalledWith('freighter', false);
  });
});
