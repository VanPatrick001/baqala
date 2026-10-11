import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  key: string; // clé i18n
  params?: Record<string, unknown>;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (key: string, params?: Record<string, unknown>) => useToast.getState().push({ kind: 'success', key, params }),
  error: (key: string, params?: Record<string, unknown>) => useToast.getState().push({ kind: 'error', key, params }),
  info: (key: string, params?: Record<string, unknown>) => useToast.getState().push({ kind: 'info', key, params }),
};
