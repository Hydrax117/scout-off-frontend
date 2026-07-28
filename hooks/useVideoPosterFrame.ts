'use client';

import { useEffect, useState } from 'react';

const DEFAULT_TIMESTAMP_SECONDS = 1;

interface UseVideoPosterFrameOptions {
  /** Set to false to skip capture entirely (e.g. before the item is visible). */
  enabled?: boolean;
  /** Timestamp to seek to before capturing, in seconds. Clamped to the clip's duration. */
  timestampSeconds?: number;
}

/**
 * Captures a single frame from a video, client-side, as a poster image —
 * no upload-time processing and no server-side transcoding required.
 *
 * Loads the video off-screen with `preload="metadata"`, seeks to a fixed
 * timestamp once metadata is available (the browser issues a targeted Range
 * request rather than downloading the whole file), then draws the resulting
 * frame onto an offscreen canvas and returns it as a `data:` URL suitable
 * for a `<video poster>` attribute.
 *
 * Returns `null` while capture is pending, disabled, or if it fails for any
 * reason (a CORS-tainted canvas, a network error, an empty video) — callers
 * should treat `null` as "no poster available" and degrade gracefully
 * rather than surfacing a broken image.
 */
export function useVideoPosterFrame(
  videoUrl: string,
  {
    enabled = true,
    timestampSeconds = DEFAULT_TIMESTAMP_SECONDS,
  }: UseVideoPosterFrameOptions = {},
): string | null {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoUrl) return;

    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    function capture() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (canvas.width === 0 || canvas.height === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        if (!cancelled) setPosterUrl(dataUrl);
      } catch {
        // Tainted canvas (CORS) or other capture failure — no poster,
        // callers fall back to their default (no image) rendering.
      }
    }

    function handleLoadedMetadata() {
      const duration = video.duration;
      const target =
        Number.isFinite(duration) && duration > 0
          ? Math.min(timestampSeconds, Math.max(duration - 0.1, 0))
          : 0;
      video.currentTime = target;
    }

    function handleSeeked() {
      capture();
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.src = videoUrl;

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.src = '';
    };
  }, [videoUrl, enabled, timestampSeconds]);

  return posterUrl;
}
