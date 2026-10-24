import type { ReactNode } from 'react';

import { errorMessage } from '@/api/client';
import type { QueryLike } from '@/api/combine';
import { ErrorState, LoadingState, StaleBanner } from './feedback';

type QueryViewProps<T> = {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
  compact?: boolean;
};

/**
 * Renders the loading and error states of a query and hands resolved data to `children`.
 * A failed refresh keeps showing the cached data with a nonblocking banner.
 */
export function QueryView<T>({ query, children, loadingLabel, compact }: QueryViewProps<T>) {
  if (query.data === undefined) {
    if (query.error) return <ErrorState compact={compact} message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
    return <LoadingState compact={compact} label={loadingLabel} />;
  }
  return (
    <>
      {query.error && !compact ? <StaleBanner onRetry={() => query.refetch()} /> : null}
      {children(query.data)}
    </>
  );
}
