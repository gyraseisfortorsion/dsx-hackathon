import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DemoBanner, InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { Screen } from '@/components/screen';
import { TimeField } from '@/components/time-field';
import { SHIFT_DATES } from '@/data/services';
import { useWorkStore } from '@/stores/work-store';
import { colors, spacing } from '@/theme';
import { successFeedback } from '@/utils/haptics';
import { calculateHours, validateShift, type ShiftDraft } from '@/utils/shift';

type ShiftDate = (typeof SHIFT_DATES)[number];

const NEW_SHIFT: ShiftDraft = { date: 'Oct 18', start: '13:00', end: '16:00', breakMin: '0', note: '' };

export function ShiftFormScreen({ shiftId }: { shiftId?: string }) {
  const shifts = useWorkStore((state) => state.shifts);
  const saveShift = useWorkStore((state) => state.saveShift);
  const existing = shifts.find((shift) => shift.id === shiftId);

  const [draft, setDraft] = useState<ShiftDraft>(() =>
    existing ? { ...existing, breakMin: String(existing.breakMin) } : NEW_SHIFT,
  );
  const [error, setError] = useState('');

  const update = (change: Partial<ShiftDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setError('');
  };

  const save = () => {
    const result = validateShift(draft, shifts.filter((shift) => shift.id !== existing?.id));
    if (!result.ok) return setError(result.error);
    saveShift(result.shift, existing?.id);
    successFeedback();
    router.back();
  };

  const hours = calculateHours(draft.start, draft.end, Number(draft.breakMin) || 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit shift' : 'Add shift' }} />
      <DemoBanner title="Demo time entry">Enter only hours actually worked. BU One never invents time.</DemoBanner>

      <ChoiceField<ShiftDate> label="Date" options={SHIFT_DATES} value={draft.date as ShiftDate} onChange={(date) => update({ date })} />

      <View style={{ gap: 6, marginBottom: 14 }}>
        <AppText variant="caption" style={{ color: colors.label, fontWeight: '600' }}>
          Job
        </AppText>
        <AppText variant="headline" style={{ fontWeight: '500' }}>
          Student Assistant · BU Spark! · Demo
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
      <TextField label="Optional note" value={draft.note} multiline onChangeText={(note) => update({ note })} placeholder="Visible to your demo supervisor." />

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
      <Button title="Save demo shift" onPress={save} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </Screen>
  );
}
