import { create } from 'zustand';

import { defaultToggles } from '@/data/services';
import { showToast } from './toast-store';

/** Device-only settings. Event interests and goals live on the backend (see `api/events.ts`). */
type PreferencesState = {
  vegetarian: boolean;
  stepFree: boolean;
  toggles: Record<string, boolean>;
  menuHintVisible: boolean;
  setVegetarian: (value: boolean) => void;
  setStepFree: (value: boolean) => void;
  saveToggles: (next: Record<string, boolean>) => void;
  dismissMenuHint: () => void;
};

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  vegetarian: true,
  stepFree: true,
  toggles: defaultToggles,
  menuHintVisible: true,

  setVegetarian: (vegetarian) => set({ vegetarian }),
  setStepFree: (stepFree) => set({ stepFree }),
  saveToggles: (next) => {
    const previous = get().toggles;
    set({ toggles: next });
    showToast('Settings saved', () => set({ toggles: previous }));
  },
  dismissMenuHint: () => set({ menuHintVisible: false }),
}));
