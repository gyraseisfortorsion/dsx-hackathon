/** Chat list filters. Thread data comes from GET /chats. */
export const CHAT_FILTERS = ['All', 'Classes', 'Clubs', 'DMs'] as const;
export type ChatFilter = (typeof CHAT_FILTERS)[number];
