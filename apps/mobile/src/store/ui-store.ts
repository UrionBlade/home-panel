import { create } from "zustand";

interface UiState {
  /** Modal/dialog correntemente aperto (id univoco). */
  openModal: string | null;
  openModalFor: (id: string) => void;
  closeModal: () => void;

  /** Toast queue effimero. */
  toasts: Array<{ id: string; tone: "info" | "success" | "danger"; text: string }>;
  pushToast: (toast: { tone: "info" | "success" | "danger"; text: string }) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  openModal: null,
  openModalFor: (id) => set({ openModal: id }),
  closeModal: () => set({ openModal: null }),

  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Math.random().toString(36).slice(2) }],
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
