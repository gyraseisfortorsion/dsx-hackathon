export type Club = {
  id: string;
  initials: string;
  name: string;
  tagline: string;
  about: string;
  tags: string[];
  stats: { value: string; label: string }[];
  openHouse: { title: string; time: string; timeShort: string; place: string };
};

export type ChatMessage = {
  id: string;
  author?: string;
  time?: string;
  body: string;
  fromMe?: boolean;
};

export type ChatKind = 'class' | 'club' | 'event' | 'dm';

export type ChatThread = {
  id: string;
  kind: ChatKind;
  title: string;
  avatar: string;
  preview: string;
  lastActivity: string;
  notice?: string;
  pinned?: { label: string; title: string; body: string };
  messages: ChatMessage[];
  /** When set, the chat list opens this club's profile instead of the thread. */
  opensClubId?: string;
};

export type AgendaKind = 'class' | 'travel' | 'dining' | 'deadline' | 'event' | 'academic' | 'check';

export type Transaction = {
  id: string;
  merchant: string;
  meta: string;
  amount: string;
  source: 'Dining Points' | 'Convenience Points';
};

export type HousingUrgency = 'Routine' | 'Urgent' | 'Emergency';
export type HousingStatus = 'Submitted' | 'Routed' | 'Assigned' | 'Scheduled / In progress' | 'Resolved';

export type HousingRequest = {
  id: string;
  title: string;
  description: string;
  status: HousingStatus;
  category: string;
  destination: string;
  location: string;
  attachment?: string;
  updates: string[];
};

export type HousingRouting = {
  category: string;
  urgency: HousingUrgency;
  destination: string;
  reason: string;
};

export type Shift = {
  id: string;
  date: string;
  start: string;
  end: string;
  breakMin: number;
  hours: number;
  note: string;
};

export type TimesheetStatus = 'Draft' | 'Awaiting supervisor' | 'Approved' | 'Paid';

export type PriorTimesheet = {
  id: string;
  week: string;
  status: TimesheetStatus;
  hours: number;
};

export type GuideEntry = { id: string; title: string; status?: string; copy: string };

export type ExternalLink = { title: string; copy: string; url: string };

export type SettingsPage = {
  id: string;
  title: string;
  intro: string;
  rows: string[];
  toggles?: string[];
  link?: { label: string; url: string };
};
