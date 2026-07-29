/**
 * Service worker — offline queue background sync handler.
 *
 * NOTE: next-pwa (workbox) generates the actual service worker at build
 * time. This file is a reference implementation and is NOT automatically
 * loaded by the generated SW. To wire it up, you would need to configure
 * the workbox `importScripts` option in next.config.js or inject it into
 * the SW build pipeline.
 *
 * Without this wiring, the feature still works via the `online` event
 * listener in `useOfflineQueue.ts` — queued actions are retried when
 * the browser detects connectivity. The background-sync path is an
 * additional optimisation for cases where the `online` event doesn't
 * fire (e.g. waking from sleep with connectivity already restored).
 *
 * When the browser fires a 'sync' event for 'offline-queue-sync', it
 * posts a message to the client (the main thread) telling it to process
 * the offline queue. The client's useOfflineQueue hook listens for this
 * message and triggers processing.
 */

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(
      (async () => {
        // Notify all clients to process their queues
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
        }
      })(),
    );
  }
});
