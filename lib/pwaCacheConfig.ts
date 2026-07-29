/**
 * Tuned next-pwa `runtimeCaching` entries for this app's asset mix.
 *
 * Static, rarely-changing assets (icons, fonts) use CacheFirst with a long
 * TTL, while player/scout API responses use StaleWhileRevalidate so users
 * see cached data instantly but it's refreshed in the background. Intended
 * to be spread into the `runtimeCaching` array in next.config.js.
 */
export const tunedRuntimeCaching = [
  {
    urlPattern: /\.(?:woff2?|ttf|eot|otf)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'font-assets-cache',
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
    },
  },
  {
    urlPattern: /\/icons\/.*\.(?:png|svg|ico)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'icon-assets-cache',
      expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 180 },
    },
  },
  {
    urlPattern: /\/api\/(players|scouts)\/.*/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'player-scout-data-cache',
      expiration: { maxEntries: 128, maxAgeSeconds: 60 * 5 },
    },
  },
];
