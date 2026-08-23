import { isRedirectReason, REDIRECT_REASONS } from '@/lib/redirectReason';

describe('isRedirectReason', () => {
  it.each(Object.keys(REDIRECT_REASONS))(
    'returns true for the valid reason %s',
    (reason) => {
      expect(isRedirectReason(reason)).toBe(true);
    },
  );

  it('returns false for an arbitrary unrecognized string', () => {
    expect(isRedirectReason('some-unknown-reason')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRedirectReason(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRedirectReason(undefined)).toBe(false);
  });

  it('returns false for an array of strings', () => {
    expect(isRedirectReason(['wallet-required', 'wallet-required'])).toBe(
      false,
    );
  });

  it('returns false for an empty string', () => {
    expect(isRedirectReason('')).toBe(false);
  });
});
