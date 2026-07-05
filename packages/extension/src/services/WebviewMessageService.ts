/**
 * @file WebviewMessageService.ts
 * @description Dispatches typed messages from the extension host to all active webview panels.
 *
 * Panels register themselves here. The service fans out to all registered,
 * visible panels — services never reference specific panel implementations.
 */

import type * as vscode from 'vscode';
import type { ExtensionMessage } from '../shared/messages';
import type { CircuitIR } from '../shared/CircuitIR';
import type { AnalysisResult } from '../shared/AnalysisResult';
import type { GateDoc } from '../shared/GateDoc';
import type { ExecutionResult } from '../shared/plugins';

export interface WebviewPanel {
  readonly panelId: string;
  sendMessage(message: ExtensionMessage): void;
  isVisible(): boolean;
}

export class WebviewMessageService implements vscode.Disposable {
  private readonly panels = new Map<string, WebviewPanel>();

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  registerPanel(panel: WebviewPanel): void {
    this.panels.set(panel.panelId, panel);
  }

  unregisterPanel(panelId: string): void {
    this.panels.delete(panelId);
  }

  sendCircuitUpdated(ir: CircuitIR): void {
    this.broadcast({ type: 'CIRCUIT_UPDATED', payload: ir });
  }

  sendAnalysisResult(result: AnalysisResult): void {
    this.broadcast({ type: 'ANALYSIS_RESULT', payload: result });
  }

  sendSimulationResult(result: ExecutionResult): void {
    this.broadcast({ type: 'SIMULATION_RESULT', payload: result });
  }

  sendGateDoc(doc: GateDoc): void {
    this.broadcast({ type: 'GATE_DOC', payload: doc });
  }

  sendLoading(operation: string): void {
    this.broadcast({ type: 'LOADING', payload: { operation } });
  }

  sendError(code: string, message: string, suggestion?: string): void {
    this.broadcast({ type: 'ERROR', payload: { code, message, suggestion } });
  }

  sendServerStatus(status: 'starting' | 'ready' | 'error' | 'stopped', message?: string): void {
    this.broadcast({ type: 'SERVER_STATUS', payload: { status, message } });
  }

  private broadcast(message: ExtensionMessage): void {
    for (const panel of this.panels.values()) {
      if (panel.isVisible()) {
        try {
          panel.sendMessage(message);
        } catch (err) {
          this.outputChannel.appendLine(
            `[QForge] Failed to send ${message.type} to panel ${panel.panelId}: ${String(err)}`,
          );
        }
      }
    }
  }

  dispose(): void {
    this.panels.clear();
  }
}
