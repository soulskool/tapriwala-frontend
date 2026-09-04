import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * Every control wires its own label and error through `aria-describedby`, so a
 * validation message from the backend is announced rather than just coloured
 * red — the same `details[]` array the API returns drives all of them.
 */

const CONTROL_BASE =
  'w-full min-h-touch rounded-xl border bg-surface px-3 text-base text-ink transition ' +
  'placeholder:text-ink-muted/60 focus:border-brand-500 disabled:opacity-50';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined }) => ReactNode;
}

function FieldShell({ label, error, hint, required, children }: FieldShellProps) {
  const id = useId();
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
        {required ? <span className="text-status-cancelled ml-0.5">*</span> : null}
      </label>

      {children({ id, describedBy: messageId })}

      {error ? (
        <p id={messageId} role="alert" className="text-status-cancelled-ink text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-ink-muted text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, error, hint, className, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={props.required}>
      {({ id, describedBy }) => (
        <input
          {...props}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_BASE, error ? 'border-status-cancelled' : 'border-line', className)}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
};

export function SelectField({
  label,
  error,
  hint,
  options,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={props.required}>
      {({ id, describedBy }) => (
        <select
          {...props}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_BASE, error ? 'border-status-cancelled' : 'border-line', className)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextAreaField({ label, error, hint, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={props.required}>
      {({ id, describedBy }) => (
        <textarea
          {...props}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            'min-h-24 resize-y py-2',
            error ? 'border-status-cancelled' : 'border-line',
            className,
          )}
        />
      )}
    </FieldShell>
  );
}
