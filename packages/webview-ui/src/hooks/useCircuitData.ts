/**
 * @file useCircuitData.ts
 * @description React hook that subscribes to circuit and analysis data from the extension host.
 *
 * Listens to ExtensionMessages and distributes them into the Zustand store.
 * Components consume from the store — they never listen to messages directly.
 */

import { useEffect } from 'react';
import { useVSCodeMessage } from './useVSCodeMessage';
import { useUIStore } from '../store/uiStateStore';
import { useCircuitStore } from '../store/circuitStore';

export function useCircuitData(): void {
  const message = useVSCodeMessage();
  const { setCircuit, setAnalysis, setSimulationResult, setIsSimulating, setDebugResult } = useCircuitStore();
  const { setLoading, setError, clearError } = useUIStore();

  useEffect(() => {
    if (!message) {
      return;
    }

    switch (message.type) {
      case 'CIRCUIT_UPDATED':
        clearError();
        setLoading(false);
        setCircuit(message.payload);
        break;

      case 'ANALYSIS_RESULT':
        clearError();
        setLoading(false);
        setAnalysis(message.payload);
        break;

      case 'SIMULATION_RESULT':
        clearError();
        setLoading(false);
        setSimulationResult(message.payload);
        setIsSimulating(false);
        break;

      case 'DEBUG_STATES_UPDATED':
        clearError();
        setLoading(false);
        setDebugResult(message.payload);
        break;

      case 'LOADING':
        setLoading(true, message.payload.operation);
        break;

      case 'ERROR':
        setLoading(false);
        setIsSimulating(false);
        setError(message.payload.message, message.payload.suggestion);
        break;

      case 'SERVER_STATUS':
        // Server status changes can be surfaced in a future status bar component
        break;
    }
  }, [message]);
}
// TS cache trigger

