import { create } from 'zustand';

import { seedHousingRequests } from '@/data/services';
import type { HousingRequest, HousingStatus } from '@/types';
import { showToast } from './toast-store';

export type NewHousingRequest = Pick<HousingRequest, 'description' | 'category' | 'destination' | 'attachment'> & {
  building: string;
  room: string;
};

type HousingState = {
  requests: HousingRequest[];
  nextNumber: number;
  submit: (draft: NewHousingRequest) => string;
  setStatus: (id: string, status: HousingStatus) => void;
  addUpdate: (id: string, text: string) => void;
};

const patch = (requests: HousingRequest[], id: string, change: Partial<HousingRequest>) =>
  requests.map((request) => (request.id === id ? { ...request, ...change } : request));

export const useHousingStore = create<HousingState>((set, get) => ({
  requests: seedHousingRequests,
  nextNumber: 1051,

  submit: (draft) => {
    const id = `H-${get().nextNumber}`;
    const request: HousingRequest = {
      id,
      title: draft.description || 'Submitted demo issue',
      description: draft.description,
      status: 'Submitted',
      category: draft.category,
      destination: draft.destination,
      location: `${draft.building} · Room ${draft.room} · Demo`,
      attachment: draft.attachment,
      updates: [],
    };
    set((state) => ({ requests: [...state.requests, request], nextNumber: state.nextNumber + 1 }));
    return id;
  },

  setStatus: (id, status) => {
    const previous = get().requests.find((request) => request.id === id)?.status;
    if (!previous) return;
    set((state) => ({ requests: patch(state.requests, id, { status }) }));
    showToast(`${id} marked ${status.toLowerCase()}`, () =>
      set((state) => ({ requests: patch(state.requests, id, { status: previous }) })),
    );
  },

  addUpdate: (id, text) => {
    const request = get().requests.find((item) => item.id === id);
    if (!request) return;
    set((state) => ({ requests: patch(state.requests, id, { updates: [...request.updates, text] }) }));
    showToast('Update added', () => set((state) => ({ requests: patch(state.requests, id, { updates: request.updates }) })));
  },
}));
