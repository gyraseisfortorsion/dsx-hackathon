import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { academicCalendarQuery, dashboardQuery, workloadQuery, useAcademicWrite, type AvailabilityWindow, type PlanPreview } from '@/api/academic';
import { useAcademicLocal, useRememberedTasks } from '@/api/academic-local';
import { errorMessage } from '@/api/client';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState, InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { spacing } from '@/theme';
import { isDate, isNumberIn } from '@/utils/academic';
import { addDays, campusToday, daysBetween, formatShortDate, formatTime, toCampusIso } from '@/utils/campus-time';
import { showToast } from '@/stores/toast-store';
import { AcademicAssessmentRow, DateRangeFields } from './shared';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Availability = { windows: AvailabilityWindow[]; max_daily_minutes: number };
export function AvailabilityScreen() {
  const local = useAcademicLocal<Availability>('availability', { windows: [], max_daily_minutes: 240 });
  const version = useUserQuery(dashboardQuery(campusToday()));
  return <Screen><QueryView query={local}>{initial => <AvailabilityForm initial={initial} version={version.data?.version} saveLocal={local.save} />}</QueryView>{version.error && <InlineError message={errorMessage(version.error)} />}</Screen>;
}
function AvailabilityForm({ initial, version, saveLocal }: { initial: Availability; version?: number; saveLocal: (value: Availability) => Promise<void> }) {
  const save = useAcademicWrite<Availability>();
  const [windows, setWindows] = useState(initial.windows);
  const [maximum, setMaximum] = useState(String(initial.max_daily_minutes));
  const timeValid = (v: string) => /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(v);
  const overlap = windows.some((w,i) => windows.some((other,j) => j > i && other.weekday === w.weekday && w.starts_at < other.ends_at && other.starts_at < w.ends_at));
  const valid = isNumberIn(maximum, 15, 1440, true) && windows.every(w => timeValid(w.starts_at) && timeValid(w.ends_at) && w.starts_at < w.ends_at) && !overlap;
  const change = (index: number, patch: Partial<AvailabilityWindow>) => setWindows(prev => prev.map((w,i) => i === index ? { ...w, ...patch } : w));
  return <>
    <AppText style={{ marginBottom: spacing.lg }}>Choose recurring study windows in Boston time. The planner works around your classes. Saving replaces all windows, starting from the last copy saved on this device.</AppText>
    <TextField label="Maximum study minutes per day" value={maximum} onChangeText={setMaximum} keyboardType="number-pad" />
    {!windows.length && <EmptyState title="No study windows" subtitle="Add a window so the planner can find time for your tasks." />}
    {windows.map((window, index) => <Card key={index} style={{ padding: spacing.lg, marginBottom: spacing.md }}>
      <ChoiceField label="Day of week" options={WEEKDAYS} value={WEEKDAYS[window.weekday]} onChange={day => change(index, { weekday: WEEKDAYS.indexOf(day) })} />
      <TextField label="Start time (24-hour HH:MM)" value={window.starts_at.slice(0,5)} onChangeText={v => change(index, { starts_at: v })} placeholder="16:00" maxLength={5} keyboardType="numbers-and-punctuation" />
      <TextField label="End time (24-hour HH:MM)" value={window.ends_at.slice(0,5)} onChangeText={v => change(index, { ends_at: v })} placeholder="18:00" maxLength={5} keyboardType="numbers-and-punctuation" />
      <Button title="Remove window" variant="ghost" onPress={() => setWindows(prev => prev.filter((_,i) => i !== index))} />
    </Card>)}
    <Button title="Add study window" variant="secondary" disabled={save.isPending} onPress={() => setWindows(prev => [...prev, { weekday: 0, starts_at: '16:00', ends_at: '18:00' }])} />
    <InlineError message={overlap ? 'Study windows on the same day must not overlap.' : save.error ? errorMessage(save.error) : ''} />
    <Button title={save.isPending ? 'Saving…' : 'Save all study windows'} disabled={save.isPending || version == null || !valid} style={{ marginTop: spacing.md }} onPress={() => {
      const value = { max_daily_minutes: Number(maximum), windows: windows.map(w => ({ ...w, starts_at: w.starts_at.slice(0,5), ends_at: w.ends_at.slice(0,5) })) };
      save.mutate({ path: '/academic/availability', body: { version, ...value } }, { onSuccess: async () => { await saveLocal(value).catch(() => showToast('Saved on server; device copy could not refresh')); showToast('Study availability saved'); router.back(); } });
    }} />
  </>;
}

export function AcademicPlannerScreen() {
  const [from, setFrom] = useState(campusToday());
  const [to, setTo] = useState(addDays(campusToday(), 6));
  const [range, setRange] = useState({ from, to });
  const [mode, setMode] = useState('Weekly plan');
  const [minutes, setMinutes] = useState('60');
  const [previewSignature, setPreviewSignature] = useState('');
  const calendar = useUserQuery(academicCalendarQuery(range.from, range.to));
  const workload = useUserQuery(workloadQuery(range.from, range.to));
  const tasks = useRememberedTasks();
  const preview = useAcademicWrite<PlanPreview>();
  const commit = useAcademicWrite<unknown>();
  const valid = isDate(from) && isDate(to) && to >= from && daysBetween(from, to) <= 90;
  const signature = JSON.stringify({ from, to, mode, minutes });
  const plan = preview.data?.data;
  const stale = previewSignature !== signature || !plan || plan.input_version !== workload.data?.version;
  const taskTitle = (id: string) => tasks.data?.find(t => t.id === id)?.title ?? 'Study task';
  return <Screen onRefresh={() => Promise.all([calendar.refetch(), workload.refetch()])}>
    <AppText style={{ marginBottom: spacing.lg }}>Turn tasks into a realistic schedule. Preview every block before saving. Set your availability and create task breakdowns first.</AppText>
    <Button title="Set study availability" variant="secondary" onPress={() => router.push('/academic/availability')} style={{ marginBottom: spacing.lg }} />
    <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
    {!valid && <InlineError message="Choose valid dates, up to 90 days apart." />}
    <Button title="Show calendar and workload" variant="secondary" disabled={!valid || calendar.isFetching || workload.isFetching} onPress={() => setRange({ from, to })} />
    <Section title="Workload"><QueryView query={workload}>{({ data }) => <>
      <AppText variant="caption">{formatShortDate(range.from)} – {formatShortDate(range.to)}</AppText>
      {data.overloaded && <InlineError message="Some work exceeds your available time. Try a recovery plan or adjust your availability." />}
      {data.days.map(day => <ListRow key={day.date} title={formatShortDate(day.date)} subtitle={`${day.required_minutes} min needed · ${day.available_minutes} min available${day.cumulative_deficit_minutes ? ` · ${day.cumulative_deficit_minutes} min behind` : ''}`} accessory="none" />)}
    </>}</QueryView></Section>
    <Section title="Build a plan">
      <ChoiceField label="Planning mode" options={['Weekly plan', 'Recovery plan']} value={mode} onChange={setMode} />
      <TextField label="Minutes per study block" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Button title={preview.isPending ? 'Building preview…' : 'Preview study plan'} disabled={!valid || !isNumberIn(minutes, 15, 240, true) || preview.isPending || commit.isPending} onPress={() => {
        setRange({ from, to });
        preview.mutate({ path: mode === 'Recovery plan' ? '/academic/recovery/preview' : '/academic/plans/preview', method: 'POST', body: { starts_on: from, ends_on: to, block_minutes: Number(minutes) } }, { onSuccess: () => setPreviewSignature(signature) });
      }} />
      <InlineError message={preview.error || commit.error ? errorMessage(preview.error ?? commit.error) : ''} />
    </Section>
    {plan && <Section title="Plan preview">
      {stale ? <InlineError message="Inputs or academic data have changed. Generate a fresh preview before saving." /> : <>
        {!plan.blocks.length && <EmptyState title="No new blocks to schedule" subtitle="Create tasks from an assessment and add study availability, then preview again." />}
        {plan.blocks.map(block => <ListRow key={block.id} title={taskTitle(block.task_id)} subtitle={`${formatShortDate(toCampusIso(block.starts_at).slice(0,10))} · ${formatTime(toCampusIso(block.starts_at))}–${formatTime(toCampusIso(block.ends_at))}${block.locked ? ' · Locked' : ''}`} accessory="none" />)}
        {plan.unscheduled.length > 0 && <InlineError message={`${plan.unscheduled.length} tasks could not be fully scheduled. Review availability or deadlines before saving a partial plan.`} />}
        <Button title={commit.isPending ? 'Saving plan…' : plan.feasible ? 'Save this plan' : 'Save partial plan'} disabled={commit.isPending || !plan.blocks.length} onPress={() => commit.mutate({ path: '/academic/plans/commit', method: 'POST', body: { version: workload.data!.version, input_version: plan.input_version, blocks: plan.blocks } }, { onSuccess: () => { preview.reset(); showToast('Study plan saved'); } })} />
      </>}
    </Section>}
    <Section title="Calendar"><QueryView query={calendar}>{({ data }) => <>
      {data.study_blocks.length > 0 && <AppText variant="headline">Saved study time</AppText>}
      {data.study_blocks.map(block => <ListRow key={block.id} title={taskTitle(block.task_id)} subtitle={`${formatShortDate(toCampusIso(block.starts_at).slice(0,10))} · ${formatTime(toCampusIso(block.starts_at))}–${formatTime(toCampusIso(block.ends_at))}`} onPress={tasks.data?.some(t => t.id === block.task_id) ? () => router.push({ pathname: '/academic/task/[id]', params: { id: block.task_id } }) : undefined} accessory="none" />)}
      {data.assessments.map(item => <AcademicAssessmentRow key={item.id} item={item} />)}
      {data.classes.map(item => <ListRow key={item.id} title={item.title} subtitle={`${formatShortDate(toCampusIso(item.starts_at).slice(0,10))} · ${formatTime(toCampusIso(item.starts_at))} · ${item.location ?? 'Room not listed'}`} accessory="none" />)}
      {!data.study_blocks.length && !data.assessments.length && !data.classes.length && <EmptyState title="Nothing scheduled in this date range" />}
    </>}</QueryView></Section>
  </Screen>;
}
