import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Who the app is currently "acting as" (spec 08). UI-only client state — not server state —
 * so it lives here rather than in TanStack Query. Persisted so a refresh doesn't reset you to
 * nobody, which would make every mutation fail until you re-picked.
 *
 * This is role *simulation*, not authentication: the id is self-reported and unverified.
 */
interface ActingUserState {
  actingUserId: string | null;
  setActingUser: (id: string) => void;
}

export const useActingUserStore = create<ActingUserState>()(
  persist(
    (set) => ({
      actingUserId: null,
      setActingUser: (id) => set({ actingUserId: id }),
    }),
    { name: 'ticket-tracker.acting-user' },
  ),
);

export const useActingUserId = () => useActingUserStore((s) => s.actingUserId);
