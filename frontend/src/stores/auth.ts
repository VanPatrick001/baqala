import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
  preferredLanguage: 'en' | 'ur' | 'ar';
  mustChangePassword: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'baqala.auth' },
  ),
);

/** Même logique que le backend : '*' ou 'domaine.*' ou permission exacte. */
export function can(user: User | null, ...permissions: string[]) {
  if (!user) return false;
  return permissions.some((perm) => {
    const [domain] = perm.split('.');
    return user.permissions.some((p) => p === '*' || p === perm || p === `${domain}.*`);
  });
}

export const useCan = (...permissions: string[]) => can(useAuth((s) => s.user), ...permissions);
