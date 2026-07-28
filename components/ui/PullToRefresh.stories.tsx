import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import PullToRefresh from './PullToRefresh';
import Button from './Button';

/**
 * PullToRefresh is gesture-driven (touchstart/touchmove/touchend on the
 * window), so it can't be demonstrated by actually dragging inside
 * Storybook's iframe without a touch-capable device. Instead, these stories
 * drive the same `isLoading` prop a real caller would use to reflect its own
 * refresh state — which is exactly what puts the component into its
 * 'idle' and 'refreshing' visual states.
 */
const meta: Meta<typeof PullToRefresh> = {
  title: 'UI/PullToRefresh',
  component: PullToRefresh,
  tags: ['autodocs'],
  args: { onRefresh: fn() },
};

export default meta;
type Story = StoryObj<typeof PullToRefresh>;

function SampleContent() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {['Alex Morgan', 'Jordan Lee', 'Sam Rivera'].map((name) => (
        <div
          key={name}
          className="rounded-lg border border-gray-800 bg-brand-card px-4 py-3 text-sm text-white"
        >
          {name}
        </div>
      ))}
    </div>
  );
}

export const Idle: Story = {
  name: 'Idle (no pull in progress)',
  args: {
    isLoading: false,
    children: <SampleContent />,
  },
};

export const Refreshing: Story = {
  name: 'Refreshing (loading state)',
  args: {
    isLoading: true,
    children: <SampleContent />,
  },
};

export const Interactive: Story = {
  name: 'Interactive Flow',
  render: () => {
    function Demo() {
      const [isLoading, setIsLoading] = useState(false);

      const simulateRefresh = async () => {
        setIsLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setIsLoading(false);
      };

      return (
        <div className="flex flex-col gap-4 max-w-sm">
          <Button onClick={simulateRefresh} isLoading={isLoading}>
            Simulate Pull-to-Refresh
          </Button>
          <PullToRefresh onRefresh={simulateRefresh} isLoading={isLoading}>
            <SampleContent />
          </PullToRefresh>
        </div>
      );
    }
    return <Demo />;
  },
};
