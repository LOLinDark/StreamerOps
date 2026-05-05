/**
 * App Store — global UI state with localStorage persistence.
 *
 * Replaces: DevContext, manual localStorage for colorScheme/devMode.
 * Uses zustand persist middleware — state survives page reloads automatically.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

let activitySequence = 0;
const envDevModeDefault = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE_DEFAULT === 'true' || import.meta.env.VITE_DEV_MODE_DEFAULT === '1';

function createActivityId() {
  activitySequence += 1;
  return `${Date.now()}-${activitySequence}`;
}

const useAppStore = create(
  persist(
    (set) => ({
      colorScheme: 'dark',
      devMode: envDevModeDefault,
      // In development, default to true so we don't have to log in every time
      welcomeCompleted: import.meta.env.DEV ? true : false,

      setColorScheme: (scheme) => set({ colorScheme: scheme }),
      toggleColorScheme: () => set((s) => ({ colorScheme: s.colorScheme === 'dark' ? 'light' : 'dark' })),
      setDevMode: (enabled) => set({ devMode: Boolean(enabled) }),
      toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),
      completeWelcome: () => set({ welcomeCompleted: true }),
      resetWelcome: () => set({ welcomeCompleted: false }),

      // Dev activity log (not persisted — see partialize below)
      activities: [],
      logActivity: (type, details) => set((s) => ({
        activities: [
          { id: createActivityId(), timestamp: new Date().toLocaleTimeString(), type, details },
          ...s.activities
        ].slice(0, 50)
      })),
    }),
    {
      name: 'omni-core-app',
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState || {}),
        };

        // Optional local override keeps dev mode on in your own environment.
        if (envDevModeDefault) {
          merged.devMode = true;
        }

        return merged;
      },
      // Only persist these keys — activities are ephemeral
      partialize: (state) => ({
        colorScheme: state.colorScheme,
        devMode: state.devMode,
        welcomeCompleted: state.welcomeCompleted,
      }),
    }
  )
);

export default useAppStore;
