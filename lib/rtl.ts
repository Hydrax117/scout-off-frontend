/**
 * RTL-readiness helper.
 *
 * The app doesn't ship an RTL locale yet, but this gives layout/components a
 * single place to determine text direction so a future Arabic/Hebrew locale
 * doesn't require touching every component individually. Not wired into
 * `app/[locale]/layout.tsx` yet - the `<html dir>` attribute there is still
 * hardcoded; this is the lookup that change would use.
 */

// Locales this app might add that require right-to-left layout.
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export type TextDirection = 'ltr' | 'rtl';

export function getTextDirection(locale: string): TextDirection {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}
