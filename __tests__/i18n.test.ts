/**
 * #531 — Unit tests for i18n.ts request config
 *
 * Verifies that:
 * - A valid locale ('en', 'fr', 'sw') loads the correct messages object.
 * - An unsupported / empty locale falls back to English messages.
 * - The correct locale string is returned alongside the messages.
 *
 * We test the ROOT i18n.ts (not i18n/request.ts) because that is the file
 * referenced directly by issues #531 and it contains its own locale-fallback
 * logic. The real message files from messages/ are used so assertions can't
 * silently drift from live content.
 */

import enMessages from '../messages/en.json';
import frMessages from '../messages/fr.json';
import swMessages from '../messages/sw.json';

// ─── Mock next-intl/server ──────────────────────────────────────────────────
// getRequestConfig is a higher-order function that receives a callback and
// returns it directly (for test purposes). We capture that callback so we
// can call it ourselves with controlled requestLocale values.

type RequestConfigCallback = (opts: {
  requestLocale: Promise<string | undefined>;
}) => Promise<{ locale: string; messages: Record<string, unknown> }>;

let capturedCallback: RequestConfigCallback | null = null;

jest.mock('next-intl/server', () => ({
  getRequestConfig: jest.fn((cb: RequestConfigCallback) => {
    capturedCallback = cb;
    return cb; // mirror real behaviour: returns the callback
  }),
}));

// Import the module under test AFTER the mock is in place so the mock fires
// during module initialisation and captures the callback.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../i18n');

// Helper: call the captured callback with a given requestLocale string.
async function callConfig(rawLocale: string | undefined) {
  if (!capturedCallback) throw new Error('getRequestConfig callback not captured');
  return capturedCallback({ requestLocale: Promise.resolve(rawLocale) });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('i18n.ts — getRequestConfig callback', () => {
  it('getRequestConfig was called during module load', () => {
    expect(capturedCallback).not.toBeNull();
  });

  // ── Valid locales ───────────────────────────────────────────────────────────

  it('returns English messages for locale "en"', async () => {
    const result = await callConfig('en');
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(enMessages);
  });

  it('returns French messages for locale "fr"', async () => {
    const result = await callConfig('fr');
    expect(result.locale).toBe('fr');
    expect(result.messages).toEqual(frMessages);
  });

  it('returns Swahili messages for locale "sw"', async () => {
    const result = await callConfig('sw');
    expect(result.locale).toBe('sw');
    expect(result.messages).toEqual(swMessages);
  });

  // Spot-check a known key so the assertion is anchored to real content
  it('English messages contain the expected app_title key', async () => {
    const result = await callConfig('en');
    expect((result.messages as Record<string, unknown>).app_title).toBe(
      enMessages.app_title,
    );
  });

  it('French messages contain a distinct nav.scout_dashboard translation', async () => {
    const result = await callConfig('fr');
    const messages = result.messages as typeof frMessages;
    expect(messages.nav.scout_dashboard).toBe(frMessages.nav.scout_dashboard);
    expect(messages.nav.scout_dashboard).not.toBe(
      enMessages.nav.scout_dashboard,
    );
  });

  // ── Unsupported / missing locales ───────────────────────────────────────────

  it('falls back to English for an unsupported locale string', async () => {
    const result = await callConfig('de');
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(enMessages);
  });

  it('falls back to English when locale is undefined', async () => {
    const result = await callConfig(undefined);
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(enMessages);
  });

  it('falls back to English for an empty string locale', async () => {
    const result = await callConfig('');
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(enMessages);
  });

  it('falls back to English for a locale that looks valid but is not supported', async () => {
    const result = await callConfig('zh');
    expect(result.locale).toBe('en');
  });
});
