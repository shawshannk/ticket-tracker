import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth/AuthProvider';
import './index.css';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API is the authority; refetching on every window focus is noise for a tool like this.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // One retry, and never on an auth or authorization failure: `apiFetch` has already tried a
      // token refresh by the time a 401 surfaces, and retrying a 403 or 404 only delays the
      // error the view is about to render.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Inside QueryClientProvider: AuthProvider clears the cache when a session ends. */}
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
