import type { AgendaKind } from '@/types';
import { dateOf, minutesOf } from '@/utils/campus-time';
import type {
  Assessment,
  CalendarEvent,
  Course,
  CourseAttendance,
  CourseGrades,
  CourseSection,
  MealPlanResponse,
  StudentProfile,
} from './types';

// Student

export const firstName = (profile: StudentProfile) => profile.full_name.split(' ')[0];

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const DEGREE_LABELS: Record<string, string> = { undergraduate: 'Undergraduate', graduate: 'Graduate', phd: 'PhD' };

/** "College of Arts & Sciences · Year 1" */
export function profileSubtitle(profile: StudentProfile) {
  return `${profile.program} · ${DEGREE_LABELS[profile.degree_level] ?? profile.degree_level} year ${profile.year}`;
}

/** "fall-2026" -> "Fall 2026" */
export const formatTerm = (term: string) =>
  term
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

// Money

export const formatCents = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function mealSummary(plan: MealPlanResponse) {
  if (!plan.plan) return { headline: 'No meal plan', detail: 'Convenience Points only' };
  if (plan.unlimited_meals) return { headline: 'Unlimited meals', detail: plan.plan.name };
  const remaining = plan.balance.meals_remaining ?? 0;
  const period = plan.meal_period === 'weekly' ? 'this week' : 'this semester';
  return { headline: `${remaining} ${remaining === 1 ? 'meal' : 'meals'} left ${period}`, detail: plan.plan.name };
}

// Courses & calendar

export type CourseLookup = Map<string, Course>;

export const courseLookup = (courses: Course[] | undefined): CourseLookup => new Map((courses ?? []).map((course) => [course.id, course]));

export const sectionOf = (course: Course | undefined, sectionId: string | null | undefined): CourseSection | undefined =>
  course?.sections.find((section) => section.id === sectionId);

const EXAM_KINDS = new Set(['quiz', 'midterm', 'final']);

export type AgendaEntry = {
  id: string;
  kind: AgendaKind;
  /** Tag shown above the title, e.g. "Lecture" or "Midterm". */
  label: string;
  code: string;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  isClass: boolean;
  source: CalendarEvent;
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function toAgendaEntry(event: CalendarEvent, courses: CourseLookup): AgendaEntry {
  const course = courses.get(event.course_id);
  const code = course?.code ?? event.title.split(/ — |: /)[0];
  const isClass = event.kind === 'class';

  if (isClass) {
    const component = sectionOf(course, event.section_id)?.component ?? event.title.match(/\(([^)]+)\)$/)?.[1] ?? 'class';
    return {
      id: event.id,
      kind: 'class',
      label: capitalize(component),
      code,
      title: code,
      subtitle: [course?.title, event.location].filter(Boolean).join(' · '),
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location,
      isClass,
      source: event,
    };
  }

  const title = event.title.includes(': ') ? event.title.split(': ').slice(1).join(': ') : event.title;
  return {
    id: event.id,
    kind: EXAM_KINDS.has(event.kind) ? 'academic' : 'deadline',
    label: capitalize(event.kind),
    code,
    title: `${code} ${title}`,
    subtitle: event.location ? `${event.location}` : event.ends_at ? 'Scheduled' : 'Due 11:59 PM',
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location,
    isClass,
    source: event,
  };
}

/** Calendar entries grouped by campus-local date, each day sorted by start time. */
export function groupByDate(entries: AgendaEntry[]) {
  const days = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const date = dateOf(entry.startsAt);
    const list = days.get(date);
    if (list) list.push(entry);
    else days.set(date, [entry]);
  }
  for (const list of days.values()) list.sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt));
  return days;
}

/** Pairs of entries on the same day whose times overlap. */
export function countConflicts(entries: AgendaEntry[]) {
  const timed = entries.filter((entry) => entry.endsAt);
  let conflicts = 0;
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (Date.parse(a.startsAt) < Date.parse(b.endsAt!) && Date.parse(b.startsAt) < Date.parse(a.endsAt!)) conflicts++;
    }
  }
  return conflicts;
}

// Attendance

export type AttendanceStats = { attended: number; total: number; absent: number; late: number; excused: number; percent: number };

export function attendanceStats(course: Pick<CourseAttendance, 'counts'>): AttendanceStats {
  const present = course.counts.present ?? 0;
  const late = course.counts.late ?? 0;
  const absent = course.counts.absent ?? 0;
  const excused = course.counts.excused ?? 0;
  const total = present + late + absent + excused;
  const attended = total - absent;
  return { attended, total, absent, late, excused, percent: total ? Math.round((attended / total) * 100) : 100 };
}

export function overallAttendance(courses: CourseAttendance[]) {
  return attendanceStats({
    counts: courses.reduce(
      (sum, course) => ({
        present: sum.present + (course.counts.present ?? 0),
        late: sum.late + (course.counts.late ?? 0),
        absent: sum.absent + (course.counts.absent ?? 0),
        excused: sum.excused + (course.counts.excused ?? 0),
      }),
      { present: 0, late: 0, absent: 0, excused: 0 },
    ),
  });
}

export const pluralize = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

// Grades

const LETTER_CUTOFFS: [number, string][] = [
  [93, 'A'],
  [90, 'A-'],
  [87, 'B+'],
  [83, 'B'],
  [80, 'B-'],
  [77, 'C+'],
  [73, 'C'],
  [70, 'C-'],
  [60, 'D'],
];

export const letterGrade = (percent: number) => LETTER_CUTOFFS.find(([cutoff]) => percent >= cutoff)?.[1] ?? 'F';

export const formatPercent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

/** Credit-weighted average of courses that have a current percentage. */
export function averageGrade(grades: CourseGrades[], courses: CourseLookup) {
  let weighted = 0;
  let credits = 0;
  for (const grade of grades) {
    if (grade.current_percentage == null) continue;
    const weight = courses.get(grade.course_id)?.credits ?? 1;
    weighted += grade.current_percentage * weight;
    credits += weight;
  }
  return credits ? weighted / credits : null;
}

export function assessmentResult(assessment: Assessment) {
  if (assessment.status === 'graded' && assessment.score != null) return `${assessment.score}/${assessment.max_score}`;
  if (assessment.status === 'missing') return 'Missing';
  if (assessment.status === 'submitted') return 'Submitted';
  return 'Upcoming';
}

export const allAssessments = (grades: CourseGrades[]) => grades.flatMap((course) => course.assessments);
