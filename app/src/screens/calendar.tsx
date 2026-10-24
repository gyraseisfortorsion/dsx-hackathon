import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { countConflicts, formatTerm, type AgendaEntry } from '@/api/selectors';
import { useSchedule, type Schedule } from '@/api/use-schedule';
import { AgendaLabel } from '@/components/agenda-label';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IntroBlock } from '@/components/content';
import { Callout, EmptyState } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Timeline, type TimelineEntry } from '@/components/timeline';
import { clubs } from '@/data/campus';
import { goToTab, openAsk } from '@/navigation/routes';
import { usePlannerStore } from '@/stores/planner-store';
import { usePreferencesStore } from '@/stores/preferences-store';
import type { AgendaKind } from '@/types';
import { colors, radius, shadows, spacing } from '@/theme';
import {
  addDays,
  campusToday,
  formatDayChip,
  formatLongDate,
  formatMonthYear,
  formatShortTime,
  formatTime,
  formatWeekRange,
  minutesOf,
  startOfWeek,
} from '@/utils/campus-time';
import { tapFeedback } from '@/utils/haptics';

type CalendarView = 'Day' | 'Week';
type Row = { key: string; kind: AgendaKind; label: string; time: string; title: string; subtitle: string; href: Href };

const club = clubs[0];

const entryRow = (entry: AgendaEntry, time: string): Row => ({
  key: entry.id,
  kind: entry.kind,
  label: entry.label,
  time,
  title: entry.title,
  subtitle: entry.isClass ? entry.subtitle : [entry.subtitle, entry.endsAt ? `${formatTime(entry.startsAt)}–${formatTime(entry.endsAt)}` : null].filter(Boolean).join(' · '),
  href: { pathname: '/agenda/[id]', params: { id: entry.id } },
});

/** Club open houses planned locally, shown on today's date. Saved events are bookmarks and stay off the calendar. */
function usePlannedRows(): Row[] {
  const openHouse = usePlannerStore((state) => state.plannedOpenHouseIds.includes(club.id));
  return [
    ...(openHouse
      ? [{ key: 'club', kind: 'event' as const, label: 'Club event', time: club.openHouse.timeShort, title: club.openHouse.title, subtitle: `${club.openHouse.place} · club chat available`, href: { pathname: '/club/[id]', params: { id: club.id } } as Href }]
      : []),
  ];
}

export function CalendarScreen() {
  const schedule = useSchedule();
  const [planningDate, setPlanningDate] = useState<string | null>(null);

  return (
    <QueryView query={schedule} loadingLabel="Loading your calendar…">
      {(data) =>
        planningDate ? (
          <PlanMyDay schedule={data} date={planningDate} onClose={() => setPlanningDate(null)} />
        ) : (
          <CalendarOverview schedule={data} onRefresh={schedule.refetch} onPlan={setPlanningDate} />
        )
      }
    </QueryView>
  );
}

function CalendarOverview({ schedule, onRefresh, onPlan }: { schedule: Schedule; onRefresh: () => Promise<unknown>; onPlan: (date: string) => void }) {
  const today = campusToday();
  const [view, setView] = useState<CalendarView>('Day');
  const [date, setDate] = useState(today);
  const plannedRows = usePlannedRows();

  const { term } = schedule;
  const firstDay = term.starts_on;
  const lastDay = term.finals_end;
  const step = view === 'Week' ? 7 : 1;
  const anchor = view === 'Week' ? startOfWeek(date) : date;
  const canGoBack = addDays(anchor, -1) >= firstDay;
  const canGoForward = addDays(anchor, step) <= lastDay;

  const dayEntries = schedule.byDate.get(date) ?? [];
  const dayRows = [...dayEntries.map((entry) => entryRow(entry, formatShortTime(entry.startsAt))), ...(date === today ? plannedRows : [])];
  const conflicts = countConflicts(dayEntries);

  const weekStart = startOfWeek(date);
  const weekRows = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)).flatMap((day) =>
    (schedule.byDate.get(day) ?? []).map((entry) => entryRow(entry, formatDayChip(day))),
  );

  return (
    <Screen onRefresh={onRefresh}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPlan(date)}
        style={({ pressed }) => ({
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: 14,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          boxShadow: shadows.card,
          opacity: pressed ? 0.8 : 1,
        })}>
        <Icon name="spark" color={colors.brand} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="headline">Plan my day</AppText>
          <AppText variant="caption">Optimize classes, meals, focus time, and events</AppText>
        </View>
        <Icon name="chevron" color={colors.tertiary} />
      </Pressable>

      <View style={{ minHeight: 48, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.chip, borderRadius: 9, padding: 2 }}>
          {(['Day', 'Week'] as const).map((option) => {
            const active = view === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  tapFeedback();
                  setView(option);
                }}
                style={{
                  minWidth: 62,
                  minHeight: 36,
                  borderRadius: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.surface : 'transparent',
                  boxShadow: active ? '0 1px 4px rgba(20, 20, 20, 0.08)' : undefined,
                }}>
                <AppText variant="label" style={{ fontSize: 12, color: active ? colors.brand : colors.ink }}>
                  {option}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {date !== today ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setDate(today)} style={{ minHeight: 36, justifyContent: 'center' }}>
            <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
              Today
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="micro" style={{ fontWeight: '400' }}>
            {formatTerm(term.id)}
          </AppText>
        )}
      </View>

      <View
        style={{
          minHeight: 69,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: colors.separator,
          marginBottom: spacing.screen,
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'Week' ? 'Previous week' : 'Previous day'}
          disabled={!canGoBack}
          onPress={() => setDate((value) => addDays(value, -step))}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canGoBack ? 1 : 0.3 }}>
          <Icon name="back" size={18} />
        </Pressable>
        <View style={{ alignItems: 'center' }} accessibilityLiveRegion="polite">
          <AppText variant="micro" style={{ letterSpacing: 0.8 }}>
            {formatMonthYear(date)}
          </AppText>
          <AppText variant="headline">{view === 'Week' ? formatWeekRange(weekStart) : formatLongDate(date)}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'Week' ? 'Next week' : 'Next day'}
          disabled={!canGoForward}
          onPress={() => setDate((value) => addDays(value, step))}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canGoForward ? 1 : 0.3 }}>
          <Icon name="chevron" size={18} />
        </Pressable>
      </View>

      {view === 'Week' ? (
        weekRows.length ? (
          weekRows.map((row) => <WeekRow key={row.key} row={row} />)
        ) : (
          <EmptyCalendar date={date} schedule={schedule} week />
        )
      ) : dayRows.length ? (
        <>
          {dayRows.map((row) => (
            <DayRow key={row.key} row={row} />
          ))}
          <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.separator, marginTop: 14 }}>
            <Icon name={conflicts ? 'calendar' : 'check'} size={16} color={conflicts ? colors.brand : colors.success} />
            <View style={{ flex: 1 }}>
              <AppText variant="headline" style={{ color: conflicts ? colors.brand : colors.success }}>
                {conflicts ? `${conflicts} schedule ${conflicts === 1 ? 'conflict' : 'conflicts'}` : 'No conflicts detected'}
              </AppText>
              <AppText variant="caption">{conflicts ? 'Two items overlap on this day' : 'Classes and exams don’t overlap'}</AppText>
            </View>
          </View>
        </>
      ) : (
        <EmptyCalendar date={date} schedule={schedule} />
      )}

      {view === 'Day' && date === today && plannedRows.length === 0 && (
        <Callout
          title="Your evening is open"
          body="Explore recommended campus events that fit around your classes."
          actions={[{ label: 'Explore Events', onPress: () => goToTab('events') }]}
        />
      )}
    </Screen>
  );
}

function EmptyCalendar({ date, schedule, week }: { date: string; schedule: Schedule; week?: boolean }) {
  const suspended = schedule.term.suspended_dates.includes(date);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  const subtitle = suspended
    ? 'Classes are suspended on this date.'
    : week
      ? 'No classes or deadlines this week.'
      : weekend
        ? 'No classes on the weekend. Enjoy the time off.'
        : 'Nothing is scheduled for this day.';
  return (
    <View style={{ minHeight: 200, justifyContent: 'center' }}>
      <EmptyState icon="calendar" title={suspended ? 'No classes' : week ? 'Quiet week' : 'Free day'} subtitle={subtitle} />
    </View>
  );
}

function DayRow({ row }: { row: Row }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${row.time}, ${row.title}, ${row.subtitle}`}
      onPress={() => router.push(row.href)}
      style={({ pressed }) => ({
        minHeight: 83,
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
        opacity: pressed ? 0.6 : 1,
      })}>
      <AppText variant="caption" style={{ width: 48, paddingTop: 3, fontVariant: ['tabular-nums'] }}>
        {row.time}
      </AppText>
      <View style={{ flex: 1 }}>
        <AgendaLabel kind={row.kind} label={row.label} />
        <AppText variant="headline">{row.title}</AppText>
        <AppText variant="caption">{row.subtitle}</AppText>
      </View>
      <Icon name="chevron" color={colors.tertiary} />
    </Pressable>
  );
}

function WeekRow({ row }: { row: Row }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${row.time}, ${row.title}, ${row.subtitle}`}
      onPress={() => router.push(row.href)}
      style={({ pressed }) => ({
        minHeight: 76,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
        opacity: pressed ? 0.6 : 1,
      })}>
      <AppText variant="caption" style={{ width: 55 }}>
        {row.time}
      </AppText>
      <View style={{ flex: 1 }}>
        <AgendaLabel kind={row.kind} label={row.label} />
        <AppText variant="headline">{row.title}</AppText>
        <AppText variant="caption">{row.subtitle}</AppText>
      </View>
    </Pressable>
  );
}

const LUNCH_WINDOW = { start: 11 * 60 + 30, end: 13 * 60 + 30 };
const MIN_LUNCH_MINUTES = 40;
const MIN_FOCUS_MINUTES = 90;

/** Fills gaps between the day's scheduled items with a lunch break and focus blocks. */
function buildDayPlan(entries: AgendaEntry[], { vegetarian, stepFree }: { vegetarian: boolean; stepFree: boolean }): TimelineEntry[] {
  const timed = entries.filter((entry) => entry.endsAt);
  const plan: (TimelineEntry & { at: number })[] = entries.map((entry) => ({
    key: entry.id,
    at: minutesOf(entry.startsAt),
    time: formatShortTime(entry.startsAt),
    title: entry.isClass ? `${entry.code} ${entry.label.toLowerCase()}` : entry.title,
    subtitle: [entry.location, stepFree && entry.location ? 'step-free route' : null, entry.isClass ? null : entry.subtitle].filter(Boolean).join(' · '),
  }));

  const clock = (minutes: number) => formatShortTime(`0000-00-00T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  let lunchPlaced = false;
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  const busy = timed.map((entry) => [minutesOf(entry.startsAt), minutesOf(entry.endsAt!)] as const).sort((a, b) => a[0] - b[0]);
  let cursor = busy.length ? Math.min(busy[0][0], dayStart) : dayStart;
  for (const [start, end] of [...busy, [dayEnd, dayEnd] as const]) {
    const gapStart = cursor + 10;
    const gapEnd = start - 10;
    const lunchStart = Math.max(gapStart, LUNCH_WINDOW.start);
    if (!lunchPlaced && Math.min(gapEnd, LUNCH_WINDOW.end) - lunchStart >= MIN_LUNCH_MINUTES) {
      plan.push({ key: `lunch-${lunchStart}`, at: lunchStart, time: clock(lunchStart), title: vegetarian ? 'Vegetarian lunch' : 'Lunch', subtitle: 'Nearest dining hall · 40 min' });
      lunchPlaced = true;
    } else if (gapEnd - gapStart >= MIN_FOCUS_MINUTES) {
      plan.push({ key: `focus-${gapStart}`, at: gapStart, time: clock(gapStart), title: 'Focus block', subtitle: `${Math.round((gapEnd - gapStart) / 30) / 2} hr · Mugar Library` });
    }
    cursor = Math.max(cursor, end);
  }
  return plan.sort((a, b) => a.at - b.at).map(({ at: _at, ...entry }) => entry);
}

function PlanMyDay({ schedule, date, onClose }: { schedule: Schedule; date: string; onClose: () => void }) {
  const vegetarian = usePreferencesStore((state) => state.vegetarian);
  const stepFree = usePreferencesStore((state) => state.stepFree);
  const entries = schedule.byDate.get(date) ?? [];
  const plan = buildDayPlan(entries, { vegetarian, stepFree });
  const day = formatLongDate(date);

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Calendar"
        onPress={onClose}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
        <Icon name="back" size={18} color={colors.brand} />
        <AppText variant="label" style={{ color: colors.brand }}>
          Calendar
        </AppText>
      </Pressable>
      <IntroBlock eyebrow={day.toUpperCase()} title="Plan my day" copy="BU One balanced your classes, meals, and focus time around your schedule." bordered={false} />

      <Pressable
        accessibilityRole="button"
        onPress={() => openAsk(`Help me plan ${date === campusToday() ? 'today' : day}`)}
        style={({ pressed }) => ({
          minHeight: 78,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: 15,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          boxShadow: shadows.card,
          opacity: pressed ? 0.8 : 1,
        })}>
        <Icon name="spark" color={colors.brand} />
        <AppText style={{ flex: 1, fontSize: 14, lineHeight: 19, color: colors.ink }}>Ask BU One to adjust this plan or add study time for upcoming deadlines.</AppText>
        <Icon name="chevron" color={colors.tertiary} />
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 17 }}>
        <Icon name="check" size={16} color={colors.success} />
        <AppText variant="caption" style={{ color: colors.success }}>
          {entries.length ? 'Optimized around class and walking time' : 'No classes. The whole day is yours'}
        </AppText>
      </View>

      <Timeline entries={plan} spacious />

      <Button title="Use this plan" icon="check" onPress={onClose} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
