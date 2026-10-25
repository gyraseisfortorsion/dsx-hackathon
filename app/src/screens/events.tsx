import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { conflictOverride, eventCategory, eventToday, eventTypes, eventWhen, formatAsOf, toApiFilters } from '@/api/event-format';
import { eventTagIds, TAG_IDS, tagLabel } from '@/api/event-taxonomy';
import {
  isEmptyPreferences,
  useEventClusters,
  useEventDetail,
  useEventList,
  useEventOptions,
  useEventSearch,
  usePreferences,
  useSaveEventTags,
  useSavedEvents,
  useTagSuggest,
} from '@/api/events';
import type { EventCard as EventCardModel, EventCluster, EventResults } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DetailItem, Paragraph } from '@/components/content';
import { ConflictLine, EventCard, EventTagChips, useEventActions } from '@/components/event-card';
import { EmptyState, ErrorState, InlineError, LoadingState, StaleBanner } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { Pill, PillGroup } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { openAsk } from '@/navigation/routes';
import {
  activeFilterCount,
  CONFLICT_MODES,
  DATE_RANGES,
  DEFAULT_FILTERS,
  EVENT_SEGMENTS,
  useEventBrowseStore,
  type BrowseFilters,
} from '@/stores/event-browse-store';
import { colors, radius, spacing } from '@/theme';
import { showToast } from '@/stores/toast-store';
import { openLink } from '@/utils/open-link';
import { useDebouncedValue } from '@/utils/use-debounced-value';

const SEARCH_DEBOUNCE_MS = 350;

type EventFeedQuery = UseInfiniteQueryResult<InfiniteData<EventResults>, Error>;

function useSearchFilters() {
  const filters = useEventBrowseStore((state) => state.filters);
  const asOf = useEventBrowseStore((state) => state.asOf);
  const options = useEventOptions();
  return toApiFilters(filters, options.data, asOf);
}

function useRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.subtle} />;
}

const listProps = {
  contentInsetAdjustmentBehavior: 'automatic',
  keyboardDismissMode: 'on-drag',
  keyboardShouldPersistTaps: 'handled',
  style: { flex: 1, backgroundColor: colors.background },
  contentContainerStyle: { padding: spacing.screen, paddingBottom: spacing.xxl + 64 },
} as const;

const Gap = () => <View style={{ height: spacing.md }} />;

export function EventsScreen() {
  const segment = useEventBrowseStore((state) => state.segment);
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const webSearch = process.env.EXPO_OS === 'web' ? <WebSearchField value={search} onChange={setSearch} /> : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Search BU events',
            hideWhenScrolling: false,
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
          },
        }}
      />
      {query ? (
        <SearchFeed query={query} top={webSearch} />
      ) : segment === 'Upcoming' ? (
        <UpcomingFeed top={webSearch} />
      ) : segment === 'For You' ? (
        <ForYouFeed top={webSearch} />
      ) : segment === 'Explore' ? (
        <ExploreList top={webSearch} />
      ) : (
        <SavedList top={webSearch} />
      )}
    </>
  );
}

function WebSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Search BU events"
      placeholderTextColor={colors.tertiary}
      accessibilityLabel="Search BU events"
      style={{ minHeight: 42, borderRadius: radius.md, backgroundColor: colors.chip, paddingHorizontal: spacing.md, fontSize: 15, color: colors.ink, marginBottom: spacing.md }}
    />
  );
}

function SegmentBar() {
  const segment = useEventBrowseStore((state) => state.segment);
  const setSegment = useEventBrowseStore((state) => state.setSegment);
  return <PillGroup options={EVENT_SEGMENTS} value={segment} onChange={setSegment} />;
}

function FilterBar({ note }: { note?: string }) {
  const filters = useEventBrowseStore((state) => state.filters);
  const count = activeFilterCount(filters);
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count ? `Filters, ${count} active` : 'Filters'}
          onPress={() => router.push('/event-filters')}
          style={({ pressed }) => ({
            minHeight: 38,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: count ? colors.brand : colors.border,
            backgroundColor: count ? colors.brandTint : colors.surface,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Icon name="filter" size={15} color={count ? colors.brandDeep : colors.ink} />
          <AppText variant="label" style={{ fontSize: 13, color: count ? colors.brandDeep : colors.ink }}>
            {count ? `Filters · ${count}` : 'Filters'}
          </AppText>
        </Pressable>
        {count ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => useEventBrowseStore.getState().setFilters(DEFAULT_FILTERS)}>
            <AppText variant="label" style={{ fontSize: 13, color: colors.brand }}>
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {note && count ? <AppText variant="caption">{note}</AppText> : null}
    </View>
  );
}

function FeedMeta({ results, label }: { results: EventResults; label: string }) {
  return (
    <View style={{ marginTop: spacing.md, marginBottom: spacing.md, gap: spacing.sm }}>
      {results.notice ? (
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="caption" style={{ color: colors.inkSoft }}>
            {results.notice}
          </AppText>
        </View>
      ) : null}
      <AppText variant="caption" accessibilityLiveRegion="polite" style={{ fontSize: 11 }}>
        {label} · {results.total} {results.total === 1 ? 'event' : 'events'} · {formatAsOf(results.as_of)}
      </AppText>
    </View>
  );
}

const MODE_LABELS: Record<string, string> = {
  general: 'Soonest first',
  personalized: 'Ranked for you',
  search: 'Best matches',
  no_match: 'No matches',
};

function dedupe(events: EventCardModel[]) {
  const seen = new Set<string>();
  return events.filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)));
}

/** Paginated feed backed by an events envelope; loads the next page from `next_offset`. */
function EventFeed({ feed, header, emptyTitle, emptySubtitle }: { feed: EventFeedQuery; header: ReactNode; emptyTitle: string; emptySubtitle?: string }) {
  const refreshControl = useRefresh(() => feed.refetch());
  const pages = feed.data?.pages ?? [];
  const items = dedupe(pages.flatMap((page) => page.items));
  const first = pages[0];

  return (
    <FlatList
      {...listProps}
      data={items}
      keyExtractor={(event) => event.id}
      renderItem={({ item }) => <EventCard event={item} />}
      ItemSeparatorComponent={Gap}
      refreshControl={refreshControl}
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isFetchNextPageError) void feed.fetchNextPage();
      }}
      ListHeaderComponent={
        <>
          {header}
          {feed.error && feed.data && !feed.isFetchNextPageError ? <StaleBanner onRetry={() => feed.refetch()} /> : null}
          {first ? <FeedMeta results={first} label={MODE_LABELS[first.mode] ?? 'Events'} /> : <View style={{ height: spacing.md }} />}
        </>
      }
      ListEmptyComponent={
        feed.data === undefined ? (
          feed.error ? (
            <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
          ) : (
            <LoadingState label="Loading events…" />
          )
        ) : (
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
        )
      }
      ListFooterComponent={
        feed.isFetchingNextPage ? (
          <LoadingState compact />
        ) : feed.isFetchNextPageError ? (
          <ErrorState compact message={errorMessage(feed.error)} onRetry={() => feed.fetchNextPage()} />
        ) : items.length > 0 && !feed.hasNextPage ? (
          <AppText variant="caption" style={{ textAlign: 'center', paddingVertical: spacing.lg }}>
            That’s everything for now.
          </AppText>
        ) : undefined
      }
    />
  );
}

function UpcomingFeed({ top }: { top: ReactNode }) {
  const conflicts = useEventBrowseStore((state) => state.filters.conflicts);
  const feed = useEventList({ avoidConflicts: conflictOverride(conflicts) });
  return (
    <EventFeed
      feed={feed}
      header={
        <>
          {top}
          <SegmentBar />
          <FilterBar note="Upcoming is chronological; only the class-conflict filter applies here. Date, type, and topic filters apply to For You and search." />
        </>
      }
      emptyTitle="No upcoming events."
      emptySubtitle="Check back later or change the class-conflict filter."
    />
  );
}

function ForYouFeed({ top }: { top: ReactNode }) {
  const filters = useSearchFilters();
  const feed = useEventSearch('', filters);
  const preferences = usePreferences();
  const needsSetup = preferences.data ? isEmptyPreferences(preferences.data) : false;
  return (
    <EventFeed
      feed={feed}
      header={
        <>
          {top}
          <SegmentBar />
          {needsSetup && <PersonalizePrompt />}
          <FilterBar />
        </>
      }
      emptyTitle="No events match these filters."
      emptySubtitle="Try a wider date range or fewer filters."
    />
  );
}

function PersonalizePrompt() {
  return (
    <View style={{ marginTop: spacing.md, backgroundColor: colors.inkStrong, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm }}>
      <AppText variant="headline" style={{ color: colors.onDark }}>
        Make For You yours
      </AppText>
      <AppText variant="callout" style={{ color: colors.onDarkMuted }}>
        Pick a few interests and goals and BU One ranks campus events around them. You can skip this and keep browsing everything.
      </AppText>
      <Button title="Choose interests" size="sm" onPress={() => router.push('/onboarding')} style={{ alignSelf: 'flex-start', marginTop: spacing.xs }} />
    </View>
  );
}

function SearchFeed({ query, top }: { query: string; top: ReactNode }) {
  const filters = useSearchFilters();
  const feed = useEventSearch(query, filters);
  return (
    <EventFeed
      feed={feed}
      header={
        <>
          {top}
          <AppText variant="heading" accessibilityRole="header">
            Results for “{query}”
          </AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>
            Search matches words, not dates. Use Filters for days like “tomorrow.”
          </AppText>
          <FilterBar />
        </>
      }
      emptyTitle={`No events match “${query}”.`}
      emptySubtitle="Try other words or browse Upcoming."
    />
  );
}

function ExploreList({ top }: { top: ReactNode }) {
  const clusters = useEventClusters();
  const options = useEventOptions();
  const refreshControl = useRefresh(() => Promise.all([clusters.refetch(), options.refetch()]));
  const limitations = options.data?.data?.limitations;
  return (
    <FlatList
      {...listProps}
      data={clusters.data?.clusters ?? []}
      keyExtractor={(cluster) => cluster.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ClusterRow cluster={item} />}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={
        <>
          {top}
          <SegmentBar />
          <View style={{ marginTop: spacing.md, marginBottom: spacing.md, gap: 2 }}>
            <AppText variant="caption" style={{ color: colors.inkSoft }}>
              {limitations ?? 'Topic groups are formed automatically from event descriptions. They’re exploratory and unreviewed, not official BU categories.'}
            </AppText>
          </View>
          {clusters.error && clusters.data ? <StaleBanner onRetry={() => clusters.refetch()} /> : null}
        </>
      }
      ListEmptyComponent={
        clusters.data === undefined ? (
          clusters.error ? (
            <ErrorState message={errorMessage(clusters.error)} onRetry={() => clusters.refetch()} />
          ) : (
            <LoadingState label="Loading topic groups…" />
          )
        ) : (
          <EmptyState title="No topic groups yet." />
        )
      }
    />
  );
}

function ClusterRow({ cluster }: { cluster: EventCluster }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Topic group ${cluster.top_terms.slice(0, 3).join(', ')}${cluster.upcoming_count != null ? `, ${cluster.upcoming_count} upcoming events` : ''}`}
      onPress={() => router.push({ pathname: '/cluster/[id]', params: { id: cluster.id } })}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.separator,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {cluster.top_terms.slice(0, 4).map((term) => (
            <View key={term} style={{ backgroundColor: colors.chip, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}>
              <AppText variant="caption" style={{ color: colors.inkSoft }}>
                {term}
              </AppText>
            </View>
          ))}
        </View>
        <AppText variant="caption">
          {cluster.upcoming_count != null ? `${cluster.upcoming_count} upcoming` : 'Upcoming events'}
          {cluster.reviewed ? '' : ' · Exploratory'}
        </AppText>
      </View>
      <Icon name="chevron" size={17} color={colors.tertiary} />
    </Pressable>
  );
}

function SavedList({ top }: { top: ReactNode }) {
  const saved = useSavedEvents();
  const refreshControl = useRefresh(() => saved.refetch());
  return (
    <FlatList
      {...listProps}
      data={saved.data ?? []}
      keyExtractor={(event) => event.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <EventCard event={item} showReasons={false} />}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={
        <>
          {top}
          <SegmentBar />
          <AppText variant="caption" style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
            Saved is a bookmark list in BU One. It isn’t an RSVP and doesn’t add events to your calendar.
          </AppText>
          {saved.error && saved.data ? <StaleBanner onRetry={() => saved.refetch()} /> : null}
        </>
      }
      ListEmptyComponent={
        saved.data === undefined ? (
          saved.error ? (
            <ErrorState message={errorMessage(saved.error)} onRetry={() => saved.refetch()} />
          ) : (
            <LoadingState label="Loading saved events…" />
          )
        ) : (
          <EmptyState title="No saved events yet." subtitle="Tap Save on any event to keep it here." />
        )
      }
    />
  );
}

export function ClusterEventsScreen({ id }: { id: string }) {
  const conflicts = useEventBrowseStore((state) => state.filters.conflicts);
  const feed = useEventList({ cluster: id, avoidConflicts: conflictOverride(conflicts) });
  const options = useEventOptions();
  const cluster = options.data?.clusters.find((item) => item.id === id);
  return (
    <>
      <Stack.Screen options={{ title: cluster ? cluster.top_terms.slice(0, 2).join(' · ') : 'Topic group' }} />
      <EventFeed
        feed={feed}
        header={
          <AppText variant="caption" style={{ color: colors.inkSoft }}>
            {cluster ? `Grouped by shared words: ${cluster.top_terms.join(', ')}. ` : ''}
            Exploratory grouping, not an official BU category.
          </AppText>
        }
        emptyTitle="No upcoming events in this group."
      />
    </>
  );
}

export function EventFiltersScreen() {
  const current = useEventBrowseStore((state) => state.filters);
  const asOf = useEventBrowseStore((state) => state.asOf);
  const setFilters = useEventBrowseStore((state) => state.setFilters);
  const options = useEventOptions();
  const [draft, setDraft] = useState<BrowseFilters>(current);

  const toggle = (key: 'types' | 'clusterIds', value: string) =>
    setDraft((state) => ({ ...state, [key]: state[key].includes(value) ? state[key].filter((item) => item !== value) : [...state[key], value] }));

  return (
    <Screen>
      <Section title="When" style={{ marginTop: 0 }} caption={asOf ? formatAsOf(asOf) : undefined}>
        <View style={{ marginTop: spacing.sm }}>
          <PillGroup options={DATE_RANGES} value={draft.dateRange} onChange={(dateRange) => setDraft((state) => ({ ...state, dateRange }))} wrap />
        </View>
      </Section>

      <Section title="Class conflicts">
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <PillGroup options={CONFLICT_MODES} value={draft.conflicts} onChange={(conflicts) => setDraft((state) => ({ ...state, conflicts }))} wrap />
          <AppText variant="caption">“My preference” uses the setting in Interests & Preferences.</AppText>
        </View>
      </Section>

      <QueryView query={options} compact>
        {(data) => (
          <>
            <Section title="Event type">
              <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {eventTypes(data).map((type) => (
                  <Pill key={type} label={type} active={draft.types.includes(type)} onPress={() => toggle('types', type)} />
                ))}
              </View>
            </Section>
            <Section title="Topic groups" caption="Exploratory">
              <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {data.clusters.map((cluster) => (
                  <Pill key={cluster.id} label={cluster.top_terms.slice(0, 2).join(' · ')} active={draft.clusterIds.includes(cluster.id)} onPress={() => toggle('clusterIds', cluster.id)} />
                ))}
              </View>
            </Section>
          </>
        )}
      </QueryView>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button
          title="Show results"
          onPress={() => {
            setFilters(draft);
            router.back();
          }}
        />
        <Button title="Reset filters" variant="secondary" onPress={() => setDraft(DEFAULT_FILTERS)} />
      </View>
    </Screen>
  );
}

export function EventDetailScreen({ id }: { id: string }) {
  const query = useEventDetail(id);
  return (
    <Screen contentStyle={{ paddingTop: 0 }} onRefresh={() => query.refetch()}>
      <QueryView query={query} loadingLabel="Loading event…">
        {(event) => <EventDetail event={event} />}
      </QueryView>
    </Screen>
  );
}

function EventDetail({ event }: { event: EventCardModel }) {
  const actions = useEventActions();
  const options = useEventOptions();
  const asOf = useEventBrowseStore((state) => state.asOf);
  const { host, type } = eventCategory(event);
  const cluster = options.data?.clusters.find((item) => item.id === event.cluster_id);

  return (
    <>
      <View style={{ backgroundColor: colors.inkStrong, marginHorizontal: -spacing.screen, marginBottom: spacing.screen, paddingHorizontal: 20, paddingTop: 28, paddingBottom: spacing.xl }}>
        <AppText variant="eyebrow" style={{ color: '#ff9b96', letterSpacing: 0.2 }}>
          {[type, host].filter(Boolean).join(' · ')}
        </AppText>
        <AppText variant="largeTitle" selectable style={{ color: colors.onDark, marginTop: 9 }}>
          {event.title}
        </AppText>
      </View>

      {event.not_interested ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
          <AppText variant="caption" style={{ flex: 1 }}>
            You hid this event, so it won’t appear in your lists.
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => actions.unhide(event)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
              Undo
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <DetailItem icon="calendar" title={eventWhen(event, eventToday(asOf))} subtitle="Boston time" />
      <DetailItem icon="pin" title={event.location ?? 'Location not listed'} subtitle={event.location ? undefined : 'Check the official listing'} />
      <View style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: spacing.sm }}>
        <ConflictLine event={event} />
        <EventTagChips tags={event.tags} />
      </View>
      <EventTagsEditor event={event} />

      {event.reasons?.length ? (
        <Section title="Why this event?">
          {event.reasons.map((reason) => (
            <AppText key={reason} style={{ color: colors.inkSoft, marginTop: spacing.xs }}>
              • {reason}
            </AppText>
          ))}
        </Section>
      ) : null}

      <Paragraph>{event.description || 'No description provided.'}</Paragraph>

      {cluster ? (
        <AppText variant="caption" style={{ marginTop: -spacing.sm, marginBottom: spacing.lg }}>
          Topic group: {cluster.top_terms.slice(0, 3).join(', ')} (exploratory, not an official category)
        </AppText>
      ) : null}

      <View style={{ gap: 9 }}>
        <Button
          title={event.saved ? 'Saved · Remove' : 'Save event'}
          icon="bookmark"
          variant={event.saved ? 'planned' : 'primary'}
          onPress={() => actions.toggleSave(event)}
        />
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          Saving bookmarks it in BU One only. It isn’t an RSVP and won’t add anything to your calendar.
        </AppText>
        <Button title="Open official event page" icon="external" variant="secondary" onPress={() => openLink(event.source_url)} />
        <Button title="Ask BU One about this event" icon="spark" variant="secondary" onPress={() => openAsk(`Tell me about the event “${event.title}”`)} />
        {!event.not_interested && <Button title="Not interested" icon="hide" variant="ghost" onPress={() => actions.hide(event)} style={{ alignSelf: 'center' }} />}
      </View>
    </>
  );
}

function EventTagsEditor({ event }: { event: EventCardModel }) {
  const suggest = useTagSuggest(event.id);
  const save = useSaveEventTags();
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? eventTagIds(event.tags);
  const predictionId = suggest.data?.prediction_id ?? event.id;
  const suggested = new Set((suggest.data?.suggestions ?? []).map((item) => item.tag_id));

  const toggle = (id: string) => {
    setDraft((current) => {
      const next = current ?? eventTagIds(event.tags);
      return next.includes(id) ? next.filter((item) => item !== id) : [...next, id];
    });
  };

  return (
    <Section title="Tags" caption={event.tag_source === 'organizer' ? 'Your override' : 'From the campus taxonomy'}>
      <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
        These labels are for this event in your profile. An empty set is allowed and is not the same as leaving tags uncorrected.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        {TAG_IDS.map((id) => (
          <Pill key={id} label={suggested.has(id) ? `${tagLabel(id)} · suggested` : tagLabel(id)} active={selected.includes(id)} onPress={() => toggle(id)} />
        ))}
      </View>
      {save.error ? <InlineError message={errorMessage(save.error)} /> : null}
      <Button
        title={save.isPending ? 'Saving tags…' : 'Save tags'}
        variant="secondary"
        disabled={save.isPending}
        onPress={() =>
          save.mutate(
            { eventId: event.id, predictionId, tagIds: selected },
            {
              onSuccess: () => {
                setDraft(null);
                showToast(selected.length ? 'Tags saved for you' : 'Saved with no tags');
              },
            },
          )
        }
      />
    </Section>
  );
}
