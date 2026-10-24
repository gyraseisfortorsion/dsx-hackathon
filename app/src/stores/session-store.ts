import { create } from 'zustand';

import { queryClient } from '@/api/query-client';
import { DEMO_USERS, type DemoUser } from '@/api/types';
import { kvStorage } from '@/utils/kv-storage';
import { useAcademicsStore } from './academics-store';
import { useEventBrowseStore } from './event-browse-store';
import { useHousingStore } from './housing-store';
import { usePlannerStore } from './planner-store';
import { usePreferencesStore } from './preferences-store';
import { useToastStore } from './toast-store';
import { useWorkStore } from './work-store';

const USER_KEY = 'bu-one.user';

const isDemoUser = (value: string | null): value is DemoUser => DEMO_USERS.includes(value as DemoUser);

/** Local demo state is per student, so it must not leak into the next session. */
function resetUserScopedState() {
  const reset = <S>(store: { setState: (state: S, replace: true) => void; getInitialState: () => S }) =>
    store.setState(store.getInitialState(), true);
  reset(usePlannerStore);
  reset(usePreferencesStore);
  reset(useAcademicsStore);
  reset(useHousingStore);
  reset(useWorkStore);
  reset(useEventBrowseStore);
  reset(useToastStore);
  // Cancels in-flight requests for the previous student before dropping their cache.
  void queryClient.cancelQueries();
  queryClient.clear();
}

type SessionState = {
  user: DemoUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (user: DemoUser) => void;
  signOut: () => void;
};

export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const stored = await kvStorage.get(USER_KEY);
      set({ user: isDemoUser(stored) ? stored : null, hydrated: true });
    } catch {
      set({ user: null, hydrated: true });
    }
  },
  signIn: (user) => {
    resetUserScopedState();
    set({ user });
    void kvStorage.set(USER_KEY, user);
  },
  signOut: () => {
    set({ user: null });
    resetUserScopedState();
    void kvStorage.remove(USER_KEY);
  },
}));

/** Null only briefly while signing out, before the session guard unmounts protected screens. */
export function useCurrentUser() {
  return useSessionStore((state) => state.user);
}
