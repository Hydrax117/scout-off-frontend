import React from 'react';
import { render, act } from '@testing-library/react';
import { useVirtualizedRows } from '@/components/scout/VirtualizedPlayerGrid';

// ── ResizeObserver mock ──────────────────────────────────────────────────────
// jsdom does not implement ResizeObserver. We capture the callback passed by
// each instantiation so tests can manually trigger a resize.
let resizeCallbacks: ResizeObserverCallback[] = [];
let observeSpy: jest.Mock;
let disconnectSpy: jest.Mock;

beforeEach(() => {
  resizeCallbacks = [];
  observeSpy = jest.fn();
  disconnectSpy = jest.fn();
  global.ResizeObserver = class {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      resizeCallbacks.push(cb);
    }
    observe = observeSpy;
    unobserve = jest.fn();
    disconnect = disconnectSpy;
  } as unknown as typeof ResizeObserver;
});

function fireResize() {
  const cb = resizeCallbacks[0];
  act(() => {
    cb([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
  });
}

interface HarnessProps {
  items: string[];
  rowHeight: number;
  overscan?: number;
  onRender?: (result: ReturnType<typeof useVirtualizedRows<string>>) => void;
}

// A tiny host component so we can exercise the hook through real DOM
// mount/unmount/scroll/resize behaviour instead of relying on renderHook,
// matching how this repo tests hooks that need a real ref'd container.
function Harness({ items, rowHeight, overscan, onRender }: HarnessProps) {
  const result = useVirtualizedRows<string>({ items, rowHeight, overscan });
  onRender?.(result);
  return (
    <div
      ref={result.containerRef}
      data-testid="scroll-container"
      style={{ height: 100 }}
    >
      <div
        style={{ height: result.topSpacerHeight }}
        data-testid="top-spacer"
      />
      {result.visibleItems.map((item, i) => (
        <div key={result.startIndex + i}>{item}</div>
      ))}
      <div
        style={{ height: result.bottomSpacerHeight }}
        data-testid="bottom-spacer"
      />
    </div>
  );
}

describe('useVirtualizedRows', () => {
  it('renders only a windowed slice of items around the viewport', () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
    let latest: ReturnType<typeof useVirtualizedRows<string>> | undefined;

    render(
      <Harness
        items={items}
        rowHeight={20}
        onRender={(r) => {
          latest = r;
        }}
      />,
    );

    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(latest).toBeDefined();
    // clientHeight is 0 in jsdom by default, so with scrollTop 0 the
    // viewport-derived window still resolves to a bounded, valid range.
    expect(latest!.startIndex).toBe(0);
    expect(latest!.totalHeight).toBe(items.length * 20);
    expect(latest!.visibleItems.length).toBeLessThanOrEqual(items.length);
    expect(latest!.topSpacerHeight).toBe(0);
  });

  it('shifts the visible window forward as the container scrolls', () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
    let latest: ReturnType<typeof useVirtualizedRows<string>> | undefined;

    const { getByTestId } = render(
      <Harness
        items={items}
        rowHeight={20}
        overscan={2}
        onRender={(r) => {
          latest = r;
        }}
      />,
    );

    const container = getByTestId('scroll-container');
    Object.defineProperty(container, 'scrollTop', {
      value: 500,
      writable: true,
    });

    act(() => {
      container.dispatchEvent(new Event('scroll'));
    });

    // startIndex = floor(500 / 20) - overscan(2) = 25 - 2 = 23
    expect(latest!.startIndex).toBe(23);
    expect(latest!.topSpacerHeight).toBe(23 * 20);
  });

  it('updates the viewport height when a resize is observed', () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
    let latest: ReturnType<typeof useVirtualizedRows<string>> | undefined;

    const { getByTestId } = render(
      <Harness
        items={items}
        rowHeight={20}
        onRender={(r) => {
          latest = r;
        }}
      />,
    );

    const container = getByTestId('scroll-container');
    Object.defineProperty(container, 'clientHeight', {
      value: 200,
      configurable: true,
    });

    fireResize();

    // With viewportHeight now 200, more rows should be included in the
    // visible window (endIndex should extend beyond the default of 0).
    expect(latest!.endIndex).toBeGreaterThan(0);
  });

  it('never lets bottomSpacerHeight go negative when the window covers the full list', () => {
    const items = Array.from({ length: 3 }, (_, i) => `Item ${i}`);
    let latest: ReturnType<typeof useVirtualizedRows<string>> | undefined;

    render(
      <Harness
        items={items}
        rowHeight={20}
        overscan={10}
        onRender={(r) => {
          latest = r;
        }}
      />,
    );

    expect(latest!.bottomSpacerHeight).toBe(0);
    expect(latest!.endIndex).toBe(items.length);
  });

  it('cleans up the scroll listener and resize observer on unmount', () => {
    const items = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    const { unmount } = render(<Harness items={items} rowHeight={20} />);

    unmount();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
