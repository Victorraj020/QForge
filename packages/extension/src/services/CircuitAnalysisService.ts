/**
 * @file CircuitAnalysisService.ts
 * @description Orchestrates circuit parsing and deep analysis.
 *
 * Data flow:
 *  1. parseDocument()  → TypeScript parser → CircuitIR (fast, approximate)
 *  2. analyzeDocument() → Python backend → AnalysisResult (deep, accurate)
 *
 * This service is the only place that knows about both paths.
 * Commands and providers call this service; they don't touch the parser or bridge directly.
 */

import type * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { detectCircuits } from '../parser/CircuitDetector';
import { extractGateCalls } from '../parser/GateCallExtractor';
import type { CircuitIR } from '../shared/CircuitIR';
import type { AnalysisResult } from '../shared/AnalysisResult';
import type { PythonBridgeService } from './PythonBridgeService';
import type { WebviewMessageService } from './WebviewMessageService';

export class CircuitAnalysisService {
  constructor(
    private readonly pythonBridge: PythonBridgeService,
    _webviewMessages: WebviewMessageService,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  /**
   * Fast path: TypeScript-only parse. Returns the first detected circuit IR.
   * Called on every document change (debounced).
   */
  async parseDocument(document: vscode.TextDocument): Promise<CircuitIR | null> {
    const source = document.getText();
    const detected = detectCircuits(source);

    if (detected.length === 0) {
      return null;
    }

    // Use the first detected circuit. Future: support multiple circuits per file.
    const first = detected[0];
    const gates = extractGateCalls(source, first.variableName, first.sourceRange.startLine);

    const ir: CircuitIR = {
      id: uuidv4(),
      filePath: document.uri.fsPath,
      variableName: first.variableName,
      qubits: first.qubits > 0 ? first.qubits : Math.max(...gates.flatMap((g) => g.qubits), 0) + 1,
      classicalBits: first.classicalBits,
      gates,
      sourceRange: first.sourceRange,
      isApproximate: true,
    };

    return ir;
  }

  /**
   * Deep path: Sends source to the Python backend for full Qiskit analysis.
   * Returns a complete AnalysisResult. Throws if Python is unavailable.
   */
  async analyzeDocument(document: vscode.TextDocument): Promise<AnalysisResult | null> {
    const source = document.getText();

    // Quick pre-check using TypeScript parser — avoid round-trip if no circuit
    const detected = detectCircuits(source);
    if (detected.length === 0) {
      return null;
    }

    this.outputChannel.appendLine(`[QForge] Sending analysis request for ${document.uri.fsPath}`);

    const result = await this.pythonBridge.call<AnalysisResult>('analyzeCircuit', {
      source,
      filePath: document.uri.fsPath,
    });

    return result;
  }
}
