import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { clockTime, currentTimesheet, useServiceWrite, useWork, type Shift } from '@/api/services';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DemoBanner, InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { TimeField } from '@/components/time-field';
import { colors, spacing } from '@/theme';
import { addDays } from '@/utils/campus-time';
import { successFeedback } from '@/utils/haptics';
import { calculateHours, validateShift, type ShiftDraft } from '@/utils/shift';

const datesIn = (start: string, end: string) => {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
};

export function ShiftFormScreen({ shiftId, sheetId }: { shiftId?: string; sheetId?: string }) {
  const work = useWork();
  return (
    <Screen onRefresh={work.refetch}>
      <QueryView query={work} loadingLabel="Loading timesheet…">
        {(snapshot) => {
          const sheet = snapshot.data.timesheets.find((item) => item.id === sheetId) ?? currentTimesheet(snapshot.data.timesheets);
          if (!sheet) return <InlineError message="No draft timesheet is available." />;
          return <ShiftEditor jobTitle={`${snapshot.data.job.title} · ${snapshot.data.job.department}`} sheetId={sheet.id} dates={datesIn(sheet.starts_on, sheet.ends_on)} existing={sheet.shifts.find((shift) => shift.id === shiftId)} others={sheet.shifts.filter((shift) => shift.id !== shiftId)} />;
        }}
      </QueryView>
    </Screen>
  );
}

function ShiftEditor({
  jobTitle,
  sheetId,
  dates,
  existing,
  others,
}: {
  jobTitle: string;
  sheetId: string;
  dates: string[];
  existing?: Shift;
  others: Shift[];
}) {
  const save = useServiceWrite();
  const [draft, setDraft] = useState<ShiftDraft>(() =>
    existing
      ? { date: existing.date, start: clockTime(existing.start), end: clockTime(existing.end), breakMin: String(existing.break_minutes), note: existing.note }
      : { date: dates[0] ?? '', start: '13:00', end: '16:00', breakMin: '0', note: '' },
  );
  const [error, setError] = useState('');

  const localOthers = useMemo(
    () => others.map((shift) => ({ id: shift.id, date: shift.date, start: clockTime(shift.start), end: clockTime(shift.end), breakMin: shift.break_minutes, hours: shift.hours, note: shift.note })),
    [others],
  );

  const update = (change: Partial<ShiftDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setError('');
  };

  const submit = () => {
    const result = validateShift(draft, localOthers);
    if (!result.ok) return setError(result.error);
    save.mutate(
      {
        path: existing
          ? `/work/timesheets/${encodeURIComponent(sheetId)}/shifts/${encodeURIComponent(existing.id)}`
          : `/work/timesheets/${encodeURIComponent(sheetId)}/shifts`,
        method: existing ? 'PUT' : 'POST',
        body: {
          date: result.shift.date,
          start: `${result.shift.start}:00`,
          end: `${result.shift.end}:00`,
          break_minutes: result.shift.breakMin,
          note: result.shift.note,
        },
      },
      {
        onSuccess: () => {
          successFeedback();
          router.back();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const hours = calculateHours(draft.start, draft.end, Number(draft.breakMin) || 0);

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit shift' : 'Add shift' }} />
      <DemoBanner title="Time entry">Enter only hours actually worked. BU One never invents time.</DemoBanner>

      <ChoiceField label="Date" options={dates} value={draft.date} onChange={(date) => update({ date })} />

      <View style={{ gap: 6, marginBottom: 14 }}>
        <AppText variant="caption" style={{ color: colors.label, fontWeight: '600' }}>
          Job
        </AppText>
        <AppText variant="headline" style={{ fontWeight: '500' }}>
          {jobTitle}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TimeField label="Start" value={draft.start} onChange={(start) => update({ start })} />
        <TimeField label="End" value={draft.end} onChange={(end) => update({ end })} />
      </View>

      <TextField
        label="Unpaid break · minutes"
        value={draft.breakMin}
        keyboardType="number-pad"
        onChangeText={(value) => update({ breakMin: value.replace(/[^0-9]/g, '') })}
      />
      <TextField label="Optional note" value={draft.note} multiline onChangeText={(note) => update({ note })} placeholder="Visible to your supervisor." />

      <View
        style={{
          minHeight: 50,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.separator,
          marginBottom: spacing.lg,
        }}>
        <AppText>Calculated total</AppText>
        <AppText variant="headline" accessibilityLiveRegion="polite" style={{ fontVariant: ['tabular-nums'] }}>
          {hours.toFixed(2)} hours
        </AppText>
      </View>

      <InlineError message={error} />
      <Button title={save.isPending ? 'Saving…' : 'Save shift'} disabled={save.isPending} onPress={submit} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </>
  );
}
