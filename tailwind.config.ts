import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#00C853',
          // Keep in sync with --bg in app/globals.css and theme_color/background_color
          // in public/manifest.json and the theme-color meta tag in app/layout.tsx.
          dark: '#0A0F1E',
          card: '#111827',
        },
      },
    },
  },
  plugins: [],
};

export default config;
