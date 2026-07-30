/** Client for app/api/notifications/read — same-origin, cookie-authenticated. */

export async function fetchReadNotificationIds(): Promise<number[]> {
  const res = await fetch('/api/notifications/read');
  if (!res.ok) throw new Error('Failed to fetch read notifications');
  const { ids } = await res.json();
  return ids as number[];
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to mark notifications read');
}
