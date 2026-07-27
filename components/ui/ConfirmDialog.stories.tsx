import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Button from './Button';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: { onConfirm: fn(), onCancel: fn() },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

/**
 * Default confirmation dialog — non-destructive, used for neutral confirmations
 * such as pausing a contract or confirming a settings change.
 */
export const Default: Story = {
  args: {
    isOpen: true,
    title: 'Remove Validator',
    message:
      'Are you sure you want to remove this validator? This action cannot be undone.',
  },
};

/**
 * Destructive action dialog — confirm button signals danger.
 * The component always renders its confirm button with `variant="danger"`,
 * so this story documents that the default appearance is already destructive.
 * Pass a `confirmLabel` that reinforces the irreversible nature of the action.
 */
export const Destructive: Story = {
  args: {
    isOpen: true,
    title: 'Archive Player Profile',
    message:
      'Archiving this profile will hide it from scouts and remove it from search results. This cannot be reversed without contacting support.',
    confirmLabel: 'Archive Profile',
    cancelLabel: 'Keep Profile',
  },
};

/**
 * Loading / pending state — the confirm button shows a spinner and is disabled
 * while an async operation (e.g. an on-chain transaction) is in progress.
 */
export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Confirm Withdrawal',
    message: 'Withdraw all accumulated platform fees to the admin wallet?',
    loading: true,
  },
};

/**
 * Long description — verifies that the dialog handles overflow gracefully
 * when the message prop contains a long paragraph of text.
 */
export const LongDescription: Story = {
  args: {
    isOpen: true,
    title: 'Revoke Milestone',
    message:
      'You are about to revoke the milestone "Scored 5 goals in the Regional Cup Qualifier" that was approved by validator GVALIDAT…WXYZ on 2024-03-14. ' +
      'Revoking this milestone will recalculate the player's progress level, which may drop them from Level 2 (Performance) back to Level 1 (Verified Identity). ' +
      'Any scouts who have already contacted this player based on their Level 2 status will not be notified automatically. ' +
      'If you believe this milestone was approved in error, please also file a report with the platform administrator so the validator's record can be reviewed. ' +
      'This action is recorded on-chain and cannot be reversed once confirmed.',
    confirmLabel: 'Revoke Milestone',
    cancelLabel: 'Keep Milestone',
  },
};

/**
 * Interactive story — demonstrates the open/close lifecycle and the loading
 * state that appears while an async confirmation handler is running.
 */
export const Interactive: Story = {
  name: 'Interactive (open/close)',
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      const [loading, setLoading] = useState(false);

      const handleConfirm = async () => {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 1500));
        setLoading(false);
        setOpen(false);
      };

      return (
        <div className="p-8">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Remove Validator
          </Button>
          <ConfirmDialog
            isOpen={open}
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            title="Remove Validator"
            message="This will permanently revoke this wallet's validator privileges on-chain."
            confirmLabel="Remove"
            loading={loading}
          />
        </div>
      );
    }
    return <Demo />;
  },
};
