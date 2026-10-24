import type { ChatThread, Club } from '@/types';

export const clubs: Club[] = [
  {
    id: 'data-science-association',
    initials: 'DS',
    name: 'Data Science Association',
    tagline: 'Build skills, meet peers, and explore data for social impact.',
    about:
      'Weekly workshops, project teams, alumni talks, and a welcoming place to learn with real BU datasets.',
    tags: ['Technology', 'Career', 'Community'],
    stats: [
      { value: '240', label: 'members' },
      { value: 'Tuesdays', label: 'weekly meetings' },
      { value: 'All levels', label: 'welcome' },
    ],
    openHouse: {
      title: 'Data Science Association Open House',
      time: '6:00 PM',
      timeShort: '6:00',
      place: 'CDS 1646',
    },
  },
];

export const chatThreads: ChatThread[] = [
  {
    id: 'cs-210',
    kind: 'class',
    title: 'CAS CS 210 A1',
    avatar: 'CS',
    preview: 'Nora: Review sheet is pinned',
    lastActivity: '9:42',
    notice: 'Course chat · Academic integrity rules apply',
    pinned: {
      label: 'PINNED · TA NORA',
      title: 'Midterm review sheet is posted',
      body: 'Office hours moved to CDS 1301 today.',
    },
    messages: [
      { id: 'm1', author: 'Jamie', time: '9:38 AM', body: 'Does anyone want to compare practice problem 4?' },
      { id: 'm2', body: 'I’m free at Mugar around 1.', fromMe: true },
      { id: 'm3', author: 'Sam', time: '9:42 AM', body: 'I’ll join. Fourth floor?' },
    ],
  },
  {
    id: 'data-science-association',
    kind: 'club',
    title: 'Data Science Association',
    avatar: 'DS',
    preview: 'Open house tonight at CDS',
    lastActivity: '8:18',
    notice: 'Club chat · 42 members online',
    opensClubId: 'data-science-association',
    messages: [
      { id: 'm1', author: 'Priya', time: '4:12 PM', body: 'Welcome! Tonight’s open house starts at 6 in CDS 1646.' },
      { id: 'm2', author: 'Alex', time: '4:18 PM', body: 'We’re saving a few seats for first-time members.' },
    ],
  },
  {
    id: 'bu-spark',
    kind: 'club',
    title: 'BU Spark!',
    avatar: 'S!',
    preview: 'AI Forum attendee chat',
    lastActivity: 'Yesterday',
    notice: 'Club chat · 42 members online',
    messages: [
      { id: 'm1', author: 'Priya', time: '4:12 PM', body: 'Welcome! Tonight’s open house starts at 6 in CDS 1646.' },
      { id: 'm2', author: 'Alex', time: '4:18 PM', body: 'We’re saving a few seats for first-time members.' },
    ],
  },
  {
    id: 'jamie-lee',
    kind: 'dm',
    title: 'Jamie Lee',
    avatar: 'JL',
    preview: 'Want to study after lecture?',
    lastActivity: 'Mon',
    messages: [
      { id: 'm1', author: 'Jamie', time: 'Monday', body: 'Want to study after lecture?' },
      { id: 'm2', body: 'Yes — Mugar at 1 works.', fromMe: true },
    ],
  },
];

export const CHAT_FILTERS = ['All', 'Classes', 'Clubs', 'DMs'] as const;
export type ChatFilter = (typeof CHAT_FILTERS)[number];
