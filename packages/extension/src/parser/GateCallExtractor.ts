/**
 * @file GateCallExtractor.ts
 * @description Extracts gate method calls from Python source following a QuantumCircuit detection.
 *
 * Given the variable name of a detected circuit (e.g., "qc"), this module
 * scans the source for all method calls on that variable and classifies them
 * as known gate operations.
 *
 * Produces a list of GateOp objects that form the gates array of a CircuitIR.
 * Step values are approximated (one gate per source line = one step).
 * The Python backend computes exact parallel steps via DAGCircuit.
 */

import { v4 as uuidv4 } from 'uuid';
import type { GateOp } from '../shared/CircuitIR';

/**
 * All gate names recognised by this parser.
 * Covers the most common Qiskit gates. Unknown methods are skipped.
 */
const KNOWN_GATES = new Set([
  // Single-qubit Clifford gates
  'h', 'x', 'y', 'z', 's', 't', 'sdg', 'tdg', 'sx', 'sxdg',
  // Single-qubit rotation gates
  'rx', 'ry', 'rz', 'r', 'u', 'u1', 'u2', 'u3', 'p',
  // Identity
  'id', 'i',
  // Two-qubit gates
  'cx', 'cy', 'cz', 'ch', 'cp', 'crx', 'cry', 'crz', 'cu', 'cu1', 'cu3',
  'swap', 'iswap', 'dcx', 'ecr',
  // Three-qubit gates
  'ccx', 'ccz', 'cswap',
  // Measurement & control
  'measure', 'measure_all', 'reset', 'barrier',
]);

/**
 * Regex: matches `varName.gateName(args)` on a single line.
 * Captures: [1] gate name, [2] raw args string.
 *
 * Intentionally does NOT handle multi-line gate calls.
 * Multi-line calls are extremely rare in beginner/educational code
 * and are handled correctly by the Python AST extractor.
 */
function buildGatePattern(variableName: string): RegExp {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^[ \\t]*${escaped}\\.([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(([^)]*)\\)`,
    'gm',
  );
}

/**
 * Extracts gate operations for a given circuit variable from source text.
 *
 * @param source    Full Python source text.
 * @param varName   The QuantumCircuit variable name (e.g., "qc").
 * @param startLine The line where the circuit was constructed (gates appear after this).
 */
export function extractGateCalls(
  source: string,
  varName: string,
  startLine: number,
): GateOp[] {
  const pattern = buildGatePattern(varName);
  const results: GateOp[] = [];
  let stepCounter = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(source)) !== null) {
    const gateName = match[1].toLowerCase();

    // Skip non-gate methods (e.g., qc.draw(), qc.qasm())
    if (!KNOWN_GATES.has(gateName)) {
      continue;
    }

    const argsRaw = match[2].trim();
    const sourceLine = source.substring(0, match.index).split('\n').length;

    // Only capture gates that appear AFTER the constructor.
    if (sourceLine < startLine) {
      continue;
    }

    const { qubits, params } = parseGateArgs(gateName, argsRaw);

    results.push({
      id: uuidv4(),
      name: gateName,
      qubits,
      params,
      step: stepCounter++,
      sourceLine,
    });
  }

  return results;
}

/**
 * Parses the raw argument string of a gate call into qubit indices and parameters.
 *
 * Examples:
 *   "0"           → qubits=[0], params=[]            (H gate)
 *   "0, 1"        → qubits=[0, 1], params=[]          (CX gate)
 *   "pi/2, 0"     → qubits=[0], params=[1.5707...]    (Rx gate)
 *   "[0, 1], [0, 1]" → qubits=[0, 1], params=[]      (measure_all pattern)
 */
function parseGateArgs(
  gateName: string,
  argsRaw: string,
): { qubits: number[]; params: number[] } {
  if (!argsRaw) {
    return { qubits: [], params: [] };
  }

  const args = argsRaw.split(',').map((s) => s.trim());
  const qubits: number[] = [];
  const params: number[] = [];

  // For measurement, handle list syntax: [0, 1], [0, 1]
  if (gateName === 'measure') {
    const listMatch = argsRaw.match(/\[([^\]]+)\]/);
    if (listMatch) {
      const indices = listMatch[1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      return { qubits: indices, params: [] };
    }
  }

  for (const arg of args) {
    // Remove any list brackets and try to parse as integer (qubit index)
    const cleaned = arg.replace(/\[|\]/g, '').trim();
    const asInt = parseInt(cleaned, 10);
    if (!isNaN(asInt)) {
      qubits.push(asInt);
    } else {
      // Try as float (rotation parameter)
      const asFloat = parseFloat(cleaned);
      if (!isNaN(asFloat)) {
        params.push(asFloat);
      }
    }
  }

  return { qubits, params };
}
