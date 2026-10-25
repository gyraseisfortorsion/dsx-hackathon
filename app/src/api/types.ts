/** Response shapes for the BU Student Prototype API (see openapi.json). */

export const DEMO_USERS = ['alex', 'maya', 'jordan', 'sam', 'taylor'] as const;
export type DemoUser = (typeof DEMO_USERS)[number];

export type ApiSource = { title: string; url: string; retrieved_on: string };

export type StudentProfile = {
  user: string;
  buid: string;
  full_name: string;
  email: string;
  school: string;
  program: string;
  major: string;
  degree_level: string;
  year: number;
  term: string;
  is_mock?: boolean;
  as_of: string;
  program_source: ApiSource;
};

export type MealPlan = {
  id: string;
  name: string;
  academic_year: string;
  meal_period: string;
  meal_allowance: number | null;
  dining_points_included_cents: number;
  semester_cost_cents: number;
  guest_meal_allowance: number;
  weekly_reset_day?: string | null;
  source: ApiSource;
};

export type MealBalance = {
  plan_id: string | null;
  meals_remaining: number | null;
  dining_points_balance_cents: number;
  convenience_points_balance_cents: number;
  guest_meals_remaining: number;
};

export type MealPlanResponse = {
  user: string;
  as_of: string;
  is_mock?: boolean;
  currency?: string;
  plan: MealPlan | null;
  balance: MealBalance;
  unlimited_meals: boolean;
  meal_period: string;
  period_starts_on: string | null;
  period_ends_on: string | null;
  next_reset_on: string | null;
  rules: string[];
  sources: ApiSource[];
};

export type Meeting = { weekdays: number[]; start_time: string; end_time: string; room: string | null };

export type CourseSection = {
  id: string;
  component: string;
  instructors: string[];
  meetings: Meeting[];
  exam_reservations?: Meeting[];
  paired_lecture?: string | null;
  notes?: string;
};

export type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  required_components: string[];
  sections: CourseSection[];
  source: ApiSource;
};

export type Term = {
  id: string;
  timezone: string;
  starts_on: string;
  ends_on: string;
  finals_start: string;
  finals_end: string;
  suspended_dates: string[];
  substitute_days: Record<string, number>;
  source: ApiSource;
};

export type CoursesResponse = { user: string; as_of: string; is_mock?: boolean; term: Term; courses: Course[] };

export type CalendarEventKind = 'class' | 'assignment' | 'quiz' | 'midterm' | 'project' | 'final' | (string & {});

export type CalendarEvent = {
  id: string;
  course_id: string;
  title: string;
  kind: CalendarEventKind;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  section_id?: string | null;
  assessment_id?: string | null;
  is_mock?: boolean;
};

export type CalendarResponse = { user: string; as_of: string; timezone: string; term: string; is_mock?: boolean; events: CalendarEvent[] };

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | (string & {});

export type AttendanceRecord = { course_id: string; event_id: string; starts_at: string; status: AttendanceStatus };

export type CourseAttendance = {
  course_id: string;
  counts: Partial<Record<'present' | 'late' | 'absent' | 'excused', number>>;
  records: AttendanceRecord[];
};

export type AttendanceResponse = { user: string; as_of: string; is_mock?: boolean; courses: CourseAttendance[] };

export type AssessmentStatus = 'graded' | 'submitted' | 'missing' | 'upcoming' | (string & {});

export type Assessment = {
  id: string;
  course_id: string;
  title: string;
  kind: string;
  due_at: string;
  starts_at?: string | null;
  location?: string | null;
  max_score: number;
  score?: number | null;
  status: AssessmentStatus;
  is_mock?: boolean;
};

export type CourseGrades = {
  course_id: string;
  earned_points: number;
  graded_possible_points: number;
  current_percentage: number | null;
  assessments: Assessment[];
};

export type GradesResponse = { user: string; as_of: string; is_mock?: boolean; courses: CourseGrades[] };

/** Campus event as ranked by the backend. Timestamps may use `Z` or an offset, with optional fractional seconds. */
export type EventCard = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  source_url: string;
  /** "<ORG CODE>, <Event type>", e.g. "BUJSA1227, Cultural". */
  source_category: string;
  cluster_id: string;
  /** Tag id → score. Organizer/user overrides store `null` scores. Never show scores as probabilities. */
  tags?: Record<string, number | null>;
  tag_source?: 'baseline' | 'model' | 'organizer' | (string & {});
  taxonomy_version?: string | null;
  saved?: boolean;
  not_interested?: boolean;
  conflict_ids?: string[];
  conflict_check_complete: boolean;
  /** Ranking signal only; never present it as a probability. */
  score?: number | null;
  reasons?: string[];
};

export type EventWindow = { starts_at: string; ends_at: string };

export type EventFilters = {
  starts_from?: string | null;
  starts_before?: string | null;
  category_ids?: string[];
  cluster_ids?: string[];
  /** Omit to use the saved preference. */
  avoid_schedule_conflicts?: boolean | null;
  available_windows?: EventWindow[];
};

export type EventResults = {
  mode: 'general' | 'personalized' | 'search' | 'no_match' | (string & {});
  as_of: string;
  artifact_version: string;
  profile_version: number;
  effective_filters: EventFilters;
  total: number;
  next_offset: number | null;
  notice?: string | null;
  items: EventCard[];
};

export type EventSearchRequest = { query: string; filters?: EventFilters; limit?: number; offset?: number };

export type EventFeedback = { saved: boolean; not_interested: boolean };

export type EventFeedbackResponse = EventFeedback & { event_id: string; profile_version: number };

export type Preferences = {
  version: number;
  interest_ids: string[];
  interests_text: string;
  goal_ids: string[];
  avoid_schedule_conflicts: boolean;
};

export type EventInterestOption = { id: string; label: string; topics: string };

export type EventCluster = { id: string; label: string; top_terms: string[]; reviewed: boolean; upcoming_count?: number };

export type EventArtifact = {
  source_url?: string;
  built_at?: string;
  events?: number;
  limitations?: string;
  selected_k?: number;
};

export type EventOptions = {
  interests: EventInterestOption[];
  goals: { id: string; label: string }[];
  categories: string[];
  clusters: EventCluster[];
  defaults: Preferences;
  artifact_version: string;
  data?: EventArtifact;
};

export type EventClustersResponse = { artifact_version: string; clusters: EventCluster[] };

export type Citation = { title: string; url: string };

export type RoutingDepartment = {
  id: string;
  name: string;
  handles: string;
  boundaries: string;
  official_source_urls: string[];
};

export type RequestRouting = {
  handling: 'route' | 'clarify' | 'multiple_routes' | 'out_of_scope' | 'urgent_bypass';
  department: RoutingDepartment | null;
  candidates: { department: RoutingDepartment; score: number | null }[];
  message: string;
  model_version: string;
  source: 'classifier' | 'boundary_rule';
  synthetic_only: true;
  submitted: false;
};

export type AcademicCitation = { course_id: string; syllabus_id: string; passage_id: string; page: number | null; excerpt: string; path: string };

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant' | (string & {});
  content: string;
  created_at: string;
  sources?: Citation[];
  /** Missing on older deployments and history; treat as empty. */
  event_cards?: EventCard[];
  routing?: RequestRouting | null;
  academic_citations?: AcademicCitation[];
};

export type TagSuggestion = { tag_id: string; score: number; source: string };

export type TagSuggestResponse = {
  prediction_id: string;
  taxonomy_version: string;
  model_version: string;
  status: string;
  suggestions: TagSuggestion[];
  optional?: TagSuggestion[];
  user_corrected?: boolean;
  corrected_tag_ids?: string[];
};
