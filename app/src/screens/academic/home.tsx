import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { dashboardQuery, useAcademicCourses, searchAcademicQuery, passageQuery } from '@/api/academic';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DemoBanner, EmptyState } from '@/components/feedback';
import { TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { campusToday, formatTime, toCampusIso } from '@/utils/campus-time';
import { courseLabel } from '@/utils/academic';
import { spacing } from '@/theme';
import { AcademicAssessmentRow, PassageLink } from './shared';

export function AcademicHomeScreen() {
  const query = useUserQuery(dashboardQuery(campusToday()));
  const courses = useAcademicCourses();
  return <Screen onRefresh={() => Promise.all([query.refetch(), courses.refetch()])}>
    <DemoBanner title="Your academic workspace">Syllabi, personal grade estimates, and study plans. Review extracted details before adding them to your schedule.</DemoBanner>
    <View style={{ gap: spacing.sm }}>
      <Button title="Upload a syllabus" onPress={() => router.push('/academic/upload')} />
      <Button title="Plan study time" variant="secondary" onPress={() => router.push('/academic/planner')} />
    </View>
    <QueryView query={query} loadingLabel="Loading your academic overview…">{({ data }) => <>
      <Section title="Today" caption={`${data.credits} credits`}>
        {data.today_classes.length ? data.today_classes.map(item => <ListRow key={item.id} title={item.title} subtitle={`${formatTime(toCampusIso(item.starts_at))} · ${item.location ?? 'Room not listed'}`} onPress={() => router.push({ pathname: '/academic/course/[id]', params: { id: item.course_id } })} />) : <EmptyState title="No classes today" subtitle="Use the time to review a syllabus or plan your week." />}
        {data.pending_syllabus_items > 0 && <ListRow title={`${data.pending_syllabus_items} syllabus items need review`} onPress={() => router.push('/academic/syllabi')} />}
      </Section>
      {data.overdue_assessments.length > 0 && <Section title="Needs attention">{data.overdue_assessments.map(item => <AcademicAssessmentRow key={item.id} item={item} />)}</Section>}
      <Section title="Coming up"><View /></Section>
      {data.upcoming_assessments.length ? data.upcoming_assessments.map(item => <AcademicAssessmentRow key={item.id} item={item} />) : <EmptyState title="No upcoming assessments" subtitle="Upload a syllabus to add reviewed deadlines." />}
    </>}</QueryView>
    <Section title="Courses"><QueryView query={courses}>{({ data }) => data.length ? data.map(course => <ListRow key={course.id} title={course.code} subtitle={course.title} onPress={() => router.push({ pathname: '/academic/course/[id]', params: { id: course.id } })} />) : <EmptyState title="No courses available" />}</QueryView></Section>
    <Section title="Tools"><Card>
      <ListRow title="Syllabus library" subtitle="Review extracted dates and policies" onPress={() => router.push('/academic/syllabi')} />
      <ListRow title="Search syllabi" subtitle="Find a policy and its source" onPress={() => router.push('/academic/search')} />
      <ListRow title="Availability" subtitle="Choose when you can study" onPress={() => router.push('/academic/availability')} />
      <ListRow title="Completed courses" subtitle="Manage prerequisite evidence" onPress={() => router.push('/academic/completed')} />
      <ListRow title="Check a prerequisite" subtitle="Look up a course by its ID" onPress={() => router.push('/academic/prerequisites')} />
    </Card></Section>
  </Screen>;
}

export function AcademicSearchScreen() {
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const query = useUserQuery(user => ({ ...searchAcademicQuery(term)(user), enabled: !!term }));
  return <Screen>
    <AppText style={{ marginBottom: spacing.lg }}>Search your uploaded syllabi for policies, deadlines, and grading details.</AppText>
    <TextField label="Search syllabi" value={draft} onChangeText={setDraft} maxLength={500} placeholder="Late work, attendance, grading…" returnKeyType="search" onSubmitEditing={() => setTerm(draft.trim())} />
    <Button title="Search" disabled={!draft.trim() || query.isFetching} onPress={() => setTerm(draft.trim())} />
    {term ? <Section title={`Results for “${term}”`}><QueryView query={query}>{({ data }) => data.length ? data.map((item) => <View key={item.id} style={{ paddingVertical: spacing.md }}><AppText variant="headline">{courseLabel(item.course_id)}{item.page ? ` · Page ${item.page}` : ''}</AppText><AppText selectable>{item.excerpt ?? item.text}</AppText><PassageLink id={item.id} /></View>) : <EmptyState title="No matching passages" subtitle="Try a different phrase or upload a syllabus first." />}</QueryView></Section> : null}
  </Screen>;
}

export function AcademicPassageScreen({ id }: { id: string }) {
  const query = useUserQuery(passageQuery(id));
  return <Screen onRefresh={query.refetch}><QueryView query={query} loadingLabel="Loading source passage…">{({ data }) => <>
    <AppText variant="eyebrow">{courseLabel(data.course_id)}{data.page ? ` · Page ${data.page}` : ''}</AppText>
    <Card style={{ padding: spacing.lg, marginVertical: spacing.lg }}><AppText selectable style={{ lineHeight: 25 }}>{data.text ?? data.excerpt}</AppText></Card>
    {data.syllabus_id && <Button title="Open syllabus review" variant="secondary" onPress={() => router.push({ pathname: '/academic/syllabus/[id]', params: { id: data.syllabus_id } })} />}
  </>}</QueryView></Screen>;
}
