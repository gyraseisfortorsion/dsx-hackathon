import type { UseQueryResult } from '@tanstack/react-query';

/** The subset of a query result that screens render from. */
export type QueryLike<T> = {
  data: T | undefined;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

type DataOf<Q> = Q extends UseQueryResult<infer T> ? T : never;

/**
 * Combines independent queries into one result whose data is available once every query has
 * resolved. Each query keeps its own cache entry, so screens sharing a query don't refetch it.
 */
export function combineQueries<const Q extends readonly UseQueryResult<unknown>[], R>(
  queries: Q,
  select: (...data: { [K in keyof Q]: DataOf<Q[K]> }) => R,
): QueryLike<R> {
  const ready = queries.every((query) => query.data !== undefined);
  return {
    data: ready ? select(...(queries.map((query) => query.data) as { [K in keyof Q]: DataOf<Q[K]> })) : undefined,
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
