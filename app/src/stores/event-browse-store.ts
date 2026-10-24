import { DEMO_AS_OF } from '@/api/event-format';
import { create } from 'zustand';

export const EVENT_SEGMENTS = ['Upcoming', 'For You', 'Explore', 'Saved'] as const;
export type EventSegment = (typeof EVENT_SEGMENTS)[number];

export const DATE_RANGES = ['Any time', 'Today', 'Tomorrow', 'This weekend', 'Next 7 days'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const CONFLICT_MODES = ['My preference', 'Hide conflicts', 'Include conflicts'] as const;
export type ConflictMode = (typeof CONFLICT_MODES)[number];

export type BrowseFilters = {
  dateRange: DateRange;
  /** Event types such as "Cultural"; expanded to backend category IDs when searching. */
  types: string[];
  clusterIds: string[];
  conflicts: ConflictMode;
};

export const DEFAULT_FILTERS: BrowseFilters = { dateRange: 'Any time', types: [], clusterIds: [], conflicts: 'My preference' };

type EventBrowseState = {
  segment: EventSegment;
  filters: BrowseFilters;
  /** Latest `as_of` returned by the backend; relative date filters are computed from it. */
  asOf: string;
  setSegment: (segment: EventSegment) => void;
  setFilters: (filters: BrowseFilters) => void;
  rememberAsOf: (asOf: string) => void;
};

export const useEventBrowseStore = create<EventBrowseState>((set, get) => ({
  segment: 'Upcoming',
  filters: DEFAULT_FILTERS,
  asOf: DEMO_AS_OF,
  setSegment: (segment) => set({ segment }),
  setFilters: (filters) => set({ filters }),
  rememberAsOf: (asOf) => {
    if (get().asOf !== asOf) set({ asOf });
  },
}));

export const activeFilterCount = (filters: BrowseFilters) =>
  Number(filters.dateRange !== 'Any time') + filters.types.length + filters.clusterIds.length + Number(filters.conflicts !== 'My preference');
