import { create } from 'zustand';

type Toast = { id: number; message: string; undo?: () => void };

type ToastState = {
  toast: Toast | null;
  show: (message: string, undo?: () => void) => void;
  dismiss: () => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (message, undo) => set({ toast: { id: nextId++, message, undo } }),
  dismiss: () => set({ toast: null }),
}));

/** Shows an undo toast from outside React (stores, event handlers). */
export const showToast = (message: string, undo?: () => void) => useToastStore.getState().show(message, undo);
