import type { Meta, StoryObj } from '@storybook/react';
import NotificationBell from './NotificationBell';

const meta: Meta<typeof NotificationBell> = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Notification-center bell with an unread badge and a dropdown panel.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

/** Authenticated user with no unread notifications. */
export const ZeroUnread: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The bell is shown without an unread-count badge.',
      },
    },
  },
};

/** Authenticated user with several unread notifications. */
export const SeveralUnread: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The bell displays the number of unread notifications.',
      },
    },
  },
};

/** The notification dropdown opened from the bell button. */
export const OpenDropdown: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Click the bell to open the notification panel and inspect its contents.',
      },
    },
  },
};
