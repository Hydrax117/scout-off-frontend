import { render, screen } from '@testing-library/react';
import PlayerCardSkeleton from '@/components/PlayerCardSkeleton';

describe('PlayerCardSkeleton', () => {
  test('renders an aria-hidden placeholder card', () => {
    const { container } = render(<PlayerCardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.className).toMatch(/animate-pulse/);
  });

  test('renders exactly 6 skeleton placeholders (avatar + 3 lines + bar + button)', () => {
    const { container } = render(<PlayerCardSkeleton />);
    const placeholders = container.querySelectorAll('.bg-gray-700');
    // Pinned exact count — catches both regressions that remove blocks and
    // ones that inadvertently add decoration divs.
    expect(placeholders.length).toBe(6);
  });

  test('has no testable heading text (purely visual skeleton)', () => {
    render(<PlayerCardSkeleton />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Player/i)).toBeNull();
  });
});
