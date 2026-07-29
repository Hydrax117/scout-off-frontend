'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'scoutoff_theme';

/**
 * Wraps next-themes so the scout's dark/light choice persists in
 * localStorage (namespaced key, prioritized over prefers-color-scheme) and
 * is applied via a blocking inline script before hydration — no
 * flash-of-wrong-theme. See app/globals.css for the .light CSS variable
 * overrides this toggles between.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
