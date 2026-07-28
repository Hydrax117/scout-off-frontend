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
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { rpc, NETWORK } from '@/lib/stellar';
import { walletAdapters } from '@/lib/walletAdapters';
import type { WalletProvider as WalletProviderAlias } from '@/lib/walletAdapters';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = WalletProviderAlias;

/** Stored wallet provider info used by WalletButton etc. */
export interface WalletProviderInfo {
  provider: WalletProvider;
  label: string;
  icon: string;
}

export const WALLET_PROVIDERS: WalletProviderInfo[] = [
  { provider: 'freighter', label: 'Freighter', icon: '🔶' },
  { provider: 'albedo', label: 'Albedo', icon: '✨' },
  { provider: 'lobstr', label: 'LOBSTR', icon: '🌐' },
];

/** Official install page for each wallet provider, used by the "Install" prompt. */
export const WALLET_INSTALL_URLS: Record<WalletProvider, string> = {
  freighter: 'https://freighter.app',
  albedo: 'https://albedo.link',
  lobstr: 'https://lobstr.co',
};

/** Checks whether a given wallet provider's extension/app is installed. */
export async function isWalletInstalled(
  provider: WalletProvider,
): Promise<boolean> {
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

function setStoredSession(publicKey: string, provider: WalletProvider) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      WALLET_SESSION_KEY,
      JSON.stringify({ publicKey, provider }),
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
      const account = await rpc.getAccount(address);
      const native = (
        account.balances as Array<{ asset_type: string; balance: string }>
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

  // Restore session from localStorage on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = getStoredSession();
        if (session) {
          const { publicKey: pk, provider } = session;
          setPublicKey(pk);
          setIsAuthenticated(true);
          setWalletProvider(provider);
          await loadBalance(pk);
        }
      } catch {
        // Silently fail session restore
      } finally {
        setIsRestoringSession(false);
      }
    }
    // Restore session expiry from localStorage
    const expiry = getSessionExpiry();
    if (expiry) setSessionExpiresAt(expiry);

    restoreSession();
  }, [loadBalance]);

  const openWalletModal = useCallback(() => setShowWalletModal(true), []);
  const closeWalletModal = useCallback(() => setShowWalletModal(false), []);

  const doConnect = useCallback(
    async (provider: WalletProvider, rememberMe = false) => {
      setIsConnecting(true);
      setConnectingProvider(provider);
      try {
        const pk = await walletAdapters[provider].getPublicKey();

        // SEP-10 Auth Flow
        const challengeRes = await fetch(`/api/auth/sep10?account=${pk}`);
        if (!challengeRes.ok) throw new Error('Failed to fetch auth challenge');
        const { transaction } = await challengeRes.json();

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
        const maxAge: number = authData.maxAge ?? (rememberMe ? 2592000 : 86400);
        const expiresAt = Date.now() + maxAge * 1000;

        setPublicKey(pk);
        setIsAuthenticated(true);
        setWalletProvider(provider);
        setStoredSession(pk, provider);
        setSessionExpiry(expiresAt);
        setSessionExpiresAt(expiresAt);
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
    removeSessionExpiry();
    mutate(() => true, undefined, { revalidate: false });
  }, []);

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<string> => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletProvider) throw new Error('No wallet provider selected');
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
