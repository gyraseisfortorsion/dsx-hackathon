import { router, type Href } from 'expo-router';

import type { ExternalLinkId } from '@/data/services';

export const TAB_HREFS = {
  today: '/',
  calendar: '/calendar',
  events: '/events',
  chats: '/chats',
  me: '/me',
} as const satisfies Record<string, Href>;

export type TabName = keyof typeof TAB_HREFS;

/** Switches tabs from anywhere, closing any detail screens stacked above the tab bar. */
export function goToTab(tab: TabName) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(TAB_HREFS[tab]);
}

export function openAsk(prompt?: string) {
  router.push(prompt ? { pathname: '/ask', params: { prompt } } : '/ask');
}

/** Confirms before handing off to an official BU website. */
export function openExternal(id: ExternalLinkId) {
  router.push({ pathname: '/external/[id]', params: { id } });
}
