/** Labels from the API taxonomy (`taxonomy.v1.json`). Do not invent ids. */
export const TAG_NAMES: Record<string, string> = {
  academic: 'Academic & Study',
  career: 'Career & Professional',
  tech: 'Technology & Computing',
  'arts-culture': 'Arts & Culture',
  'sports-recreation': 'Sports & Recreation',
  'wellness-health': 'Wellness & Health',
  'community-service': 'Community Service & Giving',
  'cultural-identity': 'Cultural & Identity',
  workshop: 'Workshop / Training',
  'talk-panel': 'Talk / Panel / Lecture',
  social: 'Social / Mixer',
  performance: 'Performance / Showcase',
  'free-food': 'Free Food',
  networking: 'Networking',
};

export const TAG_IDS = Object.keys(TAG_NAMES);

export const tagLabel = (id: string) => TAG_NAMES[id] ?? id.replace(/-/g, ' ');

export const eventTagIds = (tags?: Record<string, number | null> | null) => Object.keys(tags ?? {});
