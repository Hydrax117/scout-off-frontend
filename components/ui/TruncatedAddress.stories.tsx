import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import TruncatedAddress from './TruncatedAddress';

// Obviously-fake sample address: correct Stellar public key format
// (G + 55 base32 chars) but not a real, funded account.
const SAMPLE_ADDRESS =
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';

const meta: Meta<typeof TruncatedAddress> = {
  title: 'UI/TruncatedAddress',
  component: TruncatedAddress,
  tags: ['autodocs'],
  args: {
    address: SAMPLE_ADDRESS,
  },
  argTypes: {
    address: { control: 'text' },
    className: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof TruncatedAddress>;

export const Default: Story = {
  name: 'Truncated Display',
};

export const WithCustomClassName: Story = {
  name: 'Custom Trigger Styling',
  args: {
    className: 'text-brand-green text-lg',
  },
};

export const TooltipOnHover: Story = {
  name: 'Tooltip on Hover (full address + copy button)',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: `Wallet address ${SAMPLE_ADDRESS}`,
    });

    // Hovering the truncated address reveals a tooltip with the full
    // address and a copy-to-clipboard button.
    await userEvent.hover(trigger);

    const tooltip = await within(document.body).findByRole('tooltip');
    await expect(tooltip).toHaveTextContent(SAMPLE_ADDRESS);
    await expect(
      within(tooltip).getByRole('button', {
        name: /copy full address to clipboard/i,
      }),
    ).toBeInTheDocument();
  },
};
