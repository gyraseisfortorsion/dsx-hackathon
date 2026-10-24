import type { BrowseFilters, ConflictMode } from '@/stores/event-browse-store';
import { addDays, campusMidnight, dateOf, formatRelativeDay, formatShortDate, formatTime, toCampusIso, weekdayIndex } from '@/utils/campus-time';
import type { EventCard, EventFilters, EventOptions } from './types';

/** Backend demo clock. Relative event labels and date filters use this when no `as_of` has arrived yet. */
export const DEMO_AS_OF = '2026-10-24T12:00:00-04:00';

export const eventToday = (asOf?: string | null) => dateOf(toCampusIso(asOf ?? DEMO_AS_OF));

/** "BUJSA1227, Cultural" -> { host: "BUJSA1227", type: "Cultural" } */
export function eventCategory(card: Pick<EventCard, 'source_category'>) {
  const [host, ...rest] = card.source_category.split(', ');
  return rest.length ? { host, type: rest.join(', ') } : { host: '', type: host };
}

export const eventStart = (card: Pick<EventCard, 'starts_at'>) => toCampusIso(card.starts_at);

/** "Today · 1:00 PM – 4:00 PM", "Sun, Oct 25 · 6:00 PM – Mon, Oct 26 2:00 AM" */
export function eventWhen(card: Pick<EventCard, 'starts_at' | 'ends_at'>, today: string) {
  const start = toCampusIso(card.starts_at);
  const day = formatRelativeDay(dateOf(start), today);
  if (!card.ends_at) return `${day} · ${formatTime(start)}`;
  const end = toCampusIso(card.ends_at);
  const endLabel = dateOf(end) === dateOf(start) ? formatTime(end) : `${formatShortDate(dateOf(end))} ${formatTime(end)}`;
  return `${day} · ${formatTime(start)} – ${endLabel}`;
}

export type ConflictStatus = { tone: 'conflict' | 'unknown' | 'clear'; label: string };

/** Incomplete checks are never presented as a guarantee that the student is free. */
export function conflictStatus(card: Pick<EventCard, 'conflict_ids' | 'conflict_check_complete'>): ConflictStatus {
  const count = card.conflict_ids?.length ?? 0;
  if (count > 0) return { tone: 'conflict', label: `Overlaps ${count === 1 ? 'a class meeting' : `${count} class meetings`}` };
  if (!card.conflict_check_complete) return { tone: 'unknown', label: 'Schedule check incomplete · confirm it fits your classes' };
  return { tone: 'clear', label: 'No overlap with your class schedule' };
}

/** "As of Sat, Oct 24 · 12:00 PM" */
export function formatAsOf(asOf: string) {
  const local = toCampusIso(asOf);
  return `As of ${formatShortDate(dateOf(local))} · ${formatTime(local)}`;
}

/** Distinct event types ("Cultural", "Social") offered by the backend's category IDs. */
export function eventTypes(options: EventOptions) {
  return [...new Set(options.categories.map((category) => eventCategory({ source_category: category }).type))].sort();
}

const MAX_FILTER_IDS = 30;

function dateWindow(range: BrowseFilters['dateRange'], asOf: string) {
  const today = dateOf(toCampusIso(asOf));
  const days = (from: string, count: number) => ({ starts_from: campusMidnight(from), starts_before: campusMidnight(addDays(from, count)) });
  switch (range) {
    case 'Today':
      return days(today, 1);
    case 'Tomorrow':
      return days(addDays(today, 1), 1);
    case 'This weekend': {
      const weekday = weekdayIndex(today);
      const saturday = weekday === 0 ? addDays(today, -1) : addDays(today, (6 - weekday + 7) % 7);
      return { starts_from: campusMidnight(saturday < today ? today : saturday), starts_before: campusMidnight(addDays(saturday, 2)) };
    }
    case 'Next 7 days':
      return days(today, 7);
    default:
      return {};
  }
}

export const conflictOverride = (mode: ConflictMode) => (mode === 'Hide conflicts' ? true : mode === 'Include conflicts' ? false : undefined);

/** Builds the search filter body. Relative dates use the backend's `as_of`, not the device clock. */
export function toApiFilters(filters: BrowseFilters, options: EventOptions | undefined, asOf: string | null): EventFilters {
  const categoryIds = options
    ? options.categories.filter((category) => filters.types.includes(eventCategory({ source_category: category }).type)).slice(0, MAX_FILTER_IDS)
    : [];
  const override = conflictOverride(filters.conflicts);
  return {
    ...(asOf ? dateWindow(filters.dateRange, asOf) : {}),
    ...(categoryIds.length ? { category_ids: categoryIds } : {}),
    ...(filters.clusterIds.length ? { cluster_ids: filters.clusterIds.slice(0, MAX_FILTER_IDS) } : {}),
    ...(override === undefined ? {} : { avoid_schedule_conflicts: override }),
  };
}
