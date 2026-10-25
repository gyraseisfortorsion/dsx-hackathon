import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { academicGradesQuery, dashboardQuery, useAcademicWrite, type AcademicAssessment, type AcademicTask } from '@/api/academic';
import { useRememberedTasks } from '@/api/academic-local';
import { errorMessage } from '@/api/client';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { spacing } from '@/theme';
import { isNumberIn } from '@/utils/academic';
import { campusToday, formatShortDate } from '@/utils/campus-time';
import { showToast } from '@/stores/toast-store';
import { PassageLink } from './shared';

export function AcademicAssessmentScreen({ id, courseId }: { id: string; courseId: string }) {
  const query = useUserQuery(academicGradesQuery(courseId));
  return <Screen onRefresh={query.refetch}><QueryView query={query}>{snapshot => {
    const item = snapshot.data.assessments.find(a => a.id === id);
    return item ? <AssessmentForm item={item} version={snapshot.version} /> : <NotFound what="assessment" />;
  }}</QueryView></Screen>;
}
function AssessmentForm({ item, version }: { item: AcademicAssessment; version: number }) {
  const save = useAcademicWrite<AcademicAssessment>();
  const breakdown = useAcademicWrite<{ tasks: AcademicTask[] } | AcademicTask[]>();
  const remembered = useRememberedTasks();
  const [status, setStatus] = useState(item.status);
  const [score, setScore] = useState(item.score == null ? '' : String(item.score));
  const [possible, setPossible] = useState(item.points_possible == null ? '' : String(item.points_possible));
  const [category, setCategory] = useState(item.category ?? '');
  const [minutes, setMinutes] = useState('120');
  const [localError, setLocalError] = useState('');
  const busy = save.isPending || breakdown.isPending;
  const tasks = (remembered.data ?? []).filter(task => task.assessment_id === item.id);
  return <>
    <Stack.Screen options={{ title: 'Assessment' }} />
    <AppText variant="heading" selectable>{item.title}</AppText>
    <AppText variant="caption" style={{ marginTop: spacing.sm }}>{item.due_at || item.due_on ? `Due ${formatShortDate((item.due_at ?? item.due_on!).slice(0, 10))}` : 'Due date not provided'}</AppText>
    <Section title="Personal score record">
      <ChoiceField label="Status" options={['upcoming', 'submitted', 'graded', 'missing'] as const} value={status} onChange={setStatus} />
      <TextField label="Score" value={score} onChangeText={setScore} keyboardType="decimal-pad" placeholder="Not graded yet" />
      <TextField label="Points possible" value={possible} onChangeText={setPossible} keyboardType="decimal-pad" />
      <TextField label="Grading category" value={category} onChangeText={setCategory} placeholder="Homework (optional)" />
      <Button title={save.isPending ? 'Saving…' : 'Save score record'} disabled={busy || !isNumberIn(possible, .01, 1000000) || (score.trim() !== '' && !isNumberIn(score, 0, 1000000)) || (status === 'graded' && !score.trim())} onPress={() => save.mutate({ path: `/academic/assessments/${encodeURIComponent(item.id)}/score`, body: { version, status, score: score.trim() ? Number(score) : null, points_possible: Number(possible), category: category.trim() || null } }, { onSuccess: () => showToast('Score record saved') })} />
    </Section>
    <Section title="Break work into tasks">
      <AppText style={{ marginBottom: spacing.md }}>Create manageable study tasks, then plan them around your availability.</AppText>
      <TextField label="Estimated total minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Button title={breakdown.isPending ? 'Creating tasks…' : tasks.length ? 'Refresh task breakdown' : 'Create task breakdown'} variant="secondary" disabled={busy || remembered.data === undefined || !isNumberIn(minutes, 15, 10000, true)} onPress={() => breakdown.mutate({ path: `/academic/assessments/${encodeURIComponent(item.id)}/breakdown`, method: 'POST', body: { version, total_minutes: Number(minutes) } }, { onSuccess: async result => {
        const data = result.data;
        const next = Array.isArray(data) ? data : data.tasks;
        if (!Array.isArray(next)) { setLocalError('The API did not return a task list. Refresh this assessment before retrying.'); return; }
        try { await remembered.save([...(remembered.data ?? []).filter(task => task.assessment_id !== item.id), ...next.map(task => ({ ...task, assessment_id: item.id }))]); showToast('Study tasks ready'); }
        catch { setLocalError('Tasks were created, but this device could not save their shortcuts. Keep this screen open and retry loading.'); }
      } })} />
      {tasks.map(task => <ListRow key={task.id} title={task.title} subtitle={`${task.status} · ${task.remaining_minutes} min remaining`} onPress={() => router.push({ pathname: '/academic/task/[id]', params: { id: task.id } })} />)}
    </Section>
    {item.passage_ids?.length ? <Section title="Sources">{item.passage_ids.map(id => <PassageLink key={id} id={id} />)}</Section> : null}
    <InlineError message={localError || (save.error || breakdown.error ? errorMessage(save.error ?? breakdown.error) : '')} />
  </>;
}

export function AcademicTaskScreen({ id }: { id: string }) {
  const tasks = useRememberedTasks();
  // Any academic snapshot carries the current academic version.
  const courseId = tasks.data?.find(task => task.id === id)?.course_id;
  return <Screen><QueryView query={tasks}>{items => {
    const item = items.find(task => task.id === id);
    return item ? <TaskForm item={item} courseId={courseId} saveLocal={async updated => tasks.save(items.map(t => t.id === id ? updated : t))} /> : <NotFound what="task on this device" />;
  }}</QueryView></Screen>;
}
function TaskForm({ item, saveLocal }: { item: AcademicTask; courseId?: string; saveLocal: (task: AcademicTask) => Promise<void> }) {
  const version = useUserQuery(dashboardQuery(campusToday()));
  const save = useAcademicWrite<AcademicTask>();
  const [title, setTitle] = useState(item.title);
  const [minutes, setMinutes] = useState(String(item.remaining_minutes));
  const [status, setStatus] = useState(item.status);
  return <View>
    <TextField label="Task title" value={title} onChangeText={setTitle} />
    <ChoiceField label="Progress" options={['todo', 'doing', 'done'] as const} value={status} onChange={setStatus} />
    <TextField label="Minutes remaining" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
    <InlineError message={save.error ? errorMessage(save.error) : ''} />
    <QueryView query={version}>{snapshot => <Button title={save.isPending ? 'Saving…' : 'Save task'} disabled={save.isPending || !title.trim() || !isNumberIn(minutes, 0, 10000, true)} onPress={() => save.mutate({ path: `/academic/tasks/${encodeURIComponent(item.id)}`, body: { version: snapshot.version, title: title.trim(), status, remaining_minutes: status === 'done' ? 0 : Number(minutes) } }, { onSuccess: async result => {
      await saveLocal({ ...item, ...result.data }).catch(() => showToast('Saved on server; local task shortcut could not refresh'));
      router.back();
    } })} />}</QueryView>
  </View>;
}
