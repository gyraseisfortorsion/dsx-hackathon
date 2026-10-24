import { focusManager, QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ApiError } from './client';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API serves a daily snapshot, so data rarely changes within a session.
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < MAX_RETRIES;
      },
    },
  },
});

/** Refetch stale queries when the app returns to the foreground. */
export function useAppFocusRefetch() {
  useEffect(() => {
    if (process.env.EXPO_OS === 'web') return;
    const subscription = AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
    return () => subscription.remove();
  }, []);
}
