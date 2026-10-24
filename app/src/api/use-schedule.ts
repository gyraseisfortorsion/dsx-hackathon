import { useCalendar, useCourses } from './queries';
import { combineQueries } from './combine';
import { courseLookup, groupByDate, toAgendaEntry, type AgendaEntry, type CourseLookup } from './selectors';
import type { Term } from './types';

export type Schedule = {
  entries: AgendaEntry[];
  byDate: Map<string, AgendaEntry[]>;
  courses: CourseLookup;
  term: Term;
  /** Entries that haven't started yet, soonest first. */
  upcoming: (now?: number) => AgendaEntry[];
};

/** Calendar events joined with course metadata. */
export function useSchedule() {
  const calendar = useCalendar();
  const courses = useCourses();
  return combineQueries([calendar, courses] as const, (calendarData, coursesData): Schedule => {
    const lookup = courseLookup(coursesData.courses);
    const entries = calendarData.events.map((event) => toAgendaEntry(event, lookup));
    const sorted = [...entries].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return {
      entries,
      byDate: groupByDate(entries),
      courses: lookup,
      term: coursesData.term,
      upcoming: (now = Date.now()) => sorted.filter((entry) => Date.parse(entry.startsAt) >= now),
    };
  });
}
