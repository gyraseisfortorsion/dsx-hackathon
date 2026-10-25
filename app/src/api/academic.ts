import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/stores/session-store';
import { ApiError, apiRequest } from './client';
import { useUserQuery } from './queries';
import type { Snapshot } from './services';
import type { Course, CalendarEvent, DemoUser } from './types';

export type AcademicAssessment = {
  id: string; course_id: string; title: string; kind: string;
  due_at: string | null; due_on: string | null; starts_at: string | null;
  points_possible: string | number | null; score: string | number | null;
  category: string | null; status: 'upcoming' | 'submitted' | 'graded' | 'missing';
  syllabus_id: string | null; passage_ids: string[];
};
export type AcademicTask = { id: string; assessment_id: string; course_id?: string; title: string; remaining_minutes: number; status: 'todo' | 'doing' | 'done' };
export type StudyBlock = { id: string; task_id: string; starts_at: string; ends_at: string; locked: boolean; completed: boolean };
export type AvailabilityWindow = { weekday: number; starts_at: string; ends_at: string };
export type CompletedCourse = { course_code: string; grade: string | null; credits: number | string | null };
export type PrerequisiteRule = { course_id: string; all_of?: string[]; any_of?: string[]; minimum_grade?: string | null; syllabus_id?: string | null; passage_ids?: string[] };
export type PrerequisiteCheck = { course_id: string; status: 'met' | 'not_met' | 'unknown'; reason?: string; missing?: string[]; any_of_satisfied?: boolean; grade_evidence_incomplete?: boolean; rule?: PrerequisiteRule };
export type GradingScheme = { mode: 'points' | 'weighted'; categories?: { name: string; weight: string | number; drop_lowest: number }[]; thresholds?: { letter: string; minimum: number | string }[]; syllabus_id?: string | null; passage_ids?: string[] };
export type AcademicGrades = { course_id: string; current_percentage: string | null; earned: string; possible: string; categories: unknown[]; mode: string; assessments: AcademicAssessment[]; scheme: GradingScheme | null };
export type AcademicDashboard = {
  date: string; credits: number; courses: Pick<Course, 'id' | 'code' | 'title' | 'credits'>[];
  today_classes: CalendarEvent[]; upcoming_assessments: AcademicAssessment[]; overdue_assessments: AcademicAssessment[];
  pending_syllabus_items: number; study_blocks: StudyBlock[];
};
export type AcademicCalendar = { classes: CalendarEvent[]; assessments: AcademicAssessment[]; study_blocks: StudyBlock[] };
export type Workload = { from: string; to: string; overloaded: boolean; days: { date: string; required_minutes: number; available_minutes: number; cumulative_deficit_minutes: number; task_ids: string[]; assessment_ids: string[] }[] };
export type PlanPreview = { input_version: number; mode: string; blocks: StudyBlock[]; unscheduled: { task_id: string; remaining_minutes?: number; reason?: string }[]; feasible: boolean };
export type GradeScenario = { target_percentage: string; target_met: boolean; projection: Pick<AcademicGrades, 'current_percentage' | 'earned' | 'possible' | 'mode'>; unknown_assessment_ids: string[] };
export type Passage = { id: string; course_id: string; syllabus_id: string; page: number | null; text: string; excerpt?: string; path?: string };
export type SyllabusCandidate = { id: string; kind: string; title?: string; ambiguity?: string | null; change?: string; status: string; value: Record<string, unknown>; passage_ids?: string[]; excerpt?: string; confidence?: number; warnings?: string[] };
export type Syllabus = { id: string; course_id: string; filename: string; status: string; candidates?: SyllabusCandidate[]; passages?: Passage[]; warnings?: string[]; created_at?: string };
export type SyllabusUpload = { filename: string; media_type: 'application/pdf' | 'text/plain'; text?: string; content_base64?: string };

export const academicQuery = <T>(path: string, params?: Record<string, string | number>) => (user: DemoUser) => queryOptions({
  queryKey: [user, 'academic', path, params ?? {}] as const,
  queryFn: ({ signal }) => apiRequest<Snapshot<T>>(user, path, { signal, params }),
  staleTime: 30_000,
});
export const dashboardQuery = (on: string) => academicQuery<AcademicDashboard>('/academic/dashboard', { on });
export const academicCoursesQuery = academicQuery<Course[]>('/academic/courses');
export const syllabiQuery = (course_id?: string) => academicQuery<Syllabus[]>('/academic/syllabi', course_id ? { course_id } : undefined);
export const syllabusQuery = (id: string) => academicQuery<Syllabus>(`/academic/syllabi/${encodeURIComponent(id)}`);
export const academicGradesQuery = (id: string) => academicQuery<AcademicGrades>(`/academic/courses/${encodeURIComponent(id)}/grades`);
export const prerequisiteQuery = (id: string) => academicQuery<PrerequisiteCheck>(`/academic/courses/${encodeURIComponent(id)}/prerequisite-check`);
export const passageQuery = (id: string) => academicQuery<Passage>(`/academic/passages/${encodeURIComponent(id)}`);
export const academicCalendarQuery = (from: string, to: string) => academicQuery<AcademicCalendar>('/academic/calendar', { from, to });
export const workloadQuery = (from: string, to: string) => academicQuery<Workload>('/academic/workload', { from, to });
export const searchAcademicQuery = (q: string, course_id?: string) => academicQuery<Passage[]>('/academic/search', { q, ...(course_id ? { course_id } : {}) });

/** Academic versions are independent of campus-service versions. Never replay a conflicting write. */
export function useAcademicWrite<T>() {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, method = 'PUT', body }: { path: string; method?: 'PUT' | 'POST'; body: Record<string, unknown> }) => {
      if (!user) throw new ApiError('Select a student before continuing.', 401);
      try {
        return await apiRequest<Snapshot<T>>(user, path, { method, body });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          await client.invalidateQueries({ queryKey: [user, 'academic'] });
          throw new ApiError('Your academic data changed. The latest data has been loaded. Review your entries and try again. If this is a plan, generate a new preview.', 409);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [user, 'academic'] }),
        client.invalidateQueries({ queryKey: [user, '/calendar'] }),
        client.invalidateQueries({ queryKey: [user, '/grades'] }),
      ]);
    },
    retry: false,
  });
}

export const useAcademicCourses = () => useUserQuery(academicCoursesQuery);
