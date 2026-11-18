import { forwardRef, useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BadgeCheck, Loader2, RefreshCw, X } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-strong shadow-[0_8px_24px_-10px_var(--primary)] disabled:shadow-none',
  accent: 'bg-accent text-[#04201c] hover:brightness-110',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 border border-line',
  outline: 'border border-line-strong text-fg hover:bg-surface-2',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white border border-danger/30',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, icon, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link
      className={cn('inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98]', variants[variant], sizes[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ Form controls
const control =
  'w-full bg-elev border border-line rounded-xl px-3.5 text-sm text-fg placeholder:text-muted transition focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft disabled:opacity-60';

export function Field({ label, error, hint, required, children, htmlFor, className }: { label?: ReactNode; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg-2">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-[12.5px] text-danger" role="alert">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leftIcon?: ReactNode }>(function Input(
  { className, invalid, leftIcon, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{leftIcon}</span>}
      <input ref={ref} className={cn(control, 'h-11', leftIcon && 'pl-10', invalid && 'border-danger focus:border-danger focus:ring-danger-soft', className)} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'py-2.5 min-h-[96px] resize-y leading-relaxed', invalid && 'border-danger', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-11 pr-8 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat', invalid && 'border-danger', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238189a8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-start justify-between gap-4 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block text-[13px] text-muted mt-0.5">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

// ------------------------------------------------------------------ Badges & chips
type Tone = 'neutral' | 'primary' | 'accent' | 'warn' | 'danger' | 'success';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-2 border-line',
  primary: 'bg-primary-soft text-primary border-primary/25',
  accent: 'bg-accent-soft text-accent border-accent/25',
  warn: 'bg-warn-soft text-warn border-warn/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  success: 'bg-accent-soft text-success border-success/25',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Chip({ children, tone = 'neutral', onRemove, className, title }: { children: ReactNode; tone?: Tone; onRemove?: () => void; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[12.5px] font-medium leading-none', tones[tone], className)}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-0.5 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Remove">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function VerifiedBadge({ small }: { small?: boolean }) {
  return (
    <span title="Verified student — institutional email confirmed" className="inline-flex items-center gap-1 text-accent">
      <BadgeCheck className={small ? 'size-3.5' : 'size-4'} />
      {!small && <span className="text-[12px] font-medium">Verified student</span>}
    </span>
  );
}

// ------------------------------------------------------------------ Avatar
const avatarGradients = [
  'from-[#8b7bff] to-[#2dd4bf]',
  'from-[#f472b6] to-[#8b7bff]',
  'from-[#f5b04c] to-[#f2556b]',
  'from-[#2dd4bf] to-[#3b82f6]',
  'from-[#a78bfa] to-[#f472b6]',
  'from-[#34d399] to-[#0ea5e9]',
];

export function Avatar({ name, src, size = 40, className, ring }: { name: string; src?: string | null; size?: number; className?: string; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const g = avatarGradients[(name.charCodeAt(0) + name.length) % avatarGradients.length];
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white', ring && 'ring-2 ring-bg', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {src && !failed ? (
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className={cn('flex size-full items-center justify-center bg-gradient-to-br font-display', g)}>{initials(name) || '?'}</span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ Card
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-display text-[16px] font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ Loading / empty / error
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-primary', className)} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <Spinner className="size-7" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function CardSkeletons({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary [&>svg]:size-7">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-danger/30 bg-danger-soft px-6 py-10 text-center" role="alert">
      <AlertTriangle className="size-7 text-danger" />
      <p className="mt-3 text-sm text-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Modal
export function Modal({ open, onClose, title, children, footer, size = 'md', description }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn('card relative z-10 w-full max-h-[92dvh] overflow-y-auto scrollbar-thin rounded-b-none sm:rounded-2xl', size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl')}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            {children && <div className="px-6 py-5">{children}</div>}
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, loading, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; body?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      {body && <p className="text-sm text-fg-2">{body}</p>}
      {children}
    </Modal>
  );
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('flex max-w-full gap-1 overflow-x-auto scrollbar-thin rounded-xl border border-line bg-surface p-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('relative flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition', value === t.value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {value === t.value && <motion.span layoutId={`tab-${tabs.map((x) => x.value).join('')}`} className="absolute inset-0 rounded-lg bg-surface-3" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{t.label}</span>
          {t.count !== undefined && t.count > 0 && <span className="relative rounded-full bg-primary px-1.5 text-[11px] leading-4 text-white">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Page header
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</div>}
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold leading-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14.5px] text-muted max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, icon, hint, tone = 'primary' }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode; tone?: 'primary' | 'accent' | 'warn' | 'danger' }) {
  const t = { primary: 'bg-primary-soft text-primary', accent: 'bg-accent-soft text-accent', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger' }[tone];
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        {icon && <span className={cn('flex size-8 items-center justify-center rounded-lg [&>svg]:size-4', t)}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold text-fg">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}
