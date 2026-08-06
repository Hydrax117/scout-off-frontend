import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatThread from '@/components/messaging/ChatThread';
import {
  fetchThreadMessages,
  sendThreadMessage,
  markThreadRead,
  ChatMessage,
} from '@/lib/messaging/chatApi';

jest.mock('@/lib/messaging/chatApi', () => ({
  fetchThreadMessages: jest.fn(),
  sendThreadMessage: jest.fn(),
  markThreadRead: jest.fn(),
}));

const mockedFetchThreadMessages = fetchThreadMessages as jest.MockedFunction<
  typeof fetchThreadMessages
>;
const mockedSendThreadMessage = sendThreadMessage as jest.MockedFunction<
  typeof sendThreadMessage
>;
const mockedMarkThreadRead = markThreadRead as jest.MockedFunction<
  typeof markThreadRead
>;

const THREAD_ID = 'thread-1';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    threadId: THREAD_ID,
    senderId: 'scout-1',
    body: 'Hello there',
    createdAt: '2026-08-01T00:00:00.000Z',
    status: 'sent',
    ...overrides,
  };
}

describe('ChatThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMarkThreadRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a loading indicator while the initial fetch is in flight', async () => {
    let resolveFetch: (value: ChatMessage[]) => void;
    mockedFetchThreadMessages.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ChatThread threadId={THREAD_ID} />);

    expect(screen.getByText('Loading conversation…')).toBeInTheDocument();

    await act(async () => {
      resolveFetch!([]);
    });

    await waitFor(() =>
      expect(
        screen.queryByText('Loading conversation…'),
      ).not.toBeInTheDocument(),
    );
  });

  it('marks the thread as read on mount', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    await waitFor(() =>
      expect(mockedMarkThreadRead).toHaveBeenCalledWith(THREAD_ID),
    );
  });

  it('silently swallows a markThreadRead failure', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    mockedMarkThreadRead.mockRejectedValue(new Error('network error'));

    render(<ChatThread threadId={THREAD_ID} />);

    await waitFor(() =>
      expect(
        screen.getByText('No messages yet. Say hello!'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an empty-state message when there are no messages', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    expect(
      await screen.findByText('No messages yet. Say hello!'),
    ).toBeInTheDocument();
  });

  it('renders fetched messages', async () => {
    mockedFetchThreadMessages.mockResolvedValue([
      makeMessage({ id: 'msg-1', body: 'Hi, interested in a trial?' }),
      makeMessage({ id: 'msg-2', body: 'Yes, when works?' }),
    ]);

    render(<ChatThread threadId={THREAD_ID} />);

    expect(
      await screen.findByText('Hi, interested in a trial?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Yes, when works?')).toBeInTheDocument();
  });

  it('sends a message on button click and appends it to the list', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    const sent = makeMessage({ id: 'msg-new', body: 'Great, see you then' });
    mockedSendThreadMessage.mockResolvedValue(sent);

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: 'Great, see you then' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    expect(mockedSendThreadMessage).toHaveBeenCalledWith(
      THREAD_ID,
      'Great, see you then',
    );
    expect(screen.getByText('Great, see you then')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('sends a message when pressing Enter in the input', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    mockedSendThreadMessage.mockResolvedValue(
      makeMessage({ id: 'msg-enter', body: 'Sent via enter' }),
    );

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: 'Sent via enter' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(mockedSendThreadMessage).toHaveBeenCalledWith(
      THREAD_ID,
      'Sent via enter',
    );
    expect(screen.getByText('Sent via enter')).toBeInTheDocument();
  });

  it('does not send when the draft is empty or whitespace only', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: '   ' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    expect(mockedSendThreadMessage).not.toHaveBeenCalled();
  });

  it('polls for new messages on an interval', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(3);
  });

  it('clears the polling interval on unmount', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([]);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { unmount } = render(<ChatThread threadId={THREAD_ID} />);
    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('reloads messages when threadId changes', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    const { rerender } = render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');
    expect(mockedFetchThreadMessages).toHaveBeenCalledWith(THREAD_ID);

    rerender(<ChatThread threadId="thread-2" />);
    await waitFor(() =>
      expect(mockedFetchThreadMessages).toHaveBeenCalledWith('thread-2'),
    );
  });
});
