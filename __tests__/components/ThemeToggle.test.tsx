import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSetTheme = jest.fn();
const mockUseTheme = jest.fn();

jest.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

import ThemeToggle from '@/components/ThemeToggle';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseTheme.mockReturnValue({
    resolvedTheme: 'dark',
    setTheme: mockSetTheme,
  });
});

describe('ThemeToggle', () => {
  it('renders a moon icon and switches to light when currently dark', async () => {
    render(<ThemeToggle />);
    await act(async () => {});

    const button = screen.getByRole('button', {
      name: 'Switch to light theme',
    });
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('renders a sun icon and switches to dark when currently light', async () => {
    mockUseTheme.mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });
    render(<ThemeToggle />);
    await act(async () => {});

    const button = screen.getByRole('button', { name: 'Switch to dark theme' });
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
