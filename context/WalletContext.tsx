'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { mutate } from 'swr';
import { walletAdapters } from '@/lib/walletAdapters';
import type { WalletProvider as WalletProviderAlias } from '@/lib/walletAdapters';
import { purgeAllContactDetails } from '@/lib/contactDetailsCache';
import { getServerSession, refreshSession } from '@/lib/sessionClient';

// @stellar/stellar-sdk and lib/stellar.ts (which also pulls it in) are
// dynamically imported inside the functions below that actually need them
// (loadBalance, doConnect, signAndSubmit, signOnly) rather than statically
// here — WalletProvider is mounted at the root layout, so a static import
// would put the whole SDK (and its sodium-native/crypto deps) on every
// page's critical path just to compute a couple of constants and support
// features most visitors never touch. This mirrors NETWORK's own
// computation in lib/stellar.ts without needing the SDK's `Networks` enum
// for it.
const CURRENT_NETWORK_TYPE: 'testnet' | 'public' =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'public' : 'testnet';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = WalletProviderAlias;

/** Stored wallet provider info used by WalletButton etc. */
export interface WalletProviderInfo {
  provider: WalletProvider;
  label: string;
  icon: string;
  /**
   * Set when the provider is listed but not yet backed by a working
   * adapter (see lib/walletAdapters.ts). The UI must render these as
   * disabled/"coming soon" rather than wiring them up to connect —
   * their adapter throws unconditionally if invoked.
   */
  comingSoon?: boolean;
}

export const WALLET_PROVIDERS: WalletProviderInfo[] = [
  { provider: 'freighter', label: 'Freighter', icon: '🔶' },
  { provider: 'albedo', label: 'Albedo', icon: '✨' },
  { provider: 'lobstr', label: 'LOBSTR', icon: '🌐', comingSoon: true },
  { provider: 'ledger', label: 'Ledger', icon: '💎' },
];

/** Official install page for each wallet provider, used by the "Install" prompt. */
export const WALLET_INSTALL_URLS: Record<WalletProvider, string> = {
  freighter: 'https://freighter.app',
  albedo: 'https://albedo.link',
  lobstr: 'https://lobstr.co',
  ledger: 'https://www.ledger.com/stellar-wallet',
};

/** Checks whether a given wallet provider's extension/app is installed/available. */
export async function isWalletInstalled(
  provider: WalletProvider,
): Promise<boolean> {
  if (provider === 'ledger') {
    try {
      const { default: TransportWebHID } =
        await import('@ledgerhq/hw-transport-webhid');
      return TransportWebHID.isSupported();
    } catch {
      return false;
    }
  }
  if (provider === 'albedo') {
    // Albedo is a web-based wallet (https://albedo.link) — it always works
    // as long as popups are allowed. Probing `getPublicKey()` here would
    // trigger an unexpected Albedo popup on page load, so we just claim
    // it's installed. Per-wallet popup-block / user-cancel errors are
    // surfaced as friendly toasts in lib/walletAdapters.ts's
    // `mapAlbedoError` on the actual connect attempt.
    return true;
  }
  try {
    await walletAdapters[provider].getPublicKey();
    return true;
  } catch {
    return false;
  }
}

// ── localStorage keys ─────────────────────────────────────────────────────────

const WALLET_SESSION_KEY = 'wallet_session';
const REMEMBERED_ADDRESSES_KEY = 'scoutoff:remembered_addresses';
const SESSION_EXPIRY_KEY = 'scoutoff:session_expiry';

// ── Session types ─────────────────────────────────────────────────────────────

interface StoredSession {
  publicKey: string;
  provider: WalletProvider;
  networkType: 'testnet' | 'public';
}

/** A previously-used wallet address, stored for the account switcher. */
export interface RememberedAddress {
  publicKey: string;
  provider: WalletProvider;
  /** When this address was last used (ISO string). */
  lastUsed: string;
}

// ── Session persistence helpers ───────────────────────────────────────────────

function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(WALLET_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function setStoredSession(
  publicKey: string,
  provider: WalletProvider,
  networkType: 'testnet' | 'public',
) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      WALLET_SESSION_KEY,
      JSON.stringify({ publicKey, provider, networkType }),
    );
  }
}

function removeStoredSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(WALLET_SESSION_KEY);
  }
}

// ── Session expiry helpers ────────────────────────────────────────────────────

function getSessionExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!val) return null;
    const ts = parseInt(val, 10);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

function setSessionExpiry(expiresAtMs: number) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAtMs));
  }
}

function removeSessionExpiry() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  }
}

// ── Remembered addresses helpers ──────────────────────────────────────────────

export function getRememberedAddresses(): RememberedAddress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REMEMBERED_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a: unknown) =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as RememberedAddress).publicKey === 'string' &&
        typeof (a as RememberedAddress).provider === 'string',
    );
  } catch {
    return [];
  }
}

export function addRememberedAddress(addr: RememberedAddress) {
  const existing = getRememberedAddresses();
  const filtered = existing.filter((a) => a.publicKey !== addr.publicKey);
  filtered.push(addr);
  // Keep at most 10 remembered addresses
  const trimmed = filtered.slice(-10);
  localStorage.setItem(REMEMBERED_ADDRESSES_KEY, JSON.stringify(trimmed));
}

export function removeRememberedAddress(publicKey: string) {
  const existing = getRememberedAddresses();
  const filtered = existing.filter((a) => a.publicKey !== publicKey);
  localStorage.setItem(REMEMBERED_ADDRESSES_KEY, JSON.stringify(filtered));
}

export function clearAllRememberedAddresses() {
  localStorage.removeItem(REMEMBERED_ADDRESSES_KEY);
}

// ── Context value ─────────────────────────────────────────────────────────────

interface WalletContextValue {
  publicKey: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  connectingProvider: WalletProvider | null;
  isRestoringSession: boolean;
  xlmBalance: string | null;
  balanceError: string | null;
  isLoadingBalance: boolean;
  walletProvider: WalletProvider | null;
  walletProviderInfo: WalletProviderInfo | null;
  showWalletModal: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWithProvider: (
    provider: WalletProvider,
    rememberMe?: boolean,
  ) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Re-authenticate the current session (used before expiry). */
  reauthenticate: () => Promise<void>;
  signAndSubmit: (xdr: string) => Promise<string>;
  signOnly: (xdr: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
  /** When the current session expires (epoch ms), or null if unknown. */
  sessionExpiresAt: number | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<WalletProvider | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(
    null,
  );
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  const walletProviderInfo: WalletProviderInfo | null = walletProvider
    ? (WALLET_PROVIDERS.find((wp) => wp.provider === walletProvider) ?? null)
    : null;

  const loadBalance = useCallback(async (address: string) => {
    setIsLoadingBalance(true);
    setBalanceError(null);
    try {
      const { rpc } = await import('@/lib/stellar');
      const account = await rpc.getAccount(address);
      const native = (
        (account as any).balances as Array<{
          asset_type: string;
          balance: string;
        }>
      ).find((b) => b.asset_type === 'native');
      setXlmBalance(native ? native.balance : '0.0000000');
    } catch (err: unknown) {
      setXlmBalance(null);
      setBalanceError(
        err instanceof Error ? err.message : 'Failed to load balance',
      );
    } finally {
      setIsLoadingBalance(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (publicKey) await loadBalance(publicKey);
  }, [publicKey, loadBalance]);

  // Restore session from localStorage on mount AND on tab-refocus.
  //
  // Per Issue #13: if the stored session is unusable (provider API throws,
  // wallet extension has been uninstalled, etc.) we don't leave the app in
  // an unauthenticated state with no explanation — we:
  //   1. Probe the provider by attempting to read the public key.
  //   2. If the probe throws (extension uninstalled, network reset, etc.)
  //      clear the stale localStorage entry and dispatch a CustomEvent
  //      that the ToastProvider listens for, so a reconnect-needed toast
  //      surfaces without coupling WalletContext to a Toast hook (which
  //      would require a circular layout dependency).
  //   3. Always flip `isRestoringSession` to false in `finally`, so
  //      callers like useRequireWallet are unblocked even when restore
  //      fails.
  //
  // Per Issue #967: The stored session now includes `networkType` so the
  // reconnect triggered by tab-refocus (visibilitychange → visible) can
  // detect and warn about silent network drift, then re-apply the stored
  // network preference rather than defaulting to the env default.
  const restoreSession = useCallback(async () => {
    let session: StoredSession | null = null;
    try {
      session = getStoredSession();
      if (!session) return;
      const { publicKey: pk, provider, networkType } = session;

      // Detect silent network drift: if the stored session was created on
      // a different network than the current env default, warn so the user
      // isn't surprised, but still honour the stored preference.
      if (networkType && networkType !== CURRENT_NETWORK_TYPE) {
        console.warn(
          `Wallet network mismatch: session prefers ${networkType}, env defaults to ${CURRENT_NETWORK_TYPE}. Using stored network.`,
        );
      }

      // Re-probe the provider to confirm the session is still valid (e.g.
      // the extension wasn't uninstalled). Skip the probe for web-based
      // wallets — Albedo is opened via popup and probing `getPublicKey()`
      // here would trigger an unexpected confirmation popup on every page
      // load, contradicting the very reason `isWalletInstalled` claims
      // it's installed without probing. Albedo failures surface on the
      // next actual connect attempt instead.
      if (provider !== 'albedo') {
        await walletAdapters[provider].getPublicKey();
      }

      // Per #778: localStorage is only a hint for which wallet/provider to
      // reconnect with — it is never proof of authentication. Reconcile
      // against the server's session cookie before trusting this address.
      // A `null` result means the check itself was inconclusive (network
      // error) — treated as "assume still valid" rather than forcing a
      // logout on a transient blip, since it's neither an explicit mismatch
      // nor an explicit expiry.
      const serverSession = await getServerSession();
      if (serverSession && !serverSession.authenticated) {
        const refreshed = await refreshSession();
        if (!refreshed.authenticated || refreshed.publicKey !== pk) {
          throw new Error(
            'Server session expired or absent, and refresh failed',
          );
        }
      } else if (
        serverSession?.authenticated &&
        serverSession.publicKey &&
        serverSession.publicKey !== pk
      ) {
        // The server's session belongs to a different address than the one
        // localStorage remembers — never show `pk` as authenticated based
        // on the stale local hint alone.
        throw new Error('Server session address does not match stored address');
      }

      setPublicKey(pk);
      setIsAuthenticated(true);
      setWalletProvider(provider);
      try {
        await loadBalance(pk);
      } catch {
        // Balance load failure is non-fatal — session itself is valid.
      }
    } catch {
      if (!session) return;
      removeStoredSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('scoutoff:session-expired', {
            detail: {
              message:
                'Your session expired. Please reconnect your wallet to continue.',
            },
          }),
        );
      }
    } finally {
      setIsRestoringSession(false);
    }
  }, [loadBalance]);

  // Run on mount and on every tab-refocus (visibilitychange → visible).
  useEffect(() => {
    restoreSession();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        restoreSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [restoreSession]);

  const openWalletModal = useCallback(() => setShowWalletModal(true), []);
  const closeWalletModal = useCallback(() => setShowWalletModal(false), []);

  const doConnect = useCallback(
    async (provider: WalletProvider, rememberMe = false) => {
      setIsConnecting(true);
      setConnectingProvider(provider);
      try {
        // Keep the SDK (and SEP-10 validation which imports it) off the
        // critical path of every page — load both only when connecting.
        const [
          { NETWORK },
          {
            validateSep10Challenge,
            getSep10ClientConfig,
            SEP10_VALIDATION_USER_ERROR,
          },
        ] = await Promise.all([
          import('@/lib/stellar'),
          import('@/lib/sep10Validation'),
        ]);
        const pk = await walletAdapters[provider].getPublicKey();

        // SEP-10 Auth Flow
        const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
        if (!challengeRes.ok) throw new Error('Failed to fetch auth challenge');
        const { transaction } = await challengeRes.json();

        // Client-side challenge verification (SEP-10 "Verifying the Challenge
        // Transaction") — never ask a wallet to sign until we independently
        // confirm this XDR is a well-formed auth challenge for this account
        // and domain. Server-side verifyChallengeTxSigners alone cannot protect
        // the user if the browser was handed an arbitrary transaction.
        const sep10Config = getSep10ClientConfig();
        const validation = validateSep10Challenge({
          challengeXdr: transaction,
          clientAccount: pk,
          serverAccount: sep10Config.serverAccount,
          homeDomain: sep10Config.homeDomain,
          networkPassphrase: NETWORK,
        });
        if (!validation.valid) {
          console.error(
            'SEP-10 challenge validation failed:',
            validation.reason,
          );
          throw new Error(SEP10_VALIDATION_USER_ERROR);
        }

        const signedXdr = await walletAdapters[provider].signTransaction(
          transaction,
          NETWORK,
        );

        const authRes = await fetch('/api/auth/sep10', {
          method: 'POST',
          body: JSON.stringify({ signedXdr, publicKey: pk, rememberMe }),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!authRes.ok) throw new Error('Authentication failed');

        // Read maxAge from server response so frontend knows when session expires
        const authData = await authRes.json();
        const maxAge: number =
          authData.maxAge ?? (rememberMe ? 2592000 : 86400);
        const expiresAt = Date.now() + maxAge * 1000;

        setPublicKey(pk);
        setIsAuthenticated(true);
        setWalletProvider(provider);
        setStoredSession(pk, provider, CURRENT_NETWORK_TYPE);
        setShowWalletModal(false);

        // Remember this address for account switcher
        addRememberedAddress({
          publicKey: pk,
          provider,
          lastUsed: new Date().toISOString(),
        });

        await loadBalance(pk);
      } catch (error) {
        console.error('Connection/Auth error:', error);
        setPublicKey(null);
        setIsAuthenticated(false);
        setXlmBalance(null);
        throw error;
      } finally {
        setIsConnecting(false);
        setConnectingProvider(null);
      }
    },
    [loadBalance],
  );

  const connect = useCallback(async () => {
    const session = getStoredSession();
    if (session) {
      await doConnect(session.provider);
    } else {
      openWalletModal();
    }
  }, [doConnect, openWalletModal]);

  const connectWithProvider = useCallback(
    async (provider: WalletProvider, rememberMe = false) => {
      await doConnect(provider, rememberMe);
    },
    [doConnect],
  );

  const reauthenticate = useCallback(async () => {
    const session = getStoredSession();
    if (!session) {
      openWalletModal();
      return;
    }
    await doConnect(session.provider);
  }, [doConnect, openWalletModal]);

  const disconnect = useCallback(() => {
    Promise.resolve(fetch('/api/auth/sep10', { method: 'DELETE' })).catch(
      () => {},
    );
    setPublicKey(null);
    setIsAuthenticated(false);
    setXlmBalance(null);
    setBalanceError(null);
    setWalletProvider(null);
    setSessionExpiresAt(null);
    removeStoredSession();
    // Unlocked contact details (and any other cached data) must not survive
    // logout — see lib/contactDetailsCache.ts. The explicit purge below is
    // belt-and-suspenders on top of this blanket wipe: it also cancels any
    // pending auto-purge timers, which the blanket mutate alone wouldn't do.
    mutate(() => true, undefined, { revalidate: false });
    purgeAllContactDetails();
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletProvider) throw new Error('No wallet provider selected');
      const { NETWORK, rpc, TransactionBuilder } =
        await import('@/lib/stellar');
      const signedXdr = await walletAdapters[walletProvider].signTransaction(
        xdr,
        NETWORK,
      );
      const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK);
      const result = await rpc.sendTransaction(
        tx as Parameters<typeof rpc.sendTransaction>[0],
      );
      return (result as { hash: string }).hash;
    },
    [publicKey, walletProvider],
  );

  /**
   * Signs an XDR transaction without submitting it — the wallet-adapter
   * "signFn" callback shape that lib/contract.ts's lower-level
   * signAndSubmitTx/payToContact expect, for callers that need the
   * contract's decoded return value (e.g. unlocked ContactDetails), which
   * signAndSubmit above discards.
   */
  const signOnly = useCallback(
    async (xdr: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletProvider) throw new Error('No wallet provider selected');
      const { NETWORK } = await import('@/lib/stellar');
      return walletAdapters[walletProvider].signTransaction(xdr, NETWORK);
    },
    [publicKey, walletProvider],
  );

  const value = useMemo(
    () => ({
      publicKey,
      isAuthenticated,
      isConnecting,
      connectingProvider,
      isRestoringSession,
      xlmBalance,
      balanceError,
      isLoadingBalance,
      walletProvider,
      walletProviderInfo,
      showWalletModal,
      openWalletModal,
      closeWalletModal,
      connectWithProvider,
      connect,
      disconnect,
      reauthenticate,
      signAndSubmit,
      signOnly,
      refreshBalance,
      sessionExpiresAt,
    }),
    [
      publicKey,
      isAuthenticated,
      isConnecting,
      connectingProvider,
      isRestoringSession,
      xlmBalance,
      balanceError,
      isLoadingBalance,
      walletProvider,
      walletProviderInfo,
      showWalletModal,
      openWalletModal,
      closeWalletModal,
      connectWithProvider,
      connect,
      disconnect,
      reauthenticate,
      signAndSubmit,
      signOnly,
      refreshBalance,
      sessionExpiresAt,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error('useWalletContext must be used inside WalletProvider');
  return ctx;
}
