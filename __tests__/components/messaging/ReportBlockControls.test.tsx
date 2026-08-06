import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportBlockControls from '@/components/messaging/ReportBlockControls';
import {
  blockUser,
  isUserBlocked,
  reportUser,
  unblockUser,
} from '@/lib/messaging/moderation';

jest.mock('@/lib/messaging/moderation', () => ({
  blockUser: jest.fn(),
  isUserBlocked: jest.fn(),
  reportUser: jest.fn(),
  unblockUser: jest.fn(),
}));

const mockBlockUser = blockUser as jest.MockedFunction<typeof blockUser>;
const mockIsUserBlocked = isUserBlocked as jest.MockedFunction<
  typeof isUserBlocked
>;
const mockReportUser = reportUser as jest.MockedFunction<typeof reportUser>;
const mockUnblockUser = unblockUser as jest.MockedFunction<typeof unblockUser>;

const THREAD_ID = 'thread-1';
const COUNTERPART_ID = 'user-42';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsUserBlocked.mockReturnValue(false);
  mockBlockUser.mockResolvedValue(undefined);
  mockUnblockUser.mockResolvedValue(undefined);
  mockReportUser.mockResolvedValue(undefined);
});

describe('ReportBlockControls', () => {
  it('renders Report and Block controls when the user is not blocked', () => {
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(mockIsUserBlocked).toHaveBeenCalledWith(COUNTERPART_ID);
    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();
    expect(
      screen.queryByText('You have blocked this user.'),
    ).not.toBeInTheDocument();
  });

  it('renders the Unblock control and blocked notice when the user is already blocked', () => {
    mockIsUserBlocked.mockReturnValue(true);

    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.getByText('You have blocked this user.')).toBeInTheDocument();
  });

  it('toggles the report form open and closed', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Report' }));
    expect(
      screen.getByPlaceholderText('Reason for report…'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Report' }));
    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();
  });

  it('does not submit a report when the reason is blank', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Report' }));
    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    expect(mockReportUser).not.toHaveBeenCalled();
    // The form should remain open since nothing was submitted.
    expect(
      screen.getByPlaceholderText('Reason for report…'),
    ).toBeInTheDocument();
  });

  it('submits a report with a trimmed reason and shows a status message', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Report' }));
    await user.type(
      screen.getByPlaceholderText('Reason for report…'),
      '  Spam messages  ',
    );
    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => {
      expect(mockReportUser).toHaveBeenCalledWith(
        THREAD_ID,
        COUNTERPART_ID,
        'Spam messages',
      );
    });

    expect(
      screen.getByText(
        'Reported. Our moderation team will review this thread.',
      ),
    ).toBeInTheDocument();
    // The form closes and resets after a successful submit.
    expect(
      screen.queryByPlaceholderText('Reason for report…'),
    ).not.toBeInTheDocument();
  });

  it('blocks the user and shows a status message', async () => {
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => {
      expect(mockBlockUser).toHaveBeenCalledWith(COUNTERPART_ID);
    });

    expect(
      screen.getByText(
        'User blocked. They can no longer message or contact you.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('You have blocked this user.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
  });

  it('unblocks the user and shows a status message', async () => {
    mockIsUserBlocked.mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <ReportBlockControls
        threadId={THREAD_ID}
        counterpartId={COUNTERPART_ID}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Unblock' }));

    await waitFor(() => {
      expect(mockUnblockUser).toHaveBeenCalledWith(COUNTERPART_ID);
    });

    expect(screen.getByText('User unblocked.')).toBeInTheDocument();
    expect(
      screen.queryByText('You have blocked this user.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();
  });
});
