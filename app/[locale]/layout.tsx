import { ReactNode } from 'react';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { seoMetadata } from '@/lib/seo';
import { locales } from '@/lib/locales';

interface LocaleLayoutProps {
  children: ReactNode;
  params: {
    locale: string;
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Generates locale-aware SEO metadata for all `app/[locale]/` pages.
 *
 * Each locale-prefixed page emits a `<link rel="canonical">` tag pointing to
 * its own full URL (using NEXT_PUBLIC_APP_URL as the origin). This prevents
 * search engines from treating locale variants as duplicate content.
 *
 * The canonical URL is constructed from the `x-pathname` request header set
 * by the middleware so it reflects the actual page path (e.g.
 * `/en/player/123` → `https://scoutoff.app/en/player/123`).
 */
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata();
}

export default function LocaleLayout({
  children,
  params: { locale },
}: LocaleLayoutProps) {
  setRequestLocale(locale);

  // `display: contents` avoids introducing a layout box while still exposing
  // the active locale via the lang attribute for assistive tech / WCAG 3.1.1.
  // The root <html lang> is set separately from the pathname in app/layout.tsx
  // and must not hard-code a single locale over this value.
  return (
    <div lang={locale} className="contents" data-testid="locale-lang">
      {children}
    </div>
  );
}
