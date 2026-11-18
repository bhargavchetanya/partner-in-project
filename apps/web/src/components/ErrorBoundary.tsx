import { Component, type ReactNode } from 'react';

/** Last-resort safety net: shows a friendly message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ui] crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-muted">An unexpected error happened on this page. Reloading usually fixes it.</p>
        <div className="mt-6 flex gap-3">
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white" onClick={() => location.reload()}>Reload page</button>
          <a className="rounded-xl border border-line px-4 py-2 text-sm font-medium" href="/dashboard">Go to dashboard</a>
        </div>
      </div>
    );
  }
}
