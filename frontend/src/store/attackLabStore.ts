import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AttackLabState {
  isRunnerActive: boolean;
  runnerMode: 'all-remaining' | 'rerun-all' | null;
  setRunnerActive: (active: boolean, mode: 'all-remaining' | 'rerun-all' | null) => void;
}

export const useAttackLabStore = create<AttackLabState>()(
  persist(
    (set) => ({
      isRunnerActive: false,
      runnerMode: null,
      setRunnerActive: (active, mode) => set({ isRunnerActive: active, runnerMode: mode }),
    }),
    {
      name: 'tejas_attack_lab_runner',
    }
  )
);
