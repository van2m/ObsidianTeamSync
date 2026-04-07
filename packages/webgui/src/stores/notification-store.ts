import { create } from 'zustand';

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning';
  timestamp: number;
}

interface NotificationState {
  notifications: Notification[];
  push: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismiss: (id: string) => void;
}

let nextId = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  push: (n) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...n, id: String(++nextId), timestamp: Date.now() },
      ].slice(-10), // Keep last 10
    })),
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
