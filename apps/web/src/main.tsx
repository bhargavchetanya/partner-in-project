import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ApiError } from './lib/api';
import { SocketProvider } from './lib/hooks';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SocketProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster
            theme={(document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'dark'}
            position="top-right"
            richColors
            closeButton
            toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } }}
          />
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
