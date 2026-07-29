'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type { NotificationPreferences } from '@/types';

const CATEGORIES: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'milestoneApprovals',
    label: 'Milestone approvals',
    description: 'Notify me when a validator approves one of my milestones.',
  },
  {
    key: 'contactUnlocks',
    label: 'Contact unlocks',
    description: 'Notify me when I unlock a player’s contact details.',
  },
];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green ${
        checked ? 'bg-brand-green' : 'bg-gray-700'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/**
 * Settings panel letting a wallet toggle which event types generate in-app
 * notifications (issue #560). Categories map 1:1 to what the notification
 * center (issue #557) actually produces — milestone approvals and contact
 * unlocks; there's no push-notification system in this app yet, so
 * disabling a category only affects the in-app bell/panel.
 */
export default function NotificationPreferencesPanel() {
  const { publicKey, isAuthenticated } = useWallet();
  const { preferences, loading, update } = useNotificationPreferences(
    isAuthenticated ? publicKey : null,
  );
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(
    null,
  );

  async function toggle(key: keyof NotificationPreferences) {
    setSaving(key);
    try {
      await update({ ...preferences, [key]: !preferences[key] });
    } finally {
      setSaving(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <p className="text-xs text-gray-500">
        Connect your wallet to manage notification preferences.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-gray-800">
        {CATEGORIES.map(({ key, label, description }) => (
          <li
            key={key}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
            <Toggle
              checked={preferences[key]}
              onChange={() => toggle(key)}
              label={label}
            />
          </li>
        ))}
      </ul>
      {loading && (
        <p className="pt-3 text-xs text-gray-500">Loading preferences…</p>
      )}
      {saving && (
        <p className="pt-3 text-xs text-gray-500" role="status">
          Saving…
        </p>
      )}
    </div>
  );
}
