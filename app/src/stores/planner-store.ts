import { create } from 'zustand';

import { successFeedback } from '@/utils/haptics';
import { showToast } from './toast-store';

type PlannerState = {
  plannedOpenHouseIds: string[];
  joinedClubIds: string[];
  deadlineExtracted: boolean;
  toggleOpenHouse: (clubId: string) => void;
  joinClub: (clubId: string) => void;
  toggleDeadline: () => void;
};

const without = (list: string[], id: string) => list.filter((item) => item !== id);

export const usePlannerStore = create<PlannerState>((set, get) => ({
  plannedOpenHouseIds: [],
  joinedClubIds: [],
  deadlineExtracted: false,

  toggleOpenHouse: (clubId) => {
    const planned = get().plannedOpenHouseIds.includes(clubId);
    const apply = (add: boolean) =>
      set((state) => ({
        plannedOpenHouseIds: add ? [...without(state.plannedOpenHouseIds, clubId), clubId] : without(state.plannedOpenHouseIds, clubId),
      }));
    apply(!planned);
    if (!planned) successFeedback();
    showToast(planned ? 'Open house removed from Calendar' : 'Open house added to Calendar', () => apply(planned));
  },

  joinClub: (clubId) => {
    set((state) => ({ joinedClubIds: [...without(state.joinedClubIds, clubId), clubId] }));
    successFeedback();
    showToast('Joined Data Science Association', () =>
      set((state) => ({ joinedClubIds: without(state.joinedClubIds, clubId) })),
    );
  },

  toggleDeadline: () => {
    const extracted = get().deadlineExtracted;
    set({ deadlineExtracted: !extracted });
    showToast(extracted ? 'Deadline removed from Calendar' : 'Deadline added to Calendar', () =>
      set({ deadlineExtracted: extracted }),
    );
  },
}));
