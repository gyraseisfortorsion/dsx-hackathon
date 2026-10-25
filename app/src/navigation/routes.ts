import { router, type Href } from 'expo-router';


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
  // POP_TO is a stack action; tab roots need normal navigation instead.
  if (router.canDismiss()) {
    router.dismissTo(TAB_HREFS[tab]);
  } else {
    router.navigate(TAB_HREFS[tab]);
  }
}

export function openAsk(prompt?: string) {
  router.push(prompt ? { pathname: '/ask', params: { prompt } } : '/ask');
}

/** Confirms before handing off to an official BU website. */
export function openExternal(id: string) {
  router.push({ pathname: '/external/[id]', params: { id } });
}
