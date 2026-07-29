import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#00C853',
          // CSS-variable-backed so these tokens flip automatically between
          // the light (:root) and dark (.dark) palettes defined in
          // app/globals.css — components using bg-brand-dark/bg-brand-card
          // get theme-awareness for free. The dark values are kept in sync
          // with theme_color/background_color in public/manifest.json and
          // the theme-color meta tag in app/layout.tsx (both static, since
          // the PWA manifest can't switch at runtime).
          dark: 'var(--bg)',
          card: 'var(--card)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
