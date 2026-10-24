import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useEventBrowseStore } from '@/stores/event-browse-store';
import { useCurrentUser } from '@/stores/session-store';
import { ApiError, apiRequest } from './client';
import { messagesQuery, SIGNED_OUT, useUserQuery } from './queries';
import type {
  DemoUser,
  EventCard,
  EventClustersResponse,
  EventFeedback,
  EventFeedbackResponse,
  EventFilters,
  EventOptions,
  EventResults,
  Preferences,
} from './types';

export const EVENT_PAGE_SIZE = 20;

const eventsKey = (user: DemoUser) => [user, 'events'] as const;
const preferencesKey = (user: DemoUser) => [user, 'preferences'] as const;

const rememberAsOf = (results: EventResults) => {
  useEventBrowseStore.getState().rememberAsOf(results.as_of);
  return results;
};

export const preferencesQuery = (user: DemoUser) =>
  queryOptions({
    queryKey: preferencesKey(user),
    queryFn: ({ signal }) => apiRequest<Preferences>(user, '/preferences', { signal }),
  });

export const eventOptionsQuery = (user: DemoUser) =>
  queryOptions({
    queryKey: [...eventsKey(user), 'options'] as const,
    queryFn: ({ signal }) => apiRequest<EventOptions>(user, '/events/options', { signal }),
    staleTime: 30 * 60 * 1000,
  });

export const eventClustersQuery = (user: DemoUser) =>
  queryOptions({
    queryKey: [...eventsKey(user), 'clusters'] as const,
    queryFn: ({ signal }) => apiRequest<EventClustersResponse>(user, '/events/clusters', { signal }),
  });

export const savedEventsQuery = (user: DemoUser) =>
  queryOptions({
    queryKey: [...eventsKey(user), 'saved'] as const,
    queryFn: ({ signal }) => apiRequest<EventCard[]>(user, '/events/saved', { signal }),
  });

/** Bare array, unlike the list and search envelopes. */
export const recommendedEventsQuery = (limit: number) => (user: DemoUser) =>
  queryOptions({
    queryKey: [...eventsKey(user), 'recommended', limit] as const,
    queryFn: ({ signal }) => apiRequest<EventCard[]>(user, '/events/recommended', { signal, params: { limit } }),
  });

export const eventDetailQuery = (id: string) => (user: DemoUser) =>
  queryOptions({
    queryKey: [...eventsKey(user), 'detail', id] as const,
    queryFn: ({ signal }) => apiRequest<EventCard>(user, `/events/${encodeURIComponent(id)}`, { signal }),
  });

export type EventListParams = { category?: string; cluster?: string; avoidConflicts?: boolean };

/** Chronological general events (GET /events). */
export const eventListQuery = (params: EventListParams) => (user: DemoUser) =>
  infiniteQueryOptions({
    queryKey: [...eventsKey(user), 'list', params] as const,
    queryFn: ({ signal, pageParam }) =>
      apiRequest<EventResults>(user, '/events', {
        signal,
        params: {
          limit: EVENT_PAGE_SIZE,
          offset: pageParam,
          category: params.category,
          cluster: params.cluster,
          avoid_schedule_conflicts: params.avoidConflicts,
        },
      }).then(rememberAsOf),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });

/** Ranked results (POST /events/search). An empty query yields the personalized feed. */
export const eventSearchQuery = (query: string, filters: EventFilters) => (user: DemoUser) =>
  infiniteQueryOptions({
    queryKey: [...eventsKey(user), 'search', { query, filters }] as const,
    queryFn: ({ signal, pageParam }) =>
      apiRequest<EventResults>(user, '/events/search', {
        method: 'POST',
        signal,
        body: { query, filters, limit: EVENT_PAGE_SIZE, offset: pageParam },
      }).then(rememberAsOf),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });

export const usePreferences = () => useUserQuery(preferencesQuery);
export const useEventOptions = () => useUserQuery(eventOptionsQuery);
export const useEventClusters = () => useUserQuery(eventClustersQuery);
export const useSavedEvents = () => useUserQuery(savedEventsQuery);
export const useRecommendedEvents = (limit: number) => useUserQuery(recommendedEventsQuery(limit));

export function useEventList(params: EventListParams) {
  const user = useCurrentUser();
  return useInfiniteQuery({ ...eventListQuery(params)(user ?? SIGNED_OUT), enabled: user != null });
}

export function useEventSearch(query: string, filters: EventFilters) {
  const user = useCurrentUser();
  return useInfiniteQuery({ ...eventSearchQuery(query, filters)(user ?? SIGNED_OUT), enabled: user != null });
}

export function useEventDetail(id: string) {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useUserQuery((owner) => ({
    ...eventDetailQuery(id)(owner),
    // Show the card already in a list while the canonical record loads.
    placeholderData: () => (user ? findCachedEvent(client, user, id) : undefined),
  }));
}

export const isEmptyPreferences = (preferences: Preferences) =>
  preferences.interest_ids.length === 0 && preferences.goal_ids.length === 0 && preferences.interests_text.trim() === '';

const samePreferences = (a: Preferences, b: Preferences) =>
  a.avoid_schedule_conflicts === b.avoid_schedule_conflicts &&
  a.interests_text === b.interests_text &&
  [...a.interest_ids].sort().join() === [...b.interest_ids].sort().join() &&
  [...a.goal_ids].sort().join() === [...b.goal_ids].sort().join();

export const PREFERENCES_CONFLICT_MESSAGE =
  'Your preferences were changed somewhere else. The latest version is loaded with your edits kept. Review them and save again.';

type SavePreferencesInput = { draft: Omit<Preferences, 'version'>; base: Preferences };

/**
 * Replaces preferences using the latest server version. Event feedback bumps the version without
 * changing the form, so only a real content change since `base` is reported as a conflict.
 */
export function useSavePreferences() {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, base }: SavePreferencesInput) => {
      const owner = user!;
      const latest = await client.fetchQuery({ ...preferencesQuery(owner), staleTime: 0 });
      if (!samePreferences(latest, base)) throw new ApiError(PREFERENCES_CONFLICT_MESSAGE, 409);
      try {
        return await apiRequest<Preferences>(owner, '/preferences', { method: 'PUT', body: { ...draft, version: latest.version } });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          await client.fetchQuery({ ...preferencesQuery(owner), staleTime: 0 });
          throw new ApiError(PREFERENCES_CONFLICT_MESSAGE, 409);
        }
        throw error;
      }
    },
    onSuccess: (saved) => {
      if (!user) return;
      client.setQueryData(preferencesKey(user), saved);
      // Rankings depend on the profile, so paginated feeds restart from the first page.
      void client.resetQueries({ queryKey: eventsKey(user) });
    },
  });
}

/** Applies feedback flags to every cached copy of an event: lists, pages, details, and chat cards. */
function patchEvent(value: unknown, id: string, flags: EventFeedback): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const patched = patchEvent(item, id, flags);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.id === id && 'conflict_check_complete' in record) return { ...record, ...flags };
    let next = record;
    for (const key of ['pages', 'items', 'event_cards'] as const) {
      if (!(key in record)) continue;
      const patched = patchEvent(record[key], id, flags);
      if (patched !== record[key]) next = { ...next, [key]: patched };
    }
    return next;
  }
  return value;
}

function findCachedEvent(client: QueryClient, user: DemoUser, id: string): EventCard | undefined {
  let found: EventCard | undefined;
  const visit = (value: unknown) => {
    if (found || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (record.id === id && 'conflict_check_complete' in record) {
      found = record as EventCard;
      return;
    }
    ['pages', 'items', 'event_cards'].forEach((key) => visit(record[key]));
  };
  client.getQueriesData({ queryKey: eventsKey(user) }).forEach(([, data]) => visit(data));
  if (!found) visit(client.getQueryData(messagesQuery(user).queryKey));
  return found;
}

export const SAVE: EventFeedback = { saved: true, not_interested: false };
export const HIDE: EventFeedback = { saved: false, not_interested: true };
export const CLEAR: EventFeedback = { saved: false, not_interested: false };

type FeedbackInput = { event: EventCard; feedback: EventFeedback };

/** Save/hide with an optimistic update that rolls back if the server rejects it. */
export function useEventFeedback() {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ event, feedback }: FeedbackInput) =>
      apiRequest<EventFeedbackResponse>(user!, `/events/${encodeURIComponent(event.id)}/feedback`, { method: 'PUT', body: feedback }),
    onMutate: async ({ event, feedback }) => {
      if (!user) return { snapshot: [] };
      const messagesKey = messagesQuery(user).queryKey;
      await Promise.all([client.cancelQueries({ queryKey: eventsKey(user) }), client.cancelQueries({ queryKey: messagesKey })]);
      const snapshot = [...client.getQueriesData({ queryKey: eventsKey(user) }), ...client.getQueriesData({ queryKey: messagesKey })];
      client.setQueriesData({ queryKey: eventsKey(user) }, (data: unknown) => patchEvent(data, event.id, feedback));
      client.setQueryData(messagesKey, (data) => patchEvent(data, event.id, feedback) as typeof data);
      if (feedback.saved) {
        client.setQueryData(savedEventsQuery(user).queryKey, (saved) =>
          saved && !saved.some((item) => item.id === event.id) ? [{ ...event, ...feedback }, ...saved] : saved,
        );
      }
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
    },
    onSettled: () => {
      if (!user) return;
      // Hidden events drop out of every list and feedback bumps the profile version.
      void client.invalidateQueries({ queryKey: eventsKey(user) });
      void client.invalidateQueries({ queryKey: preferencesKey(user) });
    },
  });
}
