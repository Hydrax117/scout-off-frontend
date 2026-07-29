'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

/**
 * Dark/light toggle. Persistence, no-flash, and system-preference fallback
 * are all handled by next-themes (see components/ThemeProvider.tsx) — this
 * component only reads/writes the resolved theme.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid a hydration mismatch: resolvedTheme is undefined on the server and
  // on the client's very first render, before next-themes' inline script has
  // had a chance to run.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="hover:text-white transition flex items-center gap-1 whitespace-nowrap"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {mounted ? (
        isDark ? (
          <Moon size={16} aria-hidden="true" />
        ) : (
          <Sun size={16} aria-hidden="true" />
        )
      ) : (
        <span className="inline-block h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
