import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { useEventOptions, usePreferences } from '@/api/events';
import { useAttendance, useMealPlan } from '@/api/queries';
import { formatCents, formatTerm, overallAttendance, pluralize } from '@/api/selectors';
import { useProfileDisplay } from '@/api/use-profile';
import { useSchedule } from '@/api/use-schedule';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Avatar, KeyValueList } from '@/components/content';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { goToTab } from '@/navigation/routes';
import { usePreferencesStore } from '@/stores/preferences-store';
import { spacing } from '@/theme';
import { campusToday } from '@/utils/campus-time';
import { confirmSignOut } from '@/utils/confirm-sign-out';

const settings = (id: string): Href => ({ pathname: '/settings/[id]', params: { id } });

function useInterestSummary() {
  const preferences = usePreferences();
  const options = useEventOptions();
  if (!preferences.data || !options.data) return preferences.error ? 'Couldn’t load preferences' : 'Loading…';
  const labels = preferences.data.interest_ids.map((id) => options.data.interests.find((interest) => interest.id === id)?.label ?? id);
  if (labels.length === 0) return preferences.data.interests_text.trim() ? 'Custom interests' : 'Not set · browse all events';
  return labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3}` : '');
}

export function MeScreen() {
  const interestSummary = useInterestSummary();
  const stepFree = usePreferencesStore((state) => state.stepFree);
  const { profile, name, initials, subtitle } = useProfileDisplay();
  const mealPlan = useMealPlan();
  const attendance = useAttendance();
  const schedule = useSchedule();

  const attendanceStats = attendance.data ? overallAttendance(attendance.data.courses) : null;
  const todayCount = schedule.data?.byDate.get(campusToday())?.length;

  const essentials: { title: string; subtitle: string; onPress: () => void }[] = [
    {
      title: 'Dining & Campus Wallet',
      subtitle: mealPlan.data ? `${formatCents(mealPlan.data.balance.dining_points_balance_cents)} Dining Points` : 'Meal plan and balances',
      onPress: () => router.push('/dining'),
    },
    { title: 'Housing', subtitle: 'Warren Towers · Demo data', onPress: () => router.push('/housing') },
    { title: 'Work & Pay', subtitle: 'Timesheet due Sunday · Demo', onPress: () => router.push('/work') },
    {
      title: 'Attendance',
      subtitle: attendanceStats ? `${attendanceStats.percent}% · ${pluralize(attendanceStats.absent, 'absence', 'absences')}` : 'Course attendance',
      onPress: () => router.push('/attendance'),
    },
    { title: 'Grades', subtitle: profile ? `${formatTerm(profile.term)} progress` : 'Term progress', onPress: () => router.push('/grades') },
    {
      title: 'Calendar',
      subtitle: todayCount === undefined ? 'Classes and deadlines' : todayCount ? `${pluralize(todayCount, 'item')} today` : 'Nothing scheduled today',
      onPress: () => goToTab('calendar'),
    },
    { title: 'Events', subtitle: 'Upcoming, For You, and Saved', onPress: () => goToTab('events') },
  ];

  return (
    <Screen onRefresh={() => Promise.all([mealPlan.refetch(), attendance.refetch(), schedule.refetch()])}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, paddingTop: 5, paddingBottom: 17 }}>
        <Avatar initials={initials} size={64} tone="dark" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" accessibilityRole="header">
            {name}
          </AppText>
          <AppText>{subtitle}</AppText>
        </View>
      </View>
      <Button title="Edit profile" variant="secondary" onPress={() => router.push(settings('edit-profile'))} />

      {profile && (
        <Section title="Student record" caption="Demo API">
          <KeyValueList
            items={[
              { label: 'BU ID', value: profile.buid },
              { label: 'Email', value: profile.email },
              { label: 'School', value: profile.school },
              { label: 'Major', value: profile.major },
              { label: 'Term', value: formatTerm(profile.term) },
            ]}
          />
        </Section>
      )}

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="heading" style={{ paddingTop: 10, paddingBottom: 3 }}>
          BU essentials
        </AppText>
        {essentials.map((item, index) => (
          <ListRow key={item.title} {...item} separator={index < essentials.length - 1} minHeight={61} />
        ))}
      </Card>

      <Section title="Personalization">
        <ListRow title="Interests & Preferences" subtitle={interestSummary} onPress={() => router.push('/preferences')} minHeight={61} />
        <ListRow title="Accessibility" subtitle={stepFree ? 'Step-free routes' : 'System defaults'} onPress={() => router.push(settings('accessibility'))} minHeight={61} />
        <ListRow title="Notifications" subtitle="Classes and saved events" onPress={() => router.push(settings('notifications'))} minHeight={61} />
      </Section>

      <Section title="Privacy & connections">
        <ListRow title="Data Connections" subtitle="BU Student Prototype API" onPress={() => router.push(settings('data-connections'))} minHeight={61} />
        <ListRow title="Privacy" subtitle="You choose what BU One uses" onPress={() => router.push(settings('privacy'))} minHeight={61} />
        <ListRow title="Sign out" subtitle={`Signed in as ${name}`} accessory="none" onPress={() => confirmSignOut(name)} minHeight={61} />
      </Section>
    </Screen>
  );
}
