import { create } from 'zustand';

import { seedShifts } from '@/data/services';
import type { Shift } from '@/types';
import { showToast } from './toast-store';

type WorkState = {
  shifts: Shift[];
  released: boolean;
  payVisible: boolean;
  saveShift: (shift: Omit<Shift, 'id'>, id?: string) => void;
  deleteShift: (id: string) => void;
  release: () => void;
  setPayVisible: (value: boolean) => void;
};

let shiftCounter = seedShifts.length;

export const useWorkStore = create<WorkState>((set, get) => ({
  shifts: seedShifts,
  released: false,
  payVisible: false,

  saveShift: (shift, id) =>
    set((state) => ({
      shifts: id
        ? state.shifts.map((item) => (item.id === id ? { ...shift, id } : item))
        : [...state.shifts, { ...shift, id: `s${++shiftCounter}` }],
    })),

  deleteShift: (id) => {
    const previous = get().shifts;
    set({ shifts: previous.filter((item) => item.id !== id) });
    showToast('Shift deleted', () => set({ shifts: previous }));
  },

  release: () => set({ released: true }),
  setPayVisible: (payVisible) => set({ payVisible }),
}));
