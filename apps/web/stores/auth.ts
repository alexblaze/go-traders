import { create } from 'zustand';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
}

interface AuthState {
  /** Short-lived access token kept in memory only (never localStorage). */
  accessToken: string | null;
  user: SessionUser | null;
  initialized: boolean;
  setSession: (token: string, user: SessionUser) => void;
  clear: () => void;
  markInitialized: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  initialized: false,
  setSession: (accessToken, user) => set({ accessToken, user, initialized: true }),
  clear: () => set({ accessToken: null, user: null, initialized: true }),
  markInitialized: () => set({ initialized: true }),
}));
