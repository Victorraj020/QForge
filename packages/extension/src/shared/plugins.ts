/**
 * @file plugins.ts
 * @description Plugin extension point interfaces for QForge.
 *
 * These interfaces define the seams where third-party plugins will plug in.
 * No plugin loads in Phase 1. Defining the contracts now ensures future
 * plugins don't require changes to core services.
 *
 * Plugin registration will be handled by a PluginRegistry service in Phase 2+.
 */

import type { CircuitIR, GateOp } from './CircuitIR';
import type { GateDoc } from './GateDoc';

// ---------------------------------------------------------------------------
// Gate Knowledge Provider plugin
// ---------------------------------------------------------------------------

/**
 * A plugin that contributes gate documentation.
 * The built-in GateKnowledgeBase is one implementation.
 * Community plugins can register specialized providers (e.g., custom gate libraries).
 */
export interface GateKnowledgeProvider {
  /** Unique plugin ID. Reverse-domain recommended: "com.ibm.qiskit-gates" */
  readonly id: string;

  /** Human-readable name shown in QForge settings. */
  readonly displayName: string;

  /** Priority. Higher priority providers are consulted first. */
  readonly priority: number;

  /** Returns true if this provider has documentation for the given gate. */
  supports(gateName: string): boolean;

  /** Returns structured documentation for the gate. */
  getDoc(gateName: string): GateDoc | undefined;
}

// ---------------------------------------------------------------------------
// Circuit Renderer plugin
// ---------------------------------------------------------------------------

/**
 * A plugin that renders a CircuitIR into a visual representation.
 * The built-in SvgCircuitRenderer is one implementation.
 * Community plugins can register 3D, Bloch sphere, or custom renderers.
 */
export interface CircuitRenderer {
  /** Unique renderer ID. Must match the qforge.circuitRenderer config value. */
  readonly id: string;

  /** Human-readable name shown in QForge settings. */
  readonly displayName: string;

  /**
   * Render the circuit IR into the given container element.
   * Called when the circuit changes or the container is resized.
   */
  render(ir: CircuitIR, container: HTMLElement): void;

  /** Called when the panel is closed or the renderer is swapped out. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Execution Provider plugin (Phase 2+)
// ---------------------------------------------------------------------------

export interface ExecutionOptions {
  readonly shots: number;
  readonly seed?: number;
}

export interface ExecutionResult {
  readonly counts: Record<string, number>;
  readonly statevector?: readonly number[][];
  readonly provider: string;
  readonly executionTimeMs: number;
}

/**
 * A plugin that executes a quantum circuit.
 * LocalAerProvider (Phase 2) is the first implementation.
 * IBM Quantum, AWS Braket, etc. are future plugins.
 */
export interface ExecutionProvider {
  readonly id: string;
  readonly displayName: string;

  /** True if this provider is currently available (credentials, connectivity). */
  isAvailable(): Promise<boolean>;

  execute(gate: GateOp[], options: ExecutionOptions): Promise<ExecutionResult>;
}

// ---------------------------------------------------------------------------
// Debugger contracts (Phase 3)
// ---------------------------------------------------------------------------

export interface Amplitude {
  readonly state: string;        // e.g. "00", "01"
  readonly re: number;           // Real part
  readonly im: number;           // Imaginary part
  readonly probability: number;  // Amplitude squared (|amp|^2)
  readonly phase: number;        // Phase in radians (-pi to pi)
}

export interface DebugStep {
  readonly gateIndex: number;    // Index of gate just executed (-1 for initial state)
  readonly statevector: readonly Amplitude[];
}

export interface DebugResult {
  readonly steps: readonly DebugStep[];
  readonly error?: string;
}

