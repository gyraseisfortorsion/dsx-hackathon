import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { eventToday, eventWhen } from '@/api/event-format';
import { useRecommendedEvents } from '@/api/events';
import { useAttendance, useMealPlan } from '@/api/queries';
import { formatCents, mealSummary, overallAttendance, pluralize, type AgendaEntry } from '@/api/selectors';
import { useProfileDisplay } from '@/api/use-profile';
import { useSchedule, type Schedule } from '@/api/use-schedule';
import { AppText } from '@/components/app-text';
import { ConflictLine, openEvent } from '@/components/event-card';
import { ErrorState } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Timeline } from '@/components/timeline';
import { goToTab } from '@/navigation/routes';
import { useEventBrowseStore } from '@/stores/event-browse-store';
import { colors, radius, shadows, spacing } from '@/theme';
import {
  campusToday,
  dateOf,
  formatCountdown,
  formatLongDate,
  formatRelativeDay,
  formatShortTime,
  formatTime,
  greetingFor,
} from '@/utils/campus-time';
import { useNow } from '@/utils/use-now';

const UP_NEXT_COUNT = 3;

const openEntry = (entry: AgendaEntry) => router.push({ pathname: '/agenda/[id]', params: { id: entry.id } });

function daySummary(schedule: Schedule, today: string, now: number) {
  const todays = schedule.byDate.get(today) ?? [];
  const remainingClasses = todays.filter((entry) => entry.isClass && Date.parse(entry.startsAt) >= now).length;
  const dueToday = todays.filter((entry) => !entry.isClass).length;
  if (todays.length === 0) return 'No classes today. Your day has room to breathe.';
  if (remainingClasses === 0 && dueToday === 0) return 'You’re done with classes for today.';
  const parts = [remainingClasses ? `${pluralize(remainingClasses, 'class', 'classes')} left` : null, dueToday ? `${dueToday} due today` : null];
  return `${parts.filter(Boolean).join(' · ')}.`;
}

export function TodayScreen() {
  const { firstName } = useProfileDisplay();
  const schedule = useSchedule();
  const mealPlan = useMealPlan();
  const attendance = useAttendance();
  const recommended = useRecommendedEvents(1);
  const now = useNow();
  const today = campusToday(new Date(now));

  return (
    <Screen onRefresh={() => Promise.all([schedule.refetch(), mealPlan.refetch(), attendance.refetch(), recommended.refetch()])}>
      <View style={{ marginTop: spacing.xs, marginBottom: spacing.screen }}>
        <AppText variant="eyebrow" style={{ marginBottom: 7 }}>
          {formatLongDate(today).toUpperCase()}
        </AppText>
        <AppText variant="largeTitle" accessibilityRole="header">
          {greetingFor(new Date(now))}, {firstName}.
        </AppText>
        {schedule.data && <AppText style={{ marginTop: 6 }}>{daySummary(schedule.data, today, now)}</AppText>}
      </View>

      <QueryView query={schedule} loadingLabel="Loading your schedule…">
        {(data) => {
          const upcoming = data.upcoming(now);
          const nextClass = upcoming.find((entry) => entry.isClass);
          return (
            <>
              {nextClass ? <NextClassCard entry={nextClass} today={today} now={now} /> : <TermDoneCard />}
              <Section title="Up next" action={{ label: 'View calendar', onPress: () => goToTab('calendar') }}>
                <View style={{ marginTop: spacing.sm }}>
                  <Timeline
                    entries={upcoming.slice(0, UP_NEXT_COUNT).map((entry) => {
                      const date = dateOf(entry.startsAt);
                      return {
                        key: entry.id,
                        time: date === today ? formatShortTime(entry.startsAt) : formatRelativeDay(date, today).slice(0, 3),
                        title: entry.isClass ? `${entry.title} ${entry.label.toLowerCase()}` : entry.title,
                        subtitle: date === today ? entry.subtitle : `${formatRelativeDay(date, today)} · ${formatTime(entry.startsAt)}`,
                      };
                    })}
                  />
                </View>
              </Section>
            </>
          );
        }}
      </QueryView>

      <Section title="At a glance">
        <ListRow
          title="Dining"
          subtitle={mealPlan.data ? mealSummary(mealPlan.data).headline : 'Loading…'}
          value={mealPlan.data?.plan ? formatCents(mealPlan.data.balance.dining_points_balance_cents) : undefined}
          onPress={() => router.push('/dining')}
          minHeight={56}
        />
        <AttendanceGlance attendance={attendance.data?.courses} />
        <ListRow
          title="Grades"
          subtitle="Face ID protected"
          value="••••"
          accessibilityHint="Grades are hidden until you reveal them"
          onPress={() => router.push('/grades')}
          minHeight={56}
        />
        <CalendarGlance schedule={schedule.data} today={today} now={now} />
      </Section>

      <FeaturedEvent query={recommended} />
    </Screen>
  );
}

function NextClassCard({ entry, today, now }: { entry: AgendaEntry; today: string; now: number }) {
  const date = dateOf(entry.startsAt);
  const countdown = formatCountdown(entry.startsAt, now);
  const when = date === today ? formatTime(entry.startsAt) : `${formatRelativeDay(date, today).toUpperCase()} · ${formatTime(entry.startsAt)}`;
  const footer = countdown ? `Starts ${countdown}` : formatLongDate(date);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Next class ${entry.code} ${when}${entry.location ? ` in ${entry.location}` : ''}. ${footer}`}
      onPress={() => openEntry(entry)}
      style={({ pressed }) => ({
        minHeight: 176,
        backgroundColor: colors.inkStrong,
        borderRadius: 18,
        borderCurve: 'continuous',
        padding: spacing.screen,
        boxShadow: shadows.raised,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand }} />
        <AppText style={{ fontSize: 11, letterSpacing: 0.7, color: '#b9b9bf', flex: 1 }}>NEXT · {when}</AppText>
        {entry.location ? <AppText style={{ fontSize: 11, letterSpacing: 0.7, color: '#b9b9bf' }}>{entry.location}</AppText> : null}
      </View>
      <AppText style={{ fontSize: 25, fontWeight: '700', letterSpacing: -0.4, color: colors.onDark, marginTop: 30 }}>{entry.code}</AppText>
      <AppText style={{ fontSize: 14, color: colors.onDarkMuted, marginTop: 3 }} numberOfLines={1}>
        {entry.subtitle.split(' · ')[0]} · {entry.label}
      </AppText>
      <View
        style={{
          marginTop: 'auto',
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: '#39393d',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <AppText style={{ fontSize: 13, color: colors.onDark }}>{footer}</AppText>
        <Icon name="chevron" size={18} color={colors.onDark} />
      </View>
    </Pressable>
  );
}

function TermDoneCard() {
  return (
    <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 18, borderCurve: 'continuous', padding: spacing.screen, gap: spacing.xs }}>
      <AppText variant="headline">No upcoming classes</AppText>
      <AppText variant="callout">Your term schedule has no more class meetings.</AppText>
    </View>
  );
}

function AttendanceGlance({ attendance }: { attendance: Parameters<typeof overallAttendance>[0] | undefined }) {
  const stats = attendance ? overallAttendance(attendance) : null;
  return (
    <ListRow
      title="Attendance"
      subtitle={stats ? pluralize(stats.absent, 'absence', 'absences') : 'Loading…'}
      value={stats ? `${stats.percent}%` : undefined}
      onPress={() => router.push('/attendance')}
      minHeight={56}
    />
  );
}

function CalendarGlance({ schedule, today, now }: { schedule: Schedule | undefined; today: string; now: number }) {
  const todays = schedule?.byDate.get(today) ?? [];
  const next = todays.find((entry) => Date.parse(entry.startsAt) >= now);
  return (
    <ListRow
      title="Calendar"
      subtitle={!schedule ? 'Loading…' : next ? `Next at ${formatShortTime(next.startsAt)}` : 'Nothing else today'}
      value={schedule ? `${todays.length} today` : undefined}
      onPress={() => goToTab('calendar')}
      minHeight={56}
    />
  );
}

/** Top backend recommendation. Hidden quietly when there is nothing to suggest. */
function FeaturedEvent({ query }: { query: ReturnType<typeof useRecommendedEvents> }) {
  const asOf = useEventBrowseStore((state) => state.asOf);
  const event = query.data?.[0];
  if (query.error && !query.data) {
    return (
      <Section title="Events for you">
        <ErrorState compact message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      </Section>
    );
  }
  if (!event) return null;
  return (
    <Section title="Events for you" action={{ label: 'See all', onPress: () => goToTab('events') }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => openEvent(event.id)}
        style={({ pressed }) => ({
          minHeight: 88,
          flexDirection: 'row',
          alignItems: 'center',
          padding: 15,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: '#e4e1dc',
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          boxShadow: shadows.card,
          opacity: pressed ? 0.8 : 1,
        })}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="caption" style={{ color: colors.brand, fontWeight: '700' }}>
            {eventWhen(event, eventToday(asOf))}
          </AppText>
          <AppText variant="headline">{event.title}</AppText>
          {event.reasons?.[0] ? <AppText variant="caption">{event.reasons[0]}</AppText> : null}
          <ConflictLine event={event} />
        </View>
        <Icon name="chevron" color={colors.tertiary} />
      </Pressable>
    </Section>
  );
}
