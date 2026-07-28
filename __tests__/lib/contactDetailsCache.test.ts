import { renderHook, act, waitFor } from '@testing-library/react';
import useSWR, { mutate as globalMutate } from 'swr';
import {
  CONTACT_DETAILS_TTL_MS,
  contactDetailsKey,
  cacheContactDetails,
  purgeContactDetails,
  purgeAllContactDetails,
} from '@/lib/contactDetailsCache';
import type { ContactDetails } from '@/types';

const DETAILS: ContactDetails = { email: 'p@example.com' };

beforeEach(() => {
  jest.useRealTimers();
  // These functions write through SWR's global (unscoped) cache by design
  // (see the module doc comment — it's the same cache WalletContext's
  // disconnect() wipes), so reset it directly between tests.
  globalMutate(() => true, undefined, { revalidate: false });
});

function useCached(key: string | null) {
  return renderHook(() =>
    useSWR<ContactDetails>(key, null, { revalidateOnFocus: false }),
  );
}

describe('contactDetailsCache — storage policy', () => {
  test('never touches localStorage', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const key = contactDetailsKey('player-1', 'scout-1');

    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  test('cacheContactDetails makes the entry immediately readable by key', async () => {
    const key = contactDetailsKey('player-1', 'scout-1');
    const { result } = useCached(key);

    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });

    expect(result.current.data).toEqual(DETAILS);
  });
});

describe('contactDetailsCache — purge behavior', () => {
  test('purgeContactDetails clears a single entry immediately', async () => {
    const key = contactDetailsKey('player-1', 'scout-1');
    const { result } = useCached(key);

    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });
    expect(result.current.data).toEqual(DETAILS);

    await act(async () => {
      await purgeContactDetails(key);
    });

    expect(result.current.data).toBeUndefined();
  });

  test('purgeAllContactDetails clears every contact:* entry across multiple players', async () => {
    const keyA = contactDetailsKey('player-A', 'scout-1');
    const keyB = contactDetailsKey('player-B', 'scout-1');
    const a = useCached(keyA);
    const b = useCached(keyB);

    await act(async () => {
      await cacheContactDetails(keyA, DETAILS);
      await cacheContactDetails(keyB, { phone: '+1' });
    });
    expect(a.result.current.data).toEqual(DETAILS);
    expect(b.result.current.data).toEqual({ phone: '+1' });

    await act(async () => {
      await purgeAllContactDetails();
    });

    expect(a.result.current.data).toBeUndefined();
    expect(b.result.current.data).toBeUndefined();
  });

  test('purgeAllContactDetails does not touch unrelated cache keys', async () => {
    const unrelatedKey = 'player:some-other-hook-key';
    await globalMutate(unrelatedKey, { unrelated: true }, {
      revalidate: false,
    });

    await act(async () => {
      await purgeAllContactDetails();
    });

    const { result } = renderHook(() =>
      useSWR(unrelatedKey, null, { revalidateOnFocus: false }),
    );
    expect(result.current.data).toEqual({ unrelated: true });
  });

  test('an entry is not retrievable from cache after its TTL elapses', async () => {
    jest.useFakeTimers();
    const key = contactDetailsKey('player-1', 'scout-1');
    const { result } = useCached(key);

    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });
    expect(result.current.data).toEqual(DETAILS);

    await act(async () => {
      jest.advanceTimersByTime(CONTACT_DETAILS_TTL_MS);
      await Promise.resolve();
    });

    expect(result.current.data).toBeUndefined();
    jest.useRealTimers();
  });

  test('re-caching the same key resets the TTL window', async () => {
    jest.useFakeTimers();
    const key = contactDetailsKey('player-1', 'scout-1');
    const { result } = useCached(key);

    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });
    await act(async () => {
      jest.advanceTimersByTime(CONTACT_DETAILS_TTL_MS / 2);
      await Promise.resolve();
    });
    await act(async () => {
      await cacheContactDetails(key, DETAILS);
    });
    await act(async () => {
      jest.advanceTimersByTime(CONTACT_DETAILS_TTL_MS / 2 + 1000);
      await Promise.resolve();
    });

    expect(result.current.data).toEqual(DETAILS);
    jest.useRealTimers();
  });
});
