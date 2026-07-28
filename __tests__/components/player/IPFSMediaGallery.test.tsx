import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import IPFSMediaGallery from '@/components/player/IPFSMediaGallery';
import { useVideoPosterFrame } from '@/hooks/useVideoPosterFrame';

// ── useVideoPosterFrame mock ─────────────────────────────────────────────────
// The real hook relies on canvas frame capture, which jsdom doesn't support.
// It's covered by its own dedicated unit tests; here we only need to verify
// IPFSMediaGallery wires the hook's return value into the <video poster>.
jest.mock('@/hooks/useVideoPosterFrame', () => ({
  useVideoPosterFrame: jest.fn(() => null),
}));
const mockUseVideoPosterFrame = useVideoPosterFrame as jest.Mock;

// ── next/image mock ───────────────────────────────────────────────────────────
// Renders a plain <img> so we can assert on src/alt without Next's image
// optimization pipeline running in the test environment.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

// ── IntersectionObserver mock ────────────────────────────────────────────────
// jsdom does not implement IntersectionObserver. We capture the callback
// passed by each instantiation so tests can manually fire an intersection.
let observerCallbacks: IntersectionObserverCallback[] = [];

beforeEach(() => {
  observerCallbacks = [];
  mockUseVideoPosterFrame.mockReturnValue(null);
  global.IntersectionObserver = class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
      observerCallbacks.push(cb);
    }
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root: Element | null = null;
    rootMargin = '';
    thresholds: ReadonlyArray<number> = [];
  } as unknown as typeof IntersectionObserver;
});

function fireIntersection(index: number, isIntersecting: boolean) {
  const cb = observerCallbacks[index];
  act(() => {
    cb(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

describe('IPFSMediaGallery', () => {
  it('renders nothing when cids is empty', () => {
    const { container } = render(<IPFSMediaGallery cids={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an image tile for a non-video CID, routed through the media proxy', () => {
    render(<IPFSMediaGallery cids={['QmImageCid123']} />);
    const img = screen.getByAltText('IPFS media QmImageCid123');
    expect(img).toHaveAttribute('src', '/api/media/QmImageCid123');
  });

  it('renders a grid of tiles, one per CID', () => {
    render(<IPFSMediaGallery cids={['QmA.jpg', 'QmB.mp4']} />);
    // Image tile
    expect(screen.getByAltText('IPFS media QmA.jpg')).toBeInTheDocument();
    // Video tile (rendered as a <video> element with a play button)
    expect(
      screen.getByRole('button', { name: /play video/i }),
    ).toBeInTheDocument();
  });

  it('renders a video tile for a .mp4 CID with no poster attribute until one is captured', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    // No broken-image guess (e.g. swapping the extension for a file that
    // doesn't exist on IPFS) — absent until useVideoPosterFrame resolves one.
    expect(video).not.toHaveAttribute('poster');
  });

  it('renders a video tile for a .webm CID', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.webm']} />);
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).not.toHaveAttribute('poster');
  });

  it('sets the <video poster> to the frame captured by useVideoPosterFrame', () => {
    mockUseVideoPosterFrame.mockReturnValue('data:image/jpeg;base64,AAAA');
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('poster', 'data:image/jpeg;base64,AAAA');
  });

  it('only enables poster capture for video CIDs, and only once the tile is visible', () => {
    render(<IPFSMediaGallery cids={['QmImage.jpg', 'QmClip.mp4']} />);

    // Image tile: never enabled, regardless of visibility.
    expect(mockUseVideoPosterFrame).toHaveBeenCalledWith(
      expect.stringContaining('QmImage.jpg'),
      { enabled: false },
    );
    // Video tile: not enabled before the intersection observer fires.
    expect(mockUseVideoPosterFrame).toHaveBeenCalledWith(
      expect.stringContaining('QmClip.mp4'),
      { enabled: false },
    );

    fireIntersection(1, true);

    expect(mockUseVideoPosterFrame).toHaveBeenLastCalledWith(
      expect.stringContaining('QmClip.mp4'),
      { enabled: true },
    );
  });

  it('shows the play overlay button before playback starts', () => {
    render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    expect(
      screen.getByRole('button', { name: /play video/i }),
    ).toBeInTheDocument();
  });

  it('does not render a <source> until visible AND playing', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    expect(container.querySelector('source')).not.toBeInTheDocument();
  });

  it('hides the play overlay and still has no <source> when visible but not playing', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    fireIntersection(0, true);
    expect(container.querySelector('source')).not.toBeInTheDocument();
    // Overlay button still present since isPlaying is false
    expect(
      screen.getByRole('button', { name: /play video/i }),
    ).toBeInTheDocument();
  });

  it('clicking the overlay button sets isPlaying and removes the overlay', () => {
    render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    fireEvent.click(screen.getByRole('button', { name: /play video/i }));
    expect(
      screen.queryByRole('button', { name: /play video/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a <source> with the correct type once visible and playing', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    fireIntersection(0, true);
    fireEvent.click(screen.getByRole('button', { name: /play video/i }));

    const source = container.querySelector('source');
    expect(source).toBeInTheDocument();
    expect(source).toHaveAttribute('src', '/api/media/QmClip.mp4');
    expect(source).toHaveAttribute('type', 'video/mp4');
  });

  it('clicking the <video> element toggles isPlaying back off', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    fireIntersection(0, true);
    fireEvent.click(screen.getByRole('button', { name: /play video/i }));
    expect(container.querySelector('source')).toBeInTheDocument();

    const video = container.querySelector('video')!;
    fireEvent.click(video);

    // isPlaying flips back to false, so the overlay button reappears and the
    // <source> (which requires isVisible && isPlaying) disappears.
    expect(
      screen.getByRole('button', { name: /play video/i }),
    ).toBeInTheDocument();
    expect(container.querySelector('source')).not.toBeInTheDocument();
  });

  it('does not render a <source> when playing but not yet visible', () => {
    const { container } = render(<IPFSMediaGallery cids={['QmClip.mp4']} />);
    fireEvent.click(screen.getByRole('button', { name: /play video/i }));
    expect(container.querySelector('source')).not.toBeInTheDocument();
  });

  it('renders independent observers per tile for multiple CIDs', () => {
    render(<IPFSMediaGallery cids={['QmA.mp4', 'QmB.webm']} />);
    expect(observerCallbacks.length).toBe(2);
  });
});
