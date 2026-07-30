/** Client for app/api/notification-preferences — same-origin, cookie-authenticated. */
import type { NotificationPreferences } from '@/types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  milestoneApprovals: true,
  contactUnlocks: true,
};

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch('/api/notification-preferences');
  if (!res.ok) throw new Error('Failed to fetch notification preferences');
  return res.json();
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const res = await fetch('/api/notification-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error('Failed to update notification preferences');
  return res.json();
}
