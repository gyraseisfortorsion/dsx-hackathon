import { useState } from 'react';
import { View } from 'react-native';
import type { SyllabusCandidate } from '@/api/academic';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { InlineError } from '@/components/feedback';
import { TextField } from '@/components/form';
import { Card } from '@/components/section';
import { spacing } from '@/theme';
import { humanLabel, isDate, isNumberIn, splitCodes } from '@/utils/academic';
import { toCampusIso } from '@/utils/campus-time';
import { campusDueAt } from '@/utils/syllabus';

const labels: Record<string, string> = { text: 'Policy text', all_of: 'All required courses', any_of: 'At least one of these courses', minimum_grade: 'Minimum letter grade', drop_lowest: 'Lowest scores to drop', mode: 'Calculation method', minimum: 'Minimum percentage' };

export function SyllabusItemEditor({ candidate, value, onSave, onCancel }: { candidate: SyllabusCandidate; value: Record<string, unknown>; onSave: (value: Record<string, unknown>) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const due = typeof value.due_at === 'string' ? toCampusIso(value.due_at) : '';
  const [date, setDate] = useState(due.slice(0,10) || String(value.due_on ?? ''));
  const [time, setTime] = useState(due.slice(11,16) || '23:59');
  const [points, setPoints] = useState(String(value.points_possible ?? ''));
  const assessment = candidate.kind === 'assessment';
  const valid = !assessment || (String(draft.title ?? '').trim() && isDate(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && (!points.trim() || isNumberIn(points, .01, 1000000)));
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="headline">Correct this detail</AppText>
    {assessment ? <>
      <TextField label="Assignment or exam title" value={String(draft.title ?? '')} onChangeText={title => setDraft(prev => ({ ...prev, title }))} />
      <TextField label="Due date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} placeholder="2026-11-02" invalid={!isDate(date)} />
      <TextField label="Due time in Boston (24-hour HH:MM)" value={time} onChangeText={setTime} maxLength={5} placeholder="17:00" keyboardType="numbers-and-punctuation" />
      <TextField label="Points possible (optional)" value={points} onChangeText={setPoints} keyboardType="decimal-pad" />
    </> : <EditableValue value={draft} onChange={setDraft} />}
    {!valid && <InlineError message="Check the title, date, time, and points before approving." />}
    <Button title="Save correction and approve" disabled={!valid} onPress={() => onSave(assessment ? { ...draft, title: String(draft.title).trim(), due_at: campusDueAt(date, time), ...(points.trim() ? { points_possible: Number(points) } : {}) } : draft)} />
    <Button title="Cancel editing" variant="ghost" onPress={onCancel} />
  </View>;
}

function EditableValue({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  return <View>{Object.entries(value).filter(([key]) => !['id', 'course_id', 'syllabus_id', 'passage_ids'].includes(key)).map(([key, item]) => {
    const label = labels[key] ?? humanLabel(key);
    if (Array.isArray(item) && item.some(v => v && typeof v === 'object')) return <View key={key}><AppText variant="headline">{label}</AppText>{item.map((entry,index) => <Card key={index} style={{ padding: spacing.md, marginVertical: spacing.sm }}><EditableValue value={entry} onChange={next => onChange({ ...value, [key]: item.map((v,i) => i === index ? next : v) })} /></Card>)}</View>;
    if (item && typeof item === 'object') return <EditableValue key={key} value={item as Record<string, unknown>} onChange={next => onChange({ ...value, [key]: next })} />;
    if (typeof item === 'boolean') return null;
    return <TextField key={key} label={Array.isArray(item) ? `${label} (comma-separated)` : label} value={Array.isArray(item) ? item.join(', ') : item == null ? '' : String(item)} multiline={key === 'text'} onChangeText={next => onChange({ ...value, [key]: Array.isArray(item) ? splitCodes(next) : typeof item === 'number' ? next.trim() && Number.isFinite(Number(next)) ? Number(next) : next : next })} />;
  })}</View>;
}
