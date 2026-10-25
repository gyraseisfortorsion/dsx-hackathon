import { router } from 'expo-router';
import { View } from 'react-native';
import type { AcademicAssessment } from '@/api/academic';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { TextField } from '@/components/form';
import { colors, spacing } from '@/theme';
import { formatShortDate, formatTime, toCampusIso } from '@/utils/campus-time';
import { humanLabel, isDate } from '@/utils/academic';

export function AcademicAssessmentRow({ item }: { item: AcademicAssessment }) {
  const due = item.due_at ? toCampusIso(item.due_at) : item.due_on;
  return <ListRow title={item.title} subtitle={[humanLabel(item.status), due ? `Due ${formatShortDate(due.slice(0, 10))}${item.due_at ? ` · ${formatTime(due)}` : ''}` : 'Due date not provided'].join(' · ')} value={item.score == null ? undefined : `${item.score}/${item.points_possible ?? '—'}`} onPress={() => router.push({ pathname: '/academic/assessment/[id]', params: { id: item.id, courseId: item.course_id } })} />;
}

export function DateRangeFields({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return <View><AppText variant="caption" style={{ marginBottom: spacing.md }}>All dates and study times use Boston time.</AppText><TextField label="Start date (YYYY-MM-DD)" value={from} onChangeText={onFrom} autoCapitalize="none" maxLength={10} invalid={!isDate(from)} /><TextField label="End date (YYYY-MM-DD)" value={to} onChangeText={onTo} autoCapitalize="none" maxLength={10} invalid={!isDate(to) || to < from} /></View>;
}

export function PassageLink({ id, label = 'View source passage' }: { id: string; label?: string }) {
  return <Button title={label} variant="ghost" onPress={() => router.push({ pathname: '/academic/passage/[id]', params: { id } })} />;
}

/** Readable fallback for server-owned extraction fields, never a raw JSON dump. */
export function ValueSummary({ value }: { value: unknown }) {
  if (value == null) return null;
  if (Array.isArray(value)) return <View style={{ gap: spacing.sm }}>{value.map((item, i) => <ValueSummary key={i} value={item} />)}</View>;
  if (typeof value === 'object') return <View style={{ gap: spacing.sm }}>{Object.entries(value).filter(([key]) => !['id', 'passage_ids', 'syllabus_id', 'course_id'].includes(key)).map(([key, item]) => <View key={key} style={{ gap: 2 }}><AppText variant="caption">{humanLabel(key)}</AppText><ValueSummary value={item} /></View>)}</View>;
  return <AppText selectable style={{ color: colors.ink }}>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</AppText>;
}
