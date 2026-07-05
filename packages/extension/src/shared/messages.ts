/**
 * @file messages.ts
 * @description Typed message protocol between the VS Code extension host and webview panels.
 *
 * RULES:
 *  - Every message type is a discriminated union literal — never a raw string.
 *  - Adding a new message type requires updating BOTH unions.
 *  - The TypeScript compiler will catch every unhandled message case.
 *  - No imports from VS Code or DOM. This file must be importable in the webview.
 */

import type { CircuitIR } from './CircuitIR';
import type { GateDoc } from './GateDoc';
import type { AnalysisResult } from './AnalysisResult';
import type { ExecutionResult, DebugResult } from './plugins';

// ---------------------------------------------------------------------------
// Extension Host → Webview messages
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  | {
      readonly type: 'CIRCUIT_UPDATED';
      readonly payload: CircuitIR;
    }
  | {
      readonly type: 'SIMULATION_RESULT';
      readonly payload: ExecutionResult;
    }
  | {
      readonly type: 'ANALYSIS_RESULT';
      readonly payload: AnalysisResult;
    }
  | {
      readonly type: 'GATE_DOC';
      readonly payload: GateDoc;
    }
  | {
      readonly type: 'DEBUG_STATES_UPDATED';
      readonly payload: DebugResult;
    }
  | {
      readonly type: 'ERROR';
      readonly payload: {
        readonly message: string;
        readonly code: string;
        readonly suggestion?: string | undefined;
      };
    }
  | {
      readonly type: 'LOADING';
      readonly payload: {
        readonly operation: string;
      };
    }
  | {
      readonly type: 'SERVER_STATUS';
      readonly payload: {
        readonly status: 'starting' | 'ready' | 'error' | 'stopped';
        readonly message?: string | undefined;
      };
    };

// ---------------------------------------------------------------------------
// Webview → Extension Host messages
// ---------------------------------------------------------------------------

export type WebviewMessage =
  | {
      readonly type: 'PANEL_READY';
      readonly payload: {
        readonly panelId: string;
      };
    }
  | {
      readonly type: 'REQUEST_ANALYSIS';
    }
  | {
      readonly type: 'REQUEST_GATE_DOC';
      readonly payload: {
        readonly gateName: string;
      };
    }
  | {
      readonly type: 'REQUEST_SIMULATOR_RUN';
      readonly payload: {
        readonly shots: number;
        readonly seed?: number | undefined;
      };
    }
  | {
      readonly type: 'REQUEST_DEBUG_STATES';
    };

// ---------------------------------------------------------------------------
// Type guard utilities
// ---------------------------------------------------------------------------

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>)['type'] === 'string'
  );
}
