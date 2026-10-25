import type { SyllabusCandidate } from '@/api/academic';
import { campusMidnight, formatShortDate, formatTime, toCampusIso } from './campus-time';

// Base64 expands PDFs by ~1/3. Stay below the deployed API's request-body limit.
export const MAX_SYLLABUS_BYTES = 3 * 1024 * 1024;
export const syllabusStatus = (status: string) => ({ review: 'Ready to review', committed: 'Added to academics', pending: 'Needs review', accepted: 'Approved', rejected: 'Skipped' }[status] ?? 'Ready to review');
export const itemKindLabel = (kind: string) => ({ assessment: 'Assignment or exam', late_policy: 'Late-work policy', attendance: 'Attendance policy', grading: 'Grading rules', prerequisite: 'Prerequisites' }[kind] ?? 'Syllabus detail');
export function dueLabel(value: unknown) {
  if (typeof value !== 'string' || !value) return 'No due date found';
  const date = toCampusIso(value);
  if (Number.isNaN(Date.parse(date))) return 'Check the due date';
  return `${formatShortDate(date.slice(0, 10))} at ${formatTime(date)} · Boston time`;
}
export function campusDueAt(date: string, time: string) {
  return `${date}T${time}:00${campusMidnight(date).slice(19)}`;
}
export function candidateSummary(candidate: SyllabusCandidate, value = candidate.value): string {
  if (candidate.kind === 'assessment') return dueLabel(value.due_at ?? value.due_on);
  if (candidate.kind === 'grading') {
    const categories = Array.isArray(value.categories) ? value.categories as { name: string; weight: string | number }[] : [];
    return value.mode === 'weighted' ? categories.map(c => `${c.name}: ${c.weight}%`).join(' · ') : 'Calculated from total points';
  }
  if (candidate.kind === 'prerequisite') {
    const all = Array.isArray(value.all_of) ? value.all_of : [];
    const any = Array.isArray(value.any_of) ? value.any_of : [];
    return [all.length ? `All required: ${all.join(', ')}` : '', any.length ? `At least one: ${any.join(', ')}` : '', value.minimum_grade ? `Minimum grade: ${value.minimum_grade}` : ''].filter(Boolean).join('\n') || 'No prerequisite courses found';
  }
  return typeof value.text === 'string' ? value.text : 'Check this detail against the source.';
}
export function reviewProgress(candidates: SyllabusCandidate[], decisions: Record<string, { status: string }>) {
  const approved = candidates.filter(c => (decisions[c.id]?.status ?? c.status) === 'accepted').length;
  const skipped = candidates.filter(c => (decisions[c.id]?.status ?? c.status) === 'rejected').length;
  return { approved, skipped, remaining: candidates.length - approved - skipped };
}
