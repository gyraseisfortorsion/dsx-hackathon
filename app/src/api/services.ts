import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/stores/session-store';
import { ApiError, apiRequest } from './client';
import { studentQuery, useUserQuery } from './queries';
import { queryClient } from './query-client';
import type { DemoUser, StudentProfile } from './types';

/** Shared envelope for campus-service routes added after the original student API. */
export type Snapshot<T> = { user: string; as_of: string; is_mock: true; version: number; data: T };

export type ServiceSettings = {
  vegetarian: boolean;
  step_free: boolean;
  class_reminders: boolean;
  saved_event_updates: boolean;
  club_activity: boolean;
  reduced_motion: boolean;
  larger_text: boolean;
  grades_hidden: boolean;
  face_id_enabled: boolean;
  pay_hidden: boolean;
  menu_hint_visible: boolean;
};

export type ThreadKind = 'class' | 'club' | 'dm' | 'study_group';

export type ThreadMessage = {
  id: string;
  author_id: string;
  author: string;
  body: string;
  created_at: string;
  from_me: boolean;
};

export type ChatThread = {
  id: string;
  kind: ThreadKind;
  title: string;
  avatar: string;
  course_id?: string | null;
  club_id?: string | null;
  notice?: string | null;
  pinned?: { label: string; title: string; body: string } | null;
  messages: ThreadMessage[];
  preview: string;
  last_activity?: string | null;
};

export type Club = {
  id: string;
  initials: string;
  name: string;
  tagline: string;
  about: string;
  tags: string[];
  member_count: number;
  meeting_schedule: string;
  welcome: string;
  open_house?: { title: string; starts_at: string; ends_at: string; location: string } | null;
  joined: boolean;
  open_house_planned: boolean;
};

export type Residence = { building: string; room: string; office: string };

export type HousingStatus = 'Submitted' | 'Routed' | 'Assigned' | 'Scheduled / In progress' | 'Resolved';

export type HousingRequest = {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: 'Routine' | 'Urgent' | 'Emergency';
  building: string;
  room: string;
  preferred_time: string;
  photos: { name: string; media_type: string; content_base64: string }[];
  status: HousingStatus;
  destination: string;
  created_at: string;
  updates: { status: HousingStatus; text: string; created_at: string }[];
};

export type HousingContacts = {
  residences: { label: string; value: string; href: string }[];
  real_estate: { label: string; value: string; href: string }[];
  emergency: { label: string; value: string; href: string }[];
  routing_is_mock: true;
};

export type Job = {
  id: string;
  title: string;
  department: string;
  supervisor: string;
  status: string;
  hourly_rate_cents: number;
  currency?: string;
};

export type Shift = { id: string; date: string; start: string; end: string; break_minutes: number; note: string; hours: number };

export type Timesheet = {
  id: string;
  starts_on: string;
  ends_on: string;
  due_at: string;
  status: 'Draft' | 'Awaiting supervisor' | 'Approved' | 'Paid';
  shifts: Shift[];
  hours: number;
  gross_cents: number;
};

export type ChecklistItem = { id: string; title: string; complete: boolean; description: string };

export type Pay = {
  next_payday: string;
  last_payment_on: string;
  last_payment_cents: number;
  ytd_gross_cents: number;
  ytd_net_cents: number;
  currency?: string;
};

export type DirectDeposit = { status: string; account_last_four: string | null; manage_url: string };

export type Employment = {
  job: Job;
  timesheets: Timesheet[];
  checklist: ChecklistItem[];
  pay: Pay;
  direct_deposit: DirectDeposit;
};

export type DiningTransaction = {
  id: string;
  merchant: string;
  occurred_at: string;
  account: 'dining_points' | 'convenience_points';
  amount_cents: number;
  currency?: string;
};

export type PlannerEvent = {
  id: string;
  kind: 'club_open_house' | 'extracted_deadline' | 'study_group';
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  club_id?: string | null;
  course_id?: string | null;
  thread_id?: string | null;
};

export type ResourceLink = { id: string; title: string; description: string; url: string };

export type ResourcePage = { id: string; title: string; intro: string; rows: string[]; links: ResourceLink[] };

const versionKey = (user: DemoUser) => [user, 'service-version'] as const;
const serviceKey = (user: DemoUser, path: string) => [user, 'service', path] as const;

const rememberVersion = (user: DemoUser, version: number) => queryClient.setQueryData(versionKey(user), version);

const serviceQuery = <T>(path: string) => (user: DemoUser) =>
  queryOptions({
    queryKey: serviceKey(user, path),
    queryFn: async ({ signal }) => {
      const snapshot = await apiRequest<Snapshot<T>>(user, path, { signal });
      rememberVersion(user, snapshot.version);
      return snapshot;
    },
  });

export const settingsQuery = serviceQuery<ServiceSettings>('/settings/preferences');
export const chatsQuery = serviceQuery<ChatThread[]>('/chats');
export const clubsQuery = serviceQuery<Club[]>('/clubs');
export const extrasQuery = serviceQuery<PlannerEvent[]>('/calendar/extras');
export const housingQuery = serviceQuery<Residence>('/housing');
export const housingContactsQuery = serviceQuery<HousingContacts>('/housing/contacts');
export const housingRequestsQuery = serviceQuery<HousingRequest[]>('/housing/requests');
export const workQuery = serviceQuery<Employment>('/work');
export const transactionsQuery = serviceQuery<DiningTransaction[]>('/dining/transactions');
export const resourcesQuery = serviceQuery<ResourcePage[]>('/resources');
export const externalLinksQuery = serviceQuery<ResourceLink[]>('/resources/external-links');

export const threadQuery = (id: string) => serviceQuery<ChatThread>(`/chats/${encodeURIComponent(id)}`);
export const clubQuery = (id: string) => serviceQuery<Club>(`/clubs/${encodeURIComponent(id)}`);
export const housingRequestQuery = (id: string) => serviceQuery<HousingRequest>(`/housing/requests/${encodeURIComponent(id)}`);
export const timesheetQuery = (id: string) => serviceQuery<Timesheet>(`/work/timesheets/${encodeURIComponent(id)}`);
export const resourcePageQuery = (id: string) => serviceQuery<ResourcePage>(`/resources/${encodeURIComponent(id)}`);
export const externalLinkQuery = (id: string) => serviceQuery<ResourceLink>(`/resources/external-links/${encodeURIComponent(id)}`);

export const useSettings = () => useUserQuery(settingsQuery);
export const useChats = () => useUserQuery(chatsQuery);
export const useClubs = () => useUserQuery(clubsQuery);
export const useCalendarExtras = () => useUserQuery(extrasQuery);
export const useHousing = () => useUserQuery(housingQuery);
export const useHousingContacts = () => useUserQuery(housingContactsQuery);
export const useHousingRequests = () => useUserQuery(housingRequestsQuery);
export const useWork = () => useUserQuery(workQuery);
export const useDiningTransactions = () => useUserQuery(transactionsQuery);
export const useResources = () => useUserQuery(resourcesQuery);
export const useExternalLinks = () => useUserQuery(externalLinksQuery);
export const useThread = (id: string) => useUserQuery(threadQuery(id));
export const useClub = (id: string) => useUserQuery(clubQuery(id));
export const useHousingRequest = (id: string) => useUserQuery(housingRequestQuery(id));
export const useTimesheet = (id: string) => useUserQuery(timesheetQuery(id));
export const useResourcePage = (id: string) => useUserQuery(resourcePageQuery(id));
export const useExternalLink = (id: string) => useUserQuery(externalLinkQuery(id));

async function latestVersion(user: DemoUser) {
  const cached = queryClient.getQueryData<number>(versionKey(user));
  if (cached != null) return cached;
  const snapshot = await queryClient.fetchQuery(settingsQuery(user));
  return snapshot.version;
}

const SERVICE_CONFLICT = 'This changed on the server. The latest version is loaded — try again.';

async function writeService<T>(user: DemoUser, path: string, method: 'POST' | 'PUT' | 'DELETE', body?: Record<string, unknown>) {
  const version = await latestVersion(user);
  try {
    const snapshot = await apiRequest<Snapshot<T>>(user, path, {
      method,
      body: method === 'DELETE' ? undefined : { ...body, version },
      params: method === 'DELETE' ? { version } : undefined,
    });
    rememberVersion(user, snapshot.version);
    await queryClient.invalidateQueries({ queryKey: [user, 'service'] });
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await queryClient.invalidateQueries({ queryKey: [user, 'service'] });
      throw new ApiError(SERVICE_CONFLICT, 409);
    }
    throw error;
  }
}

export function useServiceWrite<T = unknown>() {
  const user = useCurrentUser();
  return useMutation({
    mutationFn: ({ path, method = 'PUT', body }: { path: string; method?: 'POST' | 'PUT' | 'DELETE'; body?: Record<string, unknown> }) =>
      writeService<T>(user!, path, method, body),
  });
}

export function useSaveSettings() {
  const user = useCurrentUser();
  return useMutation({
    mutationFn: (settings: ServiceSettings) => writeService<ServiceSettings>(user!, '/settings/preferences', 'PUT', { settings }),
  });
}

export function usePatchSettings() {
  const user = useCurrentUser();
  const save = useSaveSettings();
  return {
    ...save,
    mutate: (patch: Partial<ServiceSettings>, options?: Parameters<typeof save.mutate>[1]) => {
      const current = user ? queryClient.getQueryData(settingsQuery(user).queryKey)?.data : undefined;
      if (!current) return;
      save.mutate({ ...current, ...patch }, options);
    },
  };
}

export function useEditProfile() {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (full_name: string) => writeService<StudentProfile>(user!, '/student', 'PUT', { full_name }),
    onSuccess: (snapshot) => {
      if (!user) return;
      client.setQueryData(studentQuery(user).queryKey, snapshot.data);
    },
  });
}

export const clubChatId = (threads: ChatThread[] | undefined, clubId: string) =>
  threads?.find((thread) => thread.club_id === clubId)?.id ?? clubId;

export const currentTimesheet = (sheets: Timesheet[] | undefined) => sheets?.find((sheet) => sheet.status === 'Draft') ?? sheets?.[0];

export const clockTime = (value: string) => value.slice(0, 5);

export const SETTINGS_TOGGLES: Record<string, { key: keyof ServiceSettings; label: string }[]> = {
  notifications: [
    { key: 'class_reminders', label: 'Class reminders' },
    { key: 'saved_event_updates', label: 'Saved event updates' },
    { key: 'club_activity', label: 'Club activity' },
  ],
  accessibility: [
    { key: 'step_free', label: 'Step-free routes' },
    { key: 'reduced_motion', label: 'Reduced motion' },
    { key: 'larger_text', label: 'Larger text' },
  ],
  privacy: [
    { key: 'grades_hidden', label: 'Hide grades' },
    { key: 'pay_hidden', label: 'Hide pay' },
  ],
};
