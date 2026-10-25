import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { academicGradesQuery, useAcademicCourses, prerequisiteQuery } from '@/api/academic';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/feedback';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { courseLabel } from '@/utils/academic';
import { colors, spacing } from '@/theme';
import { AcademicAssessmentRow } from './shared';

export function AcademicCourseScreen({ id }: { id: string }) {
  const courses = useAcademicCourses();
  const grades = useUserQuery(academicGradesQuery(id));
  const prerequisite = useUserQuery(prerequisiteQuery(id));
  const course = courses.data?.data.find(item => item.id === id);
  return <Screen onRefresh={() => Promise.all([courses.refetch(), grades.refetch(), prerequisite.refetch()])}>
    <Stack.Screen options={{ title: course?.code ?? courseLabel(id) }} />
    <AppText variant="heading">{course?.title ?? courseLabel(id)}</AppText>
    <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
      <Button title="Upload syllabus" onPress={() => router.push({ pathname: '/academic/upload', params: { courseId: id } })} />
      <Button title="View syllabi" variant="secondary" onPress={() => router.push({ pathname: '/academic/syllabi', params: { courseId: id } })} />
    </View>
    <Section title="Personal grade estimate"><QueryView query={grades}>{({ data }) => <>
      <AppText variant="display" selectable>{data.current_percentage == null ? '—' : `${data.current_percentage}%`}</AppText>
      <AppText variant="caption">{data.mode === 'weighted' ? 'Weighted by category' : `${data.earned} / ${data.possible} graded points`} · Not an official grade</AppText>
      <Button title="Explore a grade scenario" variant="ghost" onPress={() => router.push({ pathname: '/academic/grade-scenario', params: { courseId: id } })} />
      <Button title="Edit grading scheme" variant="ghost" onPress={() => router.push({ pathname: '/academic/grading-scheme', params: { courseId: id } })} />
      <Section title="Assessments">{data.assessments.length ? data.assessments.map(item => <AcademicAssessmentRow key={item.id} item={item} />) : <EmptyState title="No assessments yet" subtitle="Upload and review a syllabus to add assessments." />}</Section>
    </>}</QueryView></Section>
    <Section title="Prerequisites"><QueryView query={prerequisite}>{({ data }) => <Card style={{ padding: spacing.lg }}>
      <AppText variant="headline" style={{ color: data.status === 'met' ? colors.success : colors.ink }}>{data.status === 'met' ? 'Requirements met' : data.status === 'not_met' ? 'Requirements not met' : 'More information needed'}</AppText>
      <AppText>{data.reason ?? (data.status === 'unknown' ? 'Add a reviewed prerequisite rule and completed-course evidence to check eligibility.' : 'Based on your reviewed rules and completed courses.')}</AppText>
      <Button title="Review prerequisite details" variant="ghost" onPress={() => router.push({ pathname: '/academic/prerequisites', params: { courseId: id } })} />
    </Card>}</QueryView></Section>
  </Screen>;
}
