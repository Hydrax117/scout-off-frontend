'use client';

import { SelectHTMLAttributes, ReactNode, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  label?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, id, label, error, className = '', ...props },
  ref,
) {
  const errorId = id && error ? `${id}-error` : undefined;

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green transition ${
          error ? 'border-red-500' : ''
        } ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
