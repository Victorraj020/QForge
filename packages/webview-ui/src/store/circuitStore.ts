/**
 * @file circuitStore.ts
 * @description Zustand store for circuit data.
 *
 * Single slice for CircuitIR and AnalysisResult.
 * Store contains state only — no side effects, no async operations.
 */

import { create } from 'zustand';
import type { CircuitIR } from '@shared/CircuitIR';
import type { AnalysisResult } from '@shared/AnalysisResult';
import type { ExecutionResult, DebugResult } from '@shared/plugins';

interface CircuitState {
  circuit: CircuitIR | null;
  analysis: AnalysisResult | null;
  simulationResult: ExecutionResult | null;
  isSimulating: boolean;
  debugResult: DebugResult | null;
  currentStepIndex: number;
  isPlayMode: boolean;
  setCircuit(circuit: CircuitIR): void;
  setAnalysis(analysis: AnalysisResult): void;
  setSimulationResult(result: ExecutionResult | null): void;
  setIsSimulating(simulating: boolean): void;
  setDebugResult(result: DebugResult | null): void;
  setCurrentStepIndex(index: number): void;
  setIsPlayMode(play: boolean): void;
  reset(): void;
}

export const useCircuitStore = create<CircuitState>((set) => ({
  circuit: null,
  analysis: null,
  simulationResult: null,
  isSimulating: false,
  debugResult: null,
  currentStepIndex: 0,
  isPlayMode: false,

  setCircuit: (circuit) => set({ circuit }),

  setAnalysis: (analysis) =>
    set((state) => ({
      analysis,
      // Analysis always includes the most up-to-date circuit IR
      circuit: analysis.circuit ?? state.circuit,
    })),

  setSimulationResult: (simulationResult) => set({ simulationResult }),
  setIsSimulating: (isSimulating) => set({ isSimulating }),

  setDebugResult: (debugResult) => set({ debugResult, currentStepIndex: 0 }),
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),
  setIsPlayMode: (isPlayMode) => set({ isPlayMode }),

  reset: () =>
    set({
      circuit: null,
      analysis: null,
      simulationResult: null,
      isSimulating: false,
      debugResult: null,
      currentStepIndex: 0,
      isPlayMode: false,
    }),
}));
