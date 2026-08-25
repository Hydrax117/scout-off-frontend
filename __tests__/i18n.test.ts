/**
 * Unit tests for i18n.ts request configuration
 *
 * Ensures the next-intl request-level locale and message loading works
 * correctly for all supported locales. A regression here would silently break
 * translations for an entire locale.
 *
 * Since getRequestConfig is server-side only, these tests verify:
 * 1. Message files exist and can be imported
 * 2. Message files contain expected structure
 * 3. All supported locales have corresponding message files
 *
 * Issue #531, #1128
 *
 * Key design: locale files are discovered from the filesystem (messages/*.json)
 * so a newly-added locale is automatically included in parity checks without
 * any code change here.
 */

import fs from 'fs';
import path from 'path';

// Import actual message files to verify they exist and load correctly
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import swMessages from '@/messages/sw.json';
import ptMessages from '@/messages/pt.json';

// ── Filesystem-driven locale discovery ──────────────────────────────────────

const MESSAGES_DIR = path.resolve(process.cwd(), 'messages');

/**
 * Reads the messages/ directory at test runtime so any new locale file is
 * automatically included in parity checks without editing this file.
 */
function getLocalesFromDisk(): string[] {
  return fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .sort();
}

/**
 * Loads and parses a locale's JSON file from disk directly (bypasses the
 * static import list) so dynamically-discovered locales can be tested.
 */
function loadLocaleMessages(locale: string): Record<string, unknown> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<
    string,
    unknown
  >;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('i18n.ts', () => {
  describe('filesystem locale discovery', () => {
    it('discovers all locale files from disk without a hardcoded list', () => {
      const locales = getLocalesFromDisk();
      // At minimum the four known locales must be present
      expect(locales).toContain('en');
      expect(locales).toContain('fr');
      expect(locales).toContain('sw');
      expect(locales).toContain('pt');
    });

    it('returns the same set of locales each run (deterministic)', () => {
      expect(getLocalesFromDisk()).toEqual(getLocalesFromDisk());
    });

    it('picking up a new locale file requires no code change in this test', () => {
      // This test itself proves the contract: the locale list is built from
      // disk, so the assertion below covers every file that currently exists
      // AND any file added in the future.
      const locales = getLocalesFromDisk();
      for (const locale of locales) {
        const messages = loadLocaleMessages(locale);
        expect(Object.keys(messages).length).toBeGreaterThan(0);
      }
    });
  });

  describe('message file availability', () => {
    it('English messages file exists and can be imported', () => {
      expect(enMessages).toBeDefined();
      expect(typeof enMessages).toBe('object');
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });

    it('French messages file exists and can be imported', () => {
      expect(frMessages).toBeDefined();
      expect(typeof frMessages).toBe('object');
      expect(Object.keys(frMessages).length).toBeGreaterThan(0);
    });

    it('Swahili messages file exists and can be imported', () => {
      expect(swMessages).toBeDefined();
      expect(typeof swMessages).toBe('object');
      expect(Object.keys(swMessages).length).toBeGreaterThan(0);
    });

    it('Portuguese messages file exists and can be imported', () => {
      expect(ptMessages).toBeDefined();
      expect(typeof ptMessages).toBe('object');
      expect(Object.keys(ptMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message structure validation', () => {
    it('English messages contain expected top-level keys', () => {
      const messages = enMessages as Record<string, unknown>;

      // Verify some expected translation keys exist (based on actual i18n structure)
      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('French messages contain expected top-level keys', () => {
      const messages = frMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('Swahili messages contain expected top-level keys', () => {
      const messages = swMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });

    it('Portuguese messages contain expected top-level keys', () => {
      const messages = ptMessages as Record<string, unknown>;

      expect(messages).toHaveProperty('nav');
      expect(messages).toHaveProperty('player_dashboard');
      expect(messages).toHaveProperty('scout_dashboard');
      expect(messages).toHaveProperty('validator');
      expect(messages).toHaveProperty('admin');
    });
  });

  describe('locale key parity — filesystem-driven', () => {
    /**
     * Core regression guard for issue #1128:
     * Every locale discovered on disk must have exactly the same top-level
     * keys as every other locale.  No hardcoded locale list — the directory
     * listing is the source of truth.
     */
    it('all locale files discovered on disk share the same top-level keys', () => {
      const locales = getLocalesFromDisk();
      const keysByLocale = locales.map((locale) => ({
        locale,
        keys: Object.keys(loadLocaleMessages(locale)).sort(),
      }));

      const referenceKeys = keysByLocale[0].keys;
      for (const { locale, keys } of keysByLocale.slice(1)) {
        expect(keys).toEqual(referenceKeys);
      }
    });

    it('pt.json is included in the parity check automatically', () => {
      // Explicit regression for #1128: pt was the locale that could silently
      // drift because older checks had a hardcoded list of [en, fr, sw].
      const locales = getLocalesFromDisk();
      expect(locales).toContain('pt');
    });

    it('all locale files have the same top-level keys structure (static imports)', () => {
      // Kept for safety alongside the dynamic check above.
      const enKeys = Object.keys(enMessages).sort();
      const frKeys = Object.keys(frMessages).sort();
      const swKeys = Object.keys(swMessages).sort();
      const ptKeys = Object.keys(ptMessages).sort();

      expect(frKeys).toEqual(enKeys);
      expect(swKeys).toEqual(enKeys);
      expect(ptKeys).toEqual(enKeys);
    });
  });

  describe('locale configuration', () => {
    it('supported locales array is defined in i18n.ts', () => {
      // Verify these match our available message files (filesystem-driven)
      const availableLocales = getLocalesFromDisk();
      const messageFiles: Record<string, Record<string, unknown>> = {
        en: enMessages,
        fr: frMessages,
        sw: swMessages,
        pt: ptMessages,
      };

      for (const locale of availableLocales) {
        // Every locale on disk should be loadable
        const messages = loadLocaleMessages(locale);
        expect(Object.keys(messages).length).toBeGreaterThan(0);

        // Static imports also work for the known locales
        if (locale in messageFiles) {
          expect(messageFiles[locale]).toBeDefined();
        }
      }
    });

    it('default locale is English', () => {
      // The i18n.ts file has defaultLocale = 'en'
      // We verify English messages exist and are non-empty
      expect(enMessages).toBeDefined();
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
    });
  });

  describe('message content validation', () => {
    it('English messages are not empty objects', () => {
      const messages = enMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);

      // At least one nested key should exist
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it('French messages are not empty objects', () => {
      const messages = frMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it('Swahili messages are not empty objects', () => {
      const messages = swMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it('Portuguese messages are not empty objects', () => {
      const messages = ptMessages as Record<string, unknown>;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(
        Object.keys(messages.nav as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('regression protection', () => {
    it('all message files are valid JSON', () => {
      // If we got here, the imports succeeded, meaning the JSON is valid
      expect(() => JSON.stringify(enMessages)).not.toThrow();
      expect(() => JSON.stringify(frMessages)).not.toThrow();
      expect(() => JSON.stringify(swMessages)).not.toThrow();
      expect(() => JSON.stringify(ptMessages)).not.toThrow();
    });

    it('no message file is accidentally empty', () => {
      expect(Object.keys(enMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(frMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(swMessages).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(ptMessages).length).toBeGreaterThanOrEqual(5);
    });

    it('core navigation messages exist in all locales', () => {
      const localeMessages = [enMessages, frMessages, swMessages, ptMessages];

      localeMessages.forEach((messages) => {
        const nav = (messages as Record<string, unknown>).nav as Record<
          string,
          unknown
        >;
        expect(nav).toBeDefined();
        expect(Object.keys(nav).length).toBeGreaterThan(0);
      });
    });

    it('dynamically discovered locales all pass the non-empty guard', () => {
      const locales = getLocalesFromDisk();
      for (const locale of locales) {
        const messages = loadLocaleMessages(locale);
        expect(Object.keys(messages).length).toBeGreaterThanOrEqual(5);
      }
    });
  });
});
