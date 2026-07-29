'use client';

import Modal from '@/components/ui/Modal';
import { usePayToContact } from '@/hooks/usePayToContact';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
}

/**
 * Displays contact details already unlocked via usePayToContact's unlock()
 * — this component never triggers unlock() itself, so rendering it never
 * causes a second pay_to_contact charge. It reads the same session-bounded
 * cache entry (see lib/contactDetailsCache.ts) that the caller's unlock()
 * populated, keyed by (playerId, scout wallet).
 *
 * Closing the modal immediately purges the cached details — a player's
 * unlocked PII shouldn't keep sitting in memory just because a scout closed
 * the dialog without navigating away or logging out.
 */
export default function ContactModal({
  isOpen,
  onClose,
  playerId,
}: ContactModalProps) {
  const { contactDetails, clear } = usePayToContact(playerId);

  function handleClose() {
    clear();
    onClose();
  }

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Player Contact Details</h2>

        {!contactDetails && (
          <p className="text-sm text-gray-400">
            No contact details unlocked for this player yet.
          </p>
        )}

        {contactDetails && (
          <div className="space-y-3">
            {contactDetails.email && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Email: {contactDetails.email}
                </span>
                <button
                  onClick={() => handleCopy(contactDetails.email!)}
                  className="text-xs text-blue-500 hover:underline ml-2"
                >
                  Copy
                </button>
              </div>
            )}
            {contactDetails.phone && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Phone: {contactDetails.phone}
                </span>
                <button
                  onClick={() => handleCopy(contactDetails.phone!)}
                  className="text-xs text-blue-500 hover:underline ml-2"
                >
                  Copy
                </button>
              </div>
            )}
            {contactDetails.telegram && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Telegram: {contactDetails.telegram}
                </span>
                <button
                  onClick={() => handleCopy(contactDetails.telegram!)}
                  className="text-xs text-blue-500 hover:underline ml-2"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
