import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const control =
  'w-full rounded-field bg-surface px-3.5 py-3.5 text-ink ring-1 ring-line-strong placeholder:text-ink-subtle ' +
  'transition-[box-shadow,background-color] duration-[var(--duration-hover)] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50';

/** A labelled control; the label floats onto the border once there is a value. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="float-field" data-invalid={error ? '' : undefined}>
        {children}
        <label htmlFor={htmlFor} className="float-label">
          {label}
        </label>
      </div>
      {error ? (
        <p role="alert" className="type-caption text-critical">
          {error}
        </p>
      ) : hint ? (
        <p className="type-caption">{hint}</p>
      ) : null}
    </div>
  );
}

/** Always has a placeholder, blank if nothing else: the floating label reads :placeholder-shown. */
export function Input({ className, placeholder, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} placeholder={placeholder ?? ' '} {...props} />;
}

export function Textarea({ className, placeholder, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'resize-none pt-4', className)} placeholder={placeholder ?? ' '} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'appearance-none bg-[length:1rem] pr-9', className)} {...props}>
      {children}
    </select>
  );
}

/** A checkbox drawn as a switch; the real input stays for keyboard, forms and screen readers. */
export function Toggle({
  name,
  label,
  description,
  defaultChecked,
  id: givenId,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  /** Needed when one page has several forms with a toggle of the same name. */
  id?: string;
}) {
  const id = givenId ?? `toggle-${name}`;
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="type-body font-medium text-ink">
          {label}
        </label>
        {description ? <p className="type-caption mt-0.5">{description}</p> : null}
      </div>
      <label className="relative shrink-0 cursor-pointer pt-0.5">
        <input id={id} type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="peer sr-only" />
        <span
          aria-hidden
          className="block h-6 w-10 rounded-pill bg-line-strong transition-colors peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-1 block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform peer-checked:translate-x-4"
        />
      </label>
    </div>
  );
}
