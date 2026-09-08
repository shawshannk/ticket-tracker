import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * R10 — the prototype's client-only view preferences, carried over. Deliberately *not*
 * persisted server-side and not in the URL: they're per-person display choices, unlike the
 * filters in spec 03/04 which do belong in the URL so a view stays shareable.
 */
export type Density = 'comfortable' | 'compact';
export type TagStyle = 'colorful' | 'neutral';

interface ViewPrefsState {
  /** Row padding on the tickets list (spec 03). */
  density: Density;
  /** Show the Epic ▸ Story breadcrumb on list/board rows. */
  showHierarchy: boolean;
  /** Colored label chips vs a single neutral chip. */
  tagStyle: TagStyle;
  setDensity: (density: Density) => void;
  setShowHierarchy: (showHierarchy: boolean) => void;
  setTagStyle: (tagStyle: TagStyle) => void;
}

export const useViewPrefs = create<ViewPrefsState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      showHierarchy: true,
      tagStyle: 'colorful',
      setDensity: (density) => set({ density }),
      setShowHierarchy: (showHierarchy) => set({ showHierarchy }),
      setTagStyle: (tagStyle) => set({ tagStyle }),
    }),
    { name: 'ticket-tracker.view-prefs' },
  ),
);
