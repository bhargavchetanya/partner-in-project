import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { Logo } from '@/components/layout';

export function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className={inApp ? 'py-20' : 'flex min-h-dvh flex-col items-center justify-center px-6'}>
      {!inApp && <Logo className="mb-12" />}
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Compass className="size-8" />
        </div>
        <p className="mt-6 font-mono text-sm text-primary">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">This page wandered off</h1>
        <p className="mt-2 text-sm text-muted">The link may be broken, or the page may have been removed.</p>
        <ButtonLink to={inApp ? '/dashboard' : '/'} className="mt-8">
          {inApp ? 'Back to dashboard' : 'Go home'}
        </ButtonLink>
      </div>
    </div>
  );
}
