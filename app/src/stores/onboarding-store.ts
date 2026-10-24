import { create } from 'zustand';

import type { DemoUser } from '@/api/types';
import { kvStorage } from '@/utils/kv-storage';

const keyFor = (user: DemoUser) => `bu-one.onboarding.${user}`;

type OnboardingStatus = 'pending' | 'done';

type OnboardingState = {
  /** Per student on this device; kept across sign-outs so onboarding is offered only once. */
  status: Partial<Record<DemoUser, OnboardingStatus>>;
  load: (user: DemoUser) => Promise<void>;
  markDone: (user: DemoUser) => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  status: {},
  load: async (user) => {
    let done = false;
    try {
      done = (await kvStorage.get(keyFor(user))) === 'done';
    } catch {}
    set((state) => (state.status[user] === 'done' ? state : { status: { ...state.status, [user]: done ? 'done' : 'pending' } }));
  },
  markDone: (user) => {
    set((state) => ({ status: { ...state.status, [user]: 'done' } }));
    void kvStorage.set(keyFor(user), 'done').catch(() => {});
  },
}));
