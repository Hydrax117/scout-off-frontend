'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import Spinner from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'danger' | 'secondary';
  children: ReactNode;
  isLoading?: boolean;
}

export default function Button({
  variant = 'default',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

  const variants = {
    default: 'bg-brand-green text-black hover:opacity-90',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'bg-gray-700 text-white hover:bg-gray-600',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
