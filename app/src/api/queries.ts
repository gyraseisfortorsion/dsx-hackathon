import { queryOptions, useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';

import { useCurrentUser } from '@/stores/session-store';
import { apiRequest } from './client';
import type {
  AssistantMessage,
  AttendanceResponse,
  CalendarResponse,
  CoursesResponse,
  DemoUser,
  GradesResponse,
  MealPlanResponse,
  StudentProfile,
} from './types';

const endpoint = <T>(path: string) => (user: DemoUser) =>
  queryOptions({
    queryKey: [user, path] as const,
    queryFn: ({ signal }) => apiRequest<T>(user, path, { signal }),
  });

export const studentQuery = endpoint<StudentProfile>('/student');
export const mealPlanQuery = endpoint<MealPlanResponse>('/meal-plan');
export const coursesQuery = endpoint<CoursesResponse>('/courses');
export const calendarQuery = endpoint<CalendarResponse>('/calendar');
export const attendanceQuery = endpoint<AttendanceResponse>('/attendance');
export const gradesQuery = endpoint<GradesResponse>('/grades');
export const messagesQuery = endpoint<AssistantMessage[]>('/messages');

/** Placeholder that never fetches; it only keeps hook order stable while signing out. */
export const SIGNED_OUT = 'signed-out' as DemoUser;

export function useUserQuery<T, TKey extends QueryKey>(factory: (user: DemoUser) => UseQueryOptions<T, Error, T, TKey>) {
  const user = useCurrentUser();
  const options = factory(user ?? SIGNED_OUT);
  return useQuery({ ...options, enabled: user != null ? options.enabled : false });
}

export const useStudent = () => useUserQuery(studentQuery);
export const useMealPlan = () => useUserQuery(mealPlanQuery);
export const useCourses = () => useUserQuery(coursesQuery);
export const useCalendar = () => useUserQuery(calendarQuery);
export const useAttendance = () => useUserQuery(attendanceQuery);
export const useGrades = () => useUserQuery(gradesQuery);
export const useAssistantMessages = () => useUserQuery(messagesQuery);

/** Sends a message to the assistant and appends both sides of the exchange to the cached history. */
export function useSendAssistantMessage() {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => apiRequest<AssistantMessage>(user!, '/chat', { method: 'POST', body: { message } }),
    onSuccess: (reply, message) => {
      if (!user) return;
      const sent: AssistantMessage = { id: `local-${reply.id}`, role: 'user', content: message, created_at: new Date().toISOString(), sources: [] };
      client.setQueryData(messagesQuery(user).queryKey, (history = []) => [...history, sent, reply]);
    },
  });
}
