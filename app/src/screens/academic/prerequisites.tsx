import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { dashboardQuery, prerequisiteQuery, useAcademicWrite, type CompletedCourse, type PrerequisiteCheck } from '@/api/academic';
import { useAcademicLocal } from '@/api/academic-local';
import { useUserQuery } from '@/api/queries';
import { errorMessage } from '@/api/client';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState, InlineError } from '@/components/feedback';
import { TextField } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { showToast } from '@/stores/toast-store';
import { colors, spacing } from '@/theme';
import { campusToday } from '@/utils/campus-time';
import { courseLabel, splitCodes, isNumberIn } from '@/utils/academic';
import { PassageLink } from './shared';

export function PrerequisitesScreen({ courseId }: { courseId?: string }) {
  const [draftId, setDraftId] = useState(courseId ?? '');
  const [selectedId, setSelectedId] = useState(courseId ?? '');
  const query = useUserQuery(user => ({ ...prerequisiteQuery(selectedId)(user), enabled: !!selectedId }));
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-');
  return <Screen onRefresh={selectedId ? query.refetch : undefined}>
    <TextField label="Course ID" value={draftId} onChangeText={setDraftId} autoCapitalize="none" autoCorrect={false} placeholder="cas-cs-210" returnKeyType="search" onSubmitEditing={() => { if (draftId.trim()) setSelectedId(normalize(draftId)); }} />
    <Button title="Check prerequisites" disabled={!draftId.trim() || query.isFetching} onPress={() => { const id = normalize(draftId); if (id === selectedId) void query.refetch(); else setSelectedId(id); }} />
    {selectedId && <Section title={courseLabel(selectedId)}><QueryView query={query}>{snapshot => <RuleForm key={selectedId} check={snapshot.data} version={snapshot.version} />}</QueryView></Section>}
  </Screen>;
}
function RuleForm({ check, version }: { check: PrerequisiteCheck; version: number }) {
  const save = useAcademicWrite<PrerequisiteCheck>();
  const [all, setAll] = useState((check.rule?.all_of ?? []).join(', '));
  const [any, setAny] = useState((check.rule?.any_of ?? []).join(', '));
  const [grade, setGrade] = useState(check.rule?.minimum_grade ?? '');
  const [editing, setEditing] = useState(false);
  return <>
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      <AppText variant="heading" selectable style={{ color: check.status === 'met' ? colors.success : colors.ink }}>{check.status === 'met' ? 'Requirements met' : check.status === 'not_met' ? 'Requirements not met' : 'Unable to confirm yet'}</AppText>
      <AppText selectable>{check.reason ?? (check.status === 'unknown' ? 'Reviewed rules or grade evidence are missing.' : 'Based on your saved rule and completed courses.')}</AppText>
      {check.missing?.length ? <AppText selectable>Missing: {check.missing.map(courseLabel).join(', ')}</AppText> : null}
      {check.rule?.any_of?.length ? <AppText>One-of requirement: {check.any_of_satisfied ? 'Satisfied' : 'Not satisfied'}</AppText> : null}
      {check.grade_evidence_incomplete && <AppText>Some completed courses do not have enough grade evidence. Add their grades to confirm the requirement.</AppText>}
      {check.rule?.all_of?.length ? <AppText>All required: {check.rule.all_of.map(courseLabel).join(', ')}</AppText> : null}
      {check.rule?.any_of?.length ? <AppText>At least one: {check.rule.any_of.map(courseLabel).join(', ')}</AppText> : null}
      {check.rule?.minimum_grade && <AppText>Minimum grade: {check.rule.minimum_grade}</AppText>}
      {check.rule?.passage_ids?.map(id => <PassageLink key={id} id={id} />)}
    </Card>
    <Button title="Manage completed courses" variant="ghost" onPress={() => router.push('/academic/completed')} />
    <Button title={editing ? 'Hide rule editor' : 'Review or enter prerequisite rule'} variant="secondary" onPress={() => setEditing(!editing)} />
    {editing && <Section title="Reviewed prerequisite rule">
      <AppText style={{ marginBottom: spacing.md }}>Enter the requirements from the course catalog or syllabus. Leave both lists empty only when the course has no prerequisites.</AppText>
      <TextField label="All required courses (comma-separated)" value={all} onChangeText={setAll} placeholder="CAS CS 111, CAS MA 123" />
      <TextField label="At least one of these courses (comma-separated)" value={any} onChangeText={setAny} placeholder="CAS CS 112, CAS CS 210" />
      <TextField label="Minimum letter grade (optional)" value={grade} onChangeText={setGrade} placeholder="C" autoCapitalize="characters" />
      <InlineError message={save.error ? errorMessage(save.error) : ''} />
      <Button title={save.isPending ? 'Saving…' : 'Save reviewed rule'} disabled={save.isPending} onPress={() => save.mutate({ path: `/academic/courses/${encodeURIComponent(check.course_id)}/prerequisites`, body: { version, rule: { ...check.rule, course_id: check.course_id, all_of: splitCodes(all), any_of: splitCodes(any), minimum_grade: grade.trim() || null } } }, { onSuccess: () => { setEditing(false); showToast('Prerequisite rule saved'); } })} />
    </Section>}
  </>;
}

type CourseDraft = { course_code: string; grade: string; credits: string };
export function CompletedCoursesScreen() {
  const local = useAcademicLocal<CompletedCourse[]>('completed-courses', []);
  const version = useUserQuery(dashboardQuery(campusToday()));
  return <Screen><QueryView query={local}>{data => <CompletedForm initial={data} version={version.data?.version} saveLocal={local.save} />}</QueryView>{version.error && <InlineError message={errorMessage(version.error)} />}</Screen>;
}
function CompletedForm({ initial, version, saveLocal }: { initial: CompletedCourse[]; version?: number; saveLocal: (v: CompletedCourse[]) => Promise<void> }) {
  const [courses, setCourses] = useState<CourseDraft[]>(initial.map(c => ({ course_code: c.course_code, grade: c.grade ?? '', credits: c.credits == null ? '' : String(c.credits) })));
  const save = useAcademicWrite<CompletedCourse[]>();
  const valid = courses.every(c => c.course_code.trim() && (!c.credits.trim() || isNumberIn(c.credits, .01, 100))) && new Set(courses.map(c => c.course_code.trim().toUpperCase())).size === courses.length;
  const change = (index: number, key: keyof CourseDraft, value: string) => setCourses(prev => prev.map((c,i) => i === index ? { ...c, [key]: value } : c));
  return <>
    <AppText style={{ marginBottom: spacing.lg }}>List all completed courses to use as prerequisite evidence. Saving replaces the full list. This form starts with the last list saved on this device; include any courses added elsewhere.</AppText>
    {!courses.length && <EmptyState title="No courses listed on this device" subtitle="Add every completed course you want included in prerequisite checks." />}
    {courses.map((course, index) => <Card key={index} style={{ padding: spacing.lg, marginBottom: spacing.md }}>
      <TextField label="Course code" value={course.course_code} onChangeText={v => change(index, 'course_code', v)} placeholder="CAS CS 111" autoCapitalize="characters" />
      <TextField label="Letter grade (optional)" value={course.grade} onChangeText={v => change(index, 'grade', v)} placeholder="A-" autoCapitalize="characters" />
      <TextField label="Credits (optional)" value={course.credits} onChangeText={v => change(index, 'credits', v)} keyboardType="decimal-pad" />
      <Button title="Remove course" variant="ghost" onPress={() => setCourses(prev => prev.filter((_,i) => i !== index))} />
    </Card>)}
    <Button title="Add completed course" variant="secondary" disabled={save.isPending} onPress={() => setCourses(prev => [...prev, { course_code: '', grade: '', credits: '' }])} />
    <InlineError message={save.error ? errorMessage(save.error) : ''} />
    <Button title={save.isPending ? 'Saving…' : 'Replace completed-course list'} disabled={save.isPending || !valid || version == null} style={{ marginTop: spacing.lg }} onPress={() => {
      const records = courses.map(c => ({ course_code: c.course_code.trim().toUpperCase(), grade: c.grade.trim() || null, credits: c.credits.trim() ? Number(c.credits) : null }));
      save.mutate({ path: '/academic/completed-courses', body: { version, courses: records } }, { onSuccess: async () => { await saveLocal(records).catch(() => showToast('Saved on server; device copy could not refresh')); showToast('Completed courses saved'); router.back(); } });
    }} />
  </>;
}
