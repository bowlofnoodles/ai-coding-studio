import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userId: number | null;
  username: string | null;
  setUser: (userId: number, username: string) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      setUser: (userId, username) => set({ userId, username }),
      clearUser: () => set({ userId: null, username: null }),
    }),
    {
      name: 'ai-coding-studio-user',
    },
  ),
);
