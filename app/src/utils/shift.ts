import type { Shift } from '@/types';

export type ShiftDraft = Pick<Shift, 'date' | 'start' | 'end' | 'note'> & { breakMin: string };

/** "13:30" → 810 */
export function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 810 → "13:30" */
export function fromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calculateHours(start: string, end: string, breakMin: number): number {
  const value = (toMinutes(end) - toMinutes(start) - breakMin) / 60;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

export function totalHours(shifts: Pick<Shift, 'hours'>[]): number {
  return shifts.reduce((sum, item) => sum + item.hours, 0);
}

type ValidationResult = { ok: true; shift: Omit<Shift, 'id'> } | { ok: false; error: string };

/** Validates a draft against the other shifts in the same week. */
export function validateShift(draft: ShiftDraft, others: Shift[]): ValidationResult {
  if (!draft.date || !draft.start || !draft.end) {
    return { ok: false, error: 'Date, start time, and end time are required.' };
  }
  const start = toMinutes(draft.start);
  const end = toMinutes(draft.end);
  const breakMin = Number(draft.breakMin) || 0;

  if (end <= start) return { ok: false, error: 'End time must be after start time.' };
  if (breakMin < 0) return { ok: false, error: 'Unpaid break cannot be negative.' };
  if (breakMin >= end - start) return { ok: false, error: 'Unpaid break must be shorter than the shift.' };

  const overlaps = others.some(
    (item) => item.date === draft.date && start < toMinutes(item.end) && end > toMinutes(item.start),
  );
  if (overlaps) return { ok: false, error: 'This shift overlaps another demo entry.' };

  return {
    ok: true,
    shift: {
      date: draft.date,
      start: draft.start,
      end: draft.end,
      breakMin,
      hours: calculateHours(draft.start, draft.end, breakMin),
      note: draft.note.trim(),
    },
  };
}
