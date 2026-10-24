import type {
  ExternalLink,
  GuideEntry,
  HousingRequest,
  PriorTimesheet,
  SettingsPage,
  Shift,
  Transaction,
} from '@/types';

export const BU_LINKS = {
  terrierWeb: 'https://terrier-web.bu.edu/StudentPortal',
  get: 'https://get.cbord.com/bu/full/prelogin.php',
  myHousing: 'https://bu.starrezhousing.com/StarRezPortalX',
  buPolice: 'https://www.bu.edu/police/',
  myBu: 'https://mybu.bu.edu/',
} as const;

export const PHONE = {
  emergency: '911',
  bupd: '+16173532121',
  facilities: '+16173532105',
  medicalCampus: '+16173584144',
  realEstate: '+16173534102',
} as const;

/* Dining */

export const transactions: Transaction[] = [
  { id: 'gsu-starbucks', merchant: 'GSU Starbucks', meta: 'Today, 8:42 AM · Dining Points', amount: '−$6.25', source: 'Dining Points' },
  { id: 'city-convenience', merchant: 'City Convenience', meta: 'Monday, 7:18 PM · Dining Points', amount: '−$12.40', source: 'Dining Points' },
  { id: 'warren-laundry', merchant: 'Warren Towers Laundry', meta: 'Sunday, 2:06 PM · Convenience Points', amount: '−$3.50', source: 'Convenience Points' },
];

/* Housing */

export const residence = { building: 'Warren Towers A', room: '814', office: 'Residence Life Office' };

export const HOUSING_CATEGORIES = [
  'Plumbing',
  'Heating & Cooling',
  'Electrical',
  'Furniture / Appliance / Key',
  'Pest',
  'Cleaning / Common Area',
  'Roommate / Community',
  'Safety / Security',
  'Other',
] as const;

export const HOUSING_URGENCIES = ['Routine', 'Urgent', 'Emergency'] as const;
export const HOUSING_TIMES = ['Weekday morning', 'Weekday afternoon', 'Any time'] as const;
export const HOUSING_TIMELINE = ['Submitted', 'Routed', 'Assigned', 'Scheduled / In progress', 'Resolved'] as const;
export const HOUSING_EXAMPLES = ['Radiator is noisy', 'Sink is leaking', 'Desk drawer is broken', 'Roommate noise concern'];
export const HOUSING_DEMO_FILES = [
  { name: 'radiator.jpg', size: '2.4 MB', tooLarge: false },
  { name: 'large-video.png', size: '31 MB', tooLarge: true },
];

export const seedHousingRequests: HousingRequest[] = [
  {
    id: 'H-1048',
    title: 'Heating noise',
    description: 'The radiator makes a knocking sound during the evening.',
    status: 'Assigned',
    category: 'Heating & Cooling',
    destination: 'Residence Life / Facilities',
    location: 'Warren Towers A · Room 814 · Demo',
    updates: [],
  },
  {
    id: 'H-1032',
    title: 'Desk drawer repair',
    description: 'The upper desk drawer does not close.',
    status: 'Resolved',
    category: 'Furniture / Appliance / Key',
    destination: 'My Housing',
    location: 'Warren Towers A · Room 814 · Demo',
    updates: [],
  },
];

export const housingContacts = {
  residences: [
    { label: 'CRC / Fenway Facilities', value: '617-353-2105', href: `tel:${PHONE.facilities}` },
    { label: 'Medical Campus', value: '617-358-4144', href: `tel:${PHONE.medicalCampus}` },
    { label: 'My Housing', value: 'Official portal ↗', href: BU_LINKS.myHousing },
  ],
  realEstate: [{ label: 'BU Real Estate', value: '617-353-4102', href: `tel:${PHONE.realEstate}` }],
};

export const emergencyCalls = [
  { label: 'Call 911', href: `tel:${PHONE.emergency}` },
  { label: 'Call BUPD · 617-353-2121', href: `tel:${PHONE.bupd}` },
  { label: 'Call Facilities · 617-353-2105', href: `tel:${PHONE.facilities}` },
];

/* Work */

export const job = {
  status: 'ACTIVE · HOURLY · DEMO JOB',
  title: 'Student Assistant',
  meta: 'BU Spark! · Supervisor Jordan Lee · Demo',
  supervisor: 'Jordan Lee',
  currentWeek: 'Oct 14–20',
  dueLabel: 'Due Sunday 11:59 PM',
};

export const SHIFT_DATES = ['Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19', 'Oct 20'] as const;

export const seedShifts: Shift[] = [
  { id: 's1', date: 'Oct 14', start: '10:00', end: '12:30', breakMin: 0, hours: 2.5, note: '' },
  { id: 's2', date: 'Oct 16', start: '13:00', end: '16:00', breakMin: 0, hours: 3, note: '' },
  { id: 's3', date: 'Oct 18', start: '13:00', end: '16:00', breakMin: 0, hours: 3, note: '' },
];

export const priorTimesheets: PriorTimesheet[] = [
  { id: 'oct-7', week: 'Oct 7–13', status: 'Approved', hours: 11 },
  { id: 'sep-30', week: 'Sep 30–Oct 6', status: 'Paid', hours: 9.5 },
];

export const pay = { nextPayday: 'Fri Oct 25', lastPayment: '$186.42', lastPaymentDate: 'Oct 18', ytd: '$2,148.70' };

export const workPrompts = [
  'Why is my timesheet awaiting approval?',
  'Explain gross vs net pay',
  'What do I need before my first shift?',
];

export const employmentChecklist: GuideEntry[] = [
  { id: 'jobx', title: 'JobX hire confirmed', status: 'Complete · Demo', copy: 'JobX confirms the demo hire.' },
  {
    id: 'i9',
    title: 'Form I-9 completed',
    status: 'Complete · Demo',
    copy: 'Form I-9 must be completed before starting work. International students should use ISSO guidance where applicable.',
  },
  {
    id: 'tax',
    title: 'Tax withholding review',
    status: 'Review suggested · Demo',
    copy: 'Use official BU resources; BU One does not provide personalized tax advice.',
  },
  { id: 'deposit', title: 'Direct deposit authorization', status: 'Complete · Demo', copy: 'Verify authorization for every new position.' },
  {
    id: 'confidentiality',
    title: 'Confidentiality acknowledgement',
    status: 'Complete where applicable · Demo',
    copy: 'Some positions require a role-specific acknowledgement.',
  },
];

export const workGuides: GuideEntry[] = [
  ...employmentChecklist,
  {
    id: 'supervisor',
    title: 'Contact supervisor',
    copy: 'Jordan Lee · Demo supervisor. BU One cannot approve or alter an official timesheet.',
  },
  {
    id: 'ai-check',
    title: 'AI check · Demo',
    copy: 'No overlaps found. Friday’s shift overlaps a visible 1:00 PM study block; verify the calendar context. AI did not add, infer, release, or approve hours.',
  },
];

export const externalLinks = {
  jobs: {
    title: 'Find student jobs',
    copy: 'Continue to BU’s public JobX Student Job Board information. “Work-Study Preferred” does not mean every job is work-study.',
    url: 'https://www.bu.edu/seo/student-job-board/',
  },
  employmentHelp: {
    title: 'Student Employment help',
    copy: 'Continue to BU Student Employment public resources.',
    url: 'https://www.bu.edu/seo/',
  },
  timesheetGuidance: {
    title: 'Timesheet guidance',
    copy: 'Continue to official BU timesheet guidance. Holiday weeks may have earlier deadlines.',
    url: 'https://www.bu.edu/seo/getting-paid/timesheets/',
  },
  salaryStatements: {
    title: 'Salary statements',
    copy: 'Continue to BU Employee Self-Service to view official salary statements. BU One does not fabricate or store them.',
    url: BU_LINKS.myBu,
  },
  directDeposit: {
    title: 'Manage direct deposit securely',
    copy: 'BU One does not store banking details. Continue to MyBU Employee Self-Service → Direct Deposit Authorization.',
    url: 'https://www.bu.edu/seo/getting-paid/direct-deposit/',
  },
  employmentResource: {
    title: 'Student Employment resource',
    copy: 'Continue to an official BU Student Employment public resource.',
    url: 'https://www.bu.edu/seo/',
  },
} satisfies Record<string, ExternalLink>;

export type ExternalLinkId = keyof typeof externalLinks;

/* Preferences & settings */

export const settingsPages: SettingsPage[] = [
  {
    id: 'academic-calendar',
    title: 'Academic Calendar',
    intro: 'Official academic-calendar context presented as demo data.',
    rows: ['Indigenous Peoples’ Day', 'Classes suspended', 'Confirm dates at BU Academics'],
  },
  { id: 'edit-profile', title: 'Edit Profile', intro: 'Update demo profile information for this prototype session.', rows: ['Maya Chen', 'CAS ’27', 'Computer Science'] },
  {
    id: 'sign-out',
    title: 'Sign Out',
    intro: 'This prototype uses a local demo session and has no live BU account.',
    rows: ['No account credentials are stored', 'Closing the prototype ends the session'],
  },
  {
    id: 'map-transit',
    title: 'Map & Transit',
    intro: 'Campus routes, accessibility information, and live service links.',
    rows: ['BU Shuttle status · Demo connection', 'Step-free route preferences', 'Open campus map'],
  },
  {
    id: 'campus-resources',
    title: 'Campus Resources',
    intro: 'Quick access to frequently used student support services.',
    rows: ['Academic advising', 'Student Health Services', 'Dean of Students'],
  },
  {
    id: 'safety-emergency',
    title: 'Safety & Emergency',
    intro: 'Preparedness and help resources for the BU community.',
    rows: ['BU Police · 617-353-2121', 'Emergency guidance', 'Safety escort information'],
    link: { label: 'Open BU Police public resources ↗', url: BU_LINKS.buPolice },
  },
  {
    id: 'data-connections',
    title: 'Data Connections',
    intro: 'Review the demo sources BU One uses to personalize your experience.',
    rows: ['BU Student Prototype API · Connected', 'BU events · Student API', 'Calendar · From student API'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    intro: 'Choose which useful updates BU One can surface.',
    rows: [],
    toggles: ['Class reminders', 'Saved event updates', 'Club activity'],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    intro: 'Set preferences that apply throughout BU One.',
    rows: [],
    toggles: ['Step-free routes', 'Reduced motion', 'Larger text'],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    intro: 'You control which personal context BU One can use.',
    rows: ['Grades · Face ID protected', 'Personalization · On device demo', 'Clear demo history'],
  },
  {
    id: 'help-feedback',
    title: 'Help & Feedback',
    intro: 'Find support or share feedback about this prototype.',
    rows: ['BU IT Help Center', 'Report an accessibility issue', 'Send prototype feedback'],
  },
];

export const defaultToggles: Record<string, boolean> = {
  'Class reminders': true,
  'Saved event updates': true,
  'Club activity': false,
  'Step-free routes': true,
  'Reduced motion': false,
  'Larger text': false,
};
