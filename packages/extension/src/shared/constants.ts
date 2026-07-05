/**
 * @file constants.ts
 * @description Central registry of all stable identifiers in QForge.
 *
 * Every command ID, panel ID, config key, and output channel name lives here.
 * Rename something once here; the compiler finds every broken reference.
 */

// ---------------------------------------------------------------------------
// Extension identifiers
// ---------------------------------------------------------------------------

export const EXTENSION_ID = 'qforge' as const;
export const EXTENSION_DISPLAY_NAME = 'QForge' as const;

// ---------------------------------------------------------------------------
// Command IDs — must match package.json contributes.commands[].command
// ---------------------------------------------------------------------------

export const Commands = {
  OPEN_CIRCUIT_PREVIEW: 'qforge.openCircuitPreview',
  OPEN_TIMELINE: 'qforge.openTimeline',
  EXPLAIN_CIRCUIT: 'qforge.explainCircuit',
  RESTART_SERVER: 'qforge.restartServer',
  RUN_SIMULATION: 'qforge.runSimulation',
} as const;

export type CommandId = (typeof Commands)[keyof typeof Commands];

// ---------------------------------------------------------------------------
// Webview panel identifiers
// ---------------------------------------------------------------------------

export const Panels = {
  CIRCUIT_PREVIEW: 'qforge.circuitPreview',
  TIMELINE: 'qforge.timeline',
  EXPLAIN: 'qforge.explain',
} as const;

export type PanelId = (typeof Panels)[keyof typeof Panels];

// ---------------------------------------------------------------------------
// Configuration keys — must match package.json contributes.configuration
// ---------------------------------------------------------------------------

export const ConfigKeys = {
  PYTHON_PATH: 'qforge.pythonPath',
  AUTO_PREVIEW: 'qforge.autoPreview',
  DEBOUNCE_MS: 'qforge.debounceMs',
  CIRCUIT_RENDERER: 'qforge.circuitRenderer',
} as const;

// ---------------------------------------------------------------------------
// Output channel / status bar
// ---------------------------------------------------------------------------

export const OUTPUT_CHANNEL_NAME = 'QForge' as const;
export const STATUS_BAR_PRIORITY = 100 as const;

// ---------------------------------------------------------------------------
// Python IPC
// ---------------------------------------------------------------------------

export const PYTHON_SERVER_STARTUP_TIMEOUT_MS = 10_000 as const;
export const PYTHON_SERVER_REQUEST_TIMEOUT_MS = 5_000 as const;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export const DEFAULT_DEBOUNCE_MS = 300 as const;
