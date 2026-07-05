/**
 * @file CircuitPreviewPanel.ts
 * @description The Circuit Preview webview panel.
 *
 * Shows the live SVG circuit diagram, updating in real time as the user types.
 */

import * as vscode from 'vscode';
import { PanelBase } from './PanelBase';
import type { WebviewMessageService } from '../services/WebviewMessageService';
import type { PythonBridgeService } from '../services/PythonBridgeService';
import type { WebviewMessage } from '../shared/messages';
import type { DebugResult } from '../shared/plugins';
import { Panels, Commands } from '../shared/constants';

export class CircuitPreviewPanel extends PanelBase {
  readonly panelId = Panels.CIRCUIT_PREVIEW;
  protected readonly viewTitle = 'QForge — Circuit Preview';
  protected readonly viewColumn = vscode.ViewColumn.Beside;

  constructor(
    context: vscode.ExtensionContext,
    private readonly webviewMessages: WebviewMessageService,
    private readonly pythonBridge: PythonBridgeService,
    outputChannel: vscode.OutputChannel,
  ) {
    super(context, outputChannel);
  }

  protected onMessageReceived(message: WebviewMessage): void {
    if (message.type === 'REQUEST_GATE_DOC') {
      // Gate doc request from the webview (e.g., user clicked a gate in the diagram)
      this.outputChannel.appendLine(`[QForge] Gate doc requested: ${message.payload.gateName}`);
    } else if (message.type === 'REQUEST_SIMULATOR_RUN') {
      this.outputChannel.appendLine(`[QForge] Simulator run requested with ${message.payload.shots} shots.`);
      vscode.commands.executeCommand(Commands.RUN_SIMULATION, message.payload).catch((err: Error) => {
        this.outputChannel.appendLine(`[QForge] Failed to execute runSimulation command: ${err.message}`);
      });
    } else if (message.type === 'REQUEST_DEBUG_STATES') {
      this.outputChannel.appendLine(`[QForge] Debug stepping states requested.`);
      this.handleRequestDebugStates().catch((err: Error) => {
        this.outputChannel.appendLine(`[QForge] Failed to handle debug states request: ${err.message}`);
      });
    }
  }

  private async handleRequestDebugStates(): Promise<void> {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.languageId === 'python',
      );
    }

    if (!editor) {
      this.webviewMessages.sendError('DEBUG_FAILED', 'No active Python file found.');
      return;
    }

    this.webviewMessages.sendLoading('Calculating debug steps...');
    try {
      const result = await this.pythonBridge.call<DebugResult>('debugStepCircuit', {
        source: editor.document.getText(),
        filePath: editor.document.uri.fsPath,
      });
      // Send directly to the webview panel instance
      this.sendMessage({
        type: 'DEBUG_STATES_UPDATED',
        payload: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.webviewMessages.sendError('DEBUG_FAILED', message);
    }
  }
}
