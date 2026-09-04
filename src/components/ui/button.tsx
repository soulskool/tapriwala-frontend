import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks the click — never lets a double-tap through. */
  isLoading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-muted active:bg-surface-sunken',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-status-cancelled text-white hover:brightness-95 active:brightness-90 shadow-sm',
  success: 'bg-status-ready text-white hover:brightness-95 active:brightness-90 shadow-sm',
};

const SIZES: Record<ButtonSize, string> = {
  // Every size clears the 44px touch target — these are tapped mid-service,
  // one-handed, by someone holding three plates.
  sm: 'min-h-touch px-3 text-sm gap-1.5',
  md: 'min-h-touch px-4 text-base gap-2',
  lg: 'min-h-14 px-6 text-lg font-semibold gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  leadingIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {isLoading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}
