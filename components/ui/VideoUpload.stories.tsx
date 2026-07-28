import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import VideoUpload from './VideoUpload';
import Spinner from './Spinner';

const meta: Meta<typeof VideoUpload> = {
  title: 'UI/VideoUpload',
  component: VideoUpload,
  tags: ['autodocs'],
  args: { onUpload: fn() },
};

export default meta;
type Story = StoryObj<typeof VideoUpload>;

export const Default: Story = {
  name: 'Idle (no file selected)',
  args: {},
};

export const WithError: Story = {
  name: 'With Validation Error',
  args: {
    error: 'File size exceeds 100 MB. Please upload a smaller video.',
  },
};

export const UploadingState: Story = {
  name: 'Uploading (visual mock)',
  render: () => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">
        Highlight Reel
      </label>
      <div className="relative">
        <input
          type="file"
          accept="video/*"
          disabled
          className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 opacity-50"
        />
        <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-brand-green">
            <Spinner size="sm" />
            <span className="text-sm">Uploading...</span>
          </div>
        </div>
      </div>
    </div>
  ),
};
