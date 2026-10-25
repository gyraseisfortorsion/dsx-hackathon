import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/stores/session-store';
import { apiRequest } from './client';
import { useUserQuery } from './queries';
import type { DemoUser } from './types';

const communityKey = (user: DemoUser, path: string, params?: Record<string, QueryValue>) =>
  [user, 'community', path, params ?? {}] as const;

type QueryValue = string | number | boolean | null | undefined;

export type StudyGoal = 'exam_preparation' | 'weekly_review' | 'assignment_discussion';
export type StudyFormat = 'quiet' | 'collaborative';
export type MeetingMode = 'online' | 'in_person' | 'either';
export type StudyInterest = 'technology' | 'arts' | 'sports' | 'science' | 'community';
export type StudyRanking = 'rules' | 'model';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type InviteAction = 'accept' | 'decline' | 'cancel';

export type ListingCategory = 'books' | 'furniture' | 'supplies' | 'electronics' | 'other';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair';
export type ListingStatus = 'active' | 'reserved' | 'sold' | 'withdrawn' | 'deleted';
export type ListingScope = 'active' | 'mine' | 'saved';
export type ListingSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc';

export type AvailabilityWindow = {
  weekday: number;
  start: string;
  end: string;
  effective_from?: string | null;
  effective_until?: string | null;
};

export type StudyProfile = {
  discovery: boolean;
  term: string;
  course_ids: string[];
  goals: StudyGoal[];
  study_format: StudyFormat | null;
  meeting_mode: MeetingMode | null;
  interests: StudyInterest[];
  campus_area: string | null;
  timezone: string;
  availability: AvailabilityWindow[];
  notifications: boolean;
  updated_at?: string | null;
};

export type StudyMatch = {
  student_id: string;
  display_name: string;
  university_id: string;
  course_ids: string[];
  shared_goals: StudyGoal[];
  study_format: StudyFormat | null;
  meeting_mode: MeetingMode | null;
  campus_area: string | null;
  overlap_minutes: number;
  windows: { starts_at: string; ends_at: string }[];
  score: number;
  rule_score?: number;
  model?: {
    score: number;
    raw_score: number;
    contributions: Record<string, number>;
    model_version: string;
    synthetic_only: boolean;
    meaning: string;
  };
};

export type StudyMatches = {
  items: StudyMatch[];
  ranking: StudyRanking;
  synthetic_only: boolean;
  explanation: string | null;
};

export type StudyInvitation = {
  id: string;
  sender: string;
  recipient: string;
  course_id: string;
  message: string | null;
  proposed_time: string | null;
  status: InviteStatus;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
};

export type CatalogCourse = { id: string; code: string; title: string };

export type CommunityConfig = {
  university_id: string;
  term: string;
  verified: boolean;
  is_mock: boolean;
  minimum_overlap_minutes: number;
  listing_expiry_days: number;
  currency: string;
  expectations: string;
  courses: CatalogCourse[];
  blocked_accounts: string[];
  deletion_requested: boolean;
};

export type ListingInput = {
  title: string;
  description: string;
  category: ListingCategory;
  condition: ListingCondition;
  price_minor: number;
  currency?: 'USD';
  pickup_area: string;
  photo_ids: string[];
  isbn?: string | null;
  edition?: string | null;
  author?: string | null;
  course_id?: string | null;
};

export type Listing = ListingInput & {
  id: string;
  seller_id: string;
  seller_name: string;
  university_id: string;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
  saved: boolean;
  price_label: string;
  photos: string[];
  thumbnail: string | null;
  expectations: string;
  model_review?: { review_score?: number; flag_for_review?: boolean; reason?: string } | null;
};

export type ListingPage = { items: Listing[]; total: number; next_offset: number | null };

export type ListingFilters = {
  q?: string;
  category?: ListingCategory | null;
  condition?: ListingCondition | null;
  sort?: ListingSort;
  scope?: ListingScope;
};

export type ListingAnalysis = {
  review_score: number;
  flag_for_review: boolean;
  model_version: string;
  synthetic_only: boolean;
  reason: string;
};

export type UploadedPhoto = { id: string; data: string; processing_status: string };

export type CommunityMessage = {
  id: string;
  sender?: string;
  author_id?: string;
  author?: string;
  body: string;
  created_at: string;
  from_me?: boolean;
};

export type CommunityConversation = {
  id: string;
  participants: string[];
  participant_names: string[];
  listing_id: string | null;
  invitation_id: string | null;
  messages: CommunityMessage[];
  created_at: string;
  blocked: boolean;
  expectations: string | null;
  title: string;
  listing_status?: ListingStatus;
};

export type Department = {
  id: string;
  name: string;
  handles: string;
  boundaries: string;
  official_source_urls: string[];
};

export type RoutingResult = {
  handling: 'route' | 'clarify' | 'multiple_routes' | 'out_of_scope' | 'urgent_bypass';
  department: Department | null;
  candidates: { department: Department; score: number | null }[];
  message: string;
  model_version: string;
  source: 'classifier' | 'boundary_rule';
  synthetic_only: boolean;
  submitted: boolean;
};

export const GOAL_OPTIONS: { id: StudyGoal; label: string }[] = [
  { id: 'exam_preparation', label: 'Exam prep' },
  { id: 'weekly_review', label: 'Weekly review' },
  { id: 'assignment_discussion', label: 'Assignments' },
];

export const FORMAT_OPTIONS: { id: StudyFormat; label: string }[] = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'collaborative', label: 'Collaborative' },
];

export const MODE_OPTIONS: { id: MeetingMode; label: string }[] = [
  { id: 'in_person', label: 'In person' },
  { id: 'online', label: 'Online' },
  { id: 'either', label: 'Either' },
];

export const INTEREST_OPTIONS: { id: StudyInterest; label: string }[] = [
  { id: 'technology', label: 'Technology' },
  { id: 'science', label: 'Science' },
  { id: 'arts', label: 'Arts' },
  { id: 'sports', label: 'Sports' },
  { id: 'community', label: 'Community' },
];

export const CATEGORY_OPTIONS: { id: ListingCategory; label: string }[] = [
  { id: 'books', label: 'Books' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'other', label: 'Other' },
];

export const CONDITION_OPTIONS: { id: ListingCondition; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
];

export const WEEKDAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const labelOf = <T extends string>(options: { id: T; label: string }[], id: T | null | undefined) =>
  options.find((option) => option.id === id)?.label ?? id ?? '—';

export const courseLabel = (courses: CatalogCourse[] | undefined, id: string) => {
  const course = courses?.find((item) => item.id === id);
  return course ? `${course.code}` : id;
};

export const messageAuthor = (message: CommunityMessage) => message.sender ?? message.author_id ?? message.author ?? '';

export const otherParticipant = (conversation: CommunityConversation, user: string) => {
  const index = conversation.participants.findIndex((participant) => participant !== user);
  return {
    id: conversation.participants[index] ?? conversation.participants[0] ?? '',
    name: conversation.participant_names[index] ?? conversation.participant_names[0] ?? 'Student',
  };
};

const get = <T>(user: DemoUser, path: string, params?: Record<string, QueryValue>) =>
  queryOptions({
    queryKey: communityKey(user, path, params),
    queryFn: ({ signal }) => apiRequest<T>(user, path, { signal, params }),
  });

export const communityConfigQuery = (user: DemoUser) => get<CommunityConfig>(user, '/community/config');
export const studyProfileQuery = (user: DemoUser) => get<StudyProfile>(user, '/study/profile');
export const studyMatchesQuery = (user: DemoUser, ranking: StudyRanking = 'rules') => get<StudyMatches>(user, '/study/matches', { ranking });
export const studyInvitationsQuery = (user: DemoUser) => get<StudyInvitation[]>(user, '/study/invitations');
export const conversationsQuery = (user: DemoUser) => get<CommunityConversation[]>(user, '/community/conversations');
export const conversationQuery = (id: string) => (user: DemoUser) => get<CommunityConversation>(user, `/community/conversations/${encodeURIComponent(id)}`);
export const departmentsQuery = (user: DemoUser) => get<Department[]>(user, '/requests/departments');
export const listingQuery = (id: string) => (user: DemoUser) => get<Listing>(user, `/marketplace/listings/${encodeURIComponent(id)}`);
export const relatedListingsQuery = (id: string) => (user: DemoUser) => get<Listing[]>(user, `/marketplace/listings/${encodeURIComponent(id)}/related`);

export const listingsQuery = (user: DemoUser, filters: ListingFilters = {}) =>
  get<ListingPage>(user, '/marketplace/listings', {
    q: filters.q || undefined,
    category: filters.category,
    condition: filters.condition,
    sort: filters.sort ?? 'newest',
    scope: filters.scope ?? 'active',
  });

export const useCommunityConfig = () => useUserQuery(communityConfigQuery);
export const useStudyProfile = () => useUserQuery(studyProfileQuery);
export const useStudyMatches = (ranking: StudyRanking = 'rules') => useUserQuery((user) => studyMatchesQuery(user, ranking));
export const useStudyInvitations = () => useUserQuery(studyInvitationsQuery);
export const useConversations = () => useUserQuery(conversationsQuery);
export const useConversation = (id: string) => useUserQuery(conversationQuery(id));
export const useDepartments = () => useUserQuery(departmentsQuery);
export const useListing = (id: string) => useUserQuery(listingQuery(id));
export const useRelatedListings = (id: string) => useUserQuery(relatedListingsQuery(id));
export const useListings = (filters: ListingFilters = {}) => useUserQuery((user) => listingsQuery(user, filters));

function useCommunityMutation<TInput, TResult>(action: (user: DemoUser, input: TInput) => Promise<TResult>) {
  const user = useCurrentUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => action(user!, input),
    onSuccess: () => client.invalidateQueries({ queryKey: [user, 'community'] }),
  });
}

export const useSaveStudyProfile = () =>
  useCommunityMutation((user, profile: StudyProfile) => {
    const { updated_at: _updated, ...body } = profile;
    return apiRequest<StudyProfile>(user, '/study/profile', { method: 'PUT', body });
  });

export const useSendStudyInvite = () =>
  useCommunityMutation((user, body: { recipient: string; course_id: string; message?: string; proposed_time?: string }) =>
    apiRequest<StudyInvitation>(user, '/study/invitations', { method: 'POST', body }),
  );

export const useInvitationAction = () =>
  useCommunityMutation((user, input: { id: string; action: InviteAction }) =>
    apiRequest<StudyInvitation>(user, `/study/invitations/${encodeURIComponent(input.id)}/action`, {
      method: 'POST',
      body: { action: input.action },
    }),
  );

export const useInvitationFeedback = () =>
  useCommunityMutation((user, input: { id: string; useful: boolean; studied_together?: boolean }) =>
    apiRequest(user, `/study/invitations/${encodeURIComponent(input.id)}/feedback`, {
      method: 'PUT',
      body: { useful: input.useful, studied_together: input.studied_together },
    }),
  );

export const useAnalyzeListing = () =>
  useCommunityMutation((user, body: { title: string; description: string }) =>
    apiRequest<ListingAnalysis>(user, '/marketplace/analyze', { method: 'POST', body }),
  );

export const useUploadListingPhoto = () =>
  useCommunityMutation((user, data: string) =>
    apiRequest<UploadedPhoto>(user, '/marketplace/photos', { method: 'POST', body: { data } }),
  );

export const useCreateListing = () =>
  useCommunityMutation((user, body: ListingInput) => apiRequest<Listing>(user, '/marketplace/listings', { method: 'POST', body }));

export const useSaveListing = () =>
  useCommunityMutation((user, input: { id: string; enabled: boolean }) =>
    apiRequest<{ saved: boolean }>(user, `/marketplace/listings/${encodeURIComponent(input.id)}/saved`, {
      method: 'PUT',
      body: { enabled: input.enabled },
    }),
  );

export const useListingStatus = () =>
  useCommunityMutation((user, input: { id: string; status: ListingStatus }) =>
    apiRequest<Listing>(user, `/marketplace/listings/${encodeURIComponent(input.id)}/status`, {
      method: 'PUT',
      body: { status: input.status },
    }),
  );

export const useInquireListing = () =>
  useCommunityMutation((user, id: string) =>
    apiRequest<CommunityConversation>(user, `/marketplace/listings/${encodeURIComponent(id)}/inquire`, { method: 'POST' }),
  );

export const useSendCommunityMessage = () =>
  useCommunityMutation((user, input: { id: string; body: string }) =>
    apiRequest<CommunityConversation>(user, `/community/conversations/${encodeURIComponent(input.id)}/messages`, {
      method: 'POST',
      body: { body: input.body },
    }),
  );

export const useBlockAccount = () =>
  useCommunityMutation((user, input: { target: string; enabled: boolean }) =>
    apiRequest(user, `/community/blocks/${encodeURIComponent(input.target)}`, { method: 'PUT', body: { enabled: input.enabled } }),
  );

export const useReportCommunity = () =>
  useCommunityMutation((user, body: { target_type: 'account' | 'listing'; target_id: string; reason: string }) =>
    apiRequest(user, '/community/reports', { method: 'POST', body }),
  );

export const useRouteRequest = () =>
  useCommunityMutation((user, text: string) => apiRequest<RoutingResult>(user, '/requests/route', { method: 'POST', body: { text } }));

export type ModelStatus = { synthetic_only: boolean; study_ranker: string; moderation: string; automatic_review_flags_enabled: boolean; automatic_removal_or_bans: boolean };
export const communityModelsQuery = (user: DemoUser) => get<ModelStatus>(user, '/community/models');
export const useCommunityModels = () => useUserQuery(communityModelsQuery);
export const useEditListing = () => useCommunityMutation((user, input: { id: string; listing: ListingInput }) =>
  apiRequest<Listing>(user, `/marketplace/listings/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input.listing }));
export const useDeletionRequest = () => useCommunityMutation((user) => apiRequest<{ status?: string; message?: string; request_id?: string }>(user, '/community/deletion-request', { method: 'POST' }));
