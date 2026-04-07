import { create } from 'zustand';
import type { UserPresenceData } from '@ots/shared';

interface PresenceState {
  users: Map<string, UserPresenceData>;
  addUser: (data: UserPresenceData) => void;
  removeUser: (userId: string) => void;
  updateEditing: (userId: string, editingNotePath?: string) => void;
  clear: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  users: new Map(),
  addUser: (data) =>
    set((state) => {
      const next = new Map(state.users);
      next.set(data.userId, data);
      return { users: next };
    }),
  removeUser: (userId) =>
    set((state) => {
      const next = new Map(state.users);
      next.delete(userId);
      return { users: next };
    }),
  updateEditing: (userId, editingNotePath) =>
    set((state) => {
      const user = state.users.get(userId);
      if (!user) return state;
      const next = new Map(state.users);
      next.set(userId, { ...user, editingNotePath });
      return { users: next };
    }),
  clear: () => set({ users: new Map() }),
}));
