/**
 * Supported locales for the application.
 *
 * This is the single source of truth for locale routing and SEO alternates:
 *
 * - `middleware.ts` uses it to detect whether a request path already has a
 *   locale prefix and to pick a locale for unprefixed requests.
 * - `app/[locale]/layout.tsx` uses it for `generateStaticParams`.
 * - `lib/seo.ts` uses it to build `hreflang` alternates for every locale.
 *
 * Deliberately kept in its own dependency-free module (rather than living in
 * `lib/seo.ts`, which imports `next/headers`) so `middleware.ts` — which
 * runs in the Edge runtime — doesn't need to pull in unrelated server APIs
 * just to read this list.
 */
const SUPPORTED_LOCALES = ['en', 'fr', 'sw'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Exported as `readonly string[]` (rather than the narrower literal tuple)
 * so callers can check arbitrary runtime strings (e.g. a cookie value or an
 * `accept-language` header) against it with `locales.includes(someString)`
 * without a type error.
 */
export const locales: readonly string[] = SUPPORTED_LOCALES;

/**
 * The locale `x-default` (and the bare-domain / unrecognized-locale
 * fallback) should point to.
 */
export const defaultLocale: Locale = 'en';
