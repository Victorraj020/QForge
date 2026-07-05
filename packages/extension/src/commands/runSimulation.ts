/**
 * @file runSimulation.ts
 * @description Command: qforge.runSimulation
 *
 * Runs the active Python circuit on the local simulator (via Python bridge)
 * and broadcasts the results to the webview UI.
 */

import * as vscode from 'vscode';
import type { QForgeContainer } from '../extension/container';
import { Commands } from '../shared/constants';
import type { ExecutionResult } from '../shared/plugins';

export function registerRunSimulation(container: QForgeContainer): vscode.Disposable {
  return vscode.commands.registerCommand(
    Commands.RUN_SIMULATION,
    async (options?: { shots: number; seed?: number }) => {
      let editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'python') {
        editor = vscode.window.visibleTextEditors.find(
          (e) => e.document.languageId === 'python',
        );
      }

      if (!editor) {
        vscode.window.showErrorMessage(
          'QForge: Open a Python file with a QuantumCircuit to run simulation.',
        );
        return;
      }

      const shots = options?.shots ?? 1024;
      const seed = options?.seed;

      container.outputChannel.appendLine(
        `[QForge] Running simulation with ${shots} shots...`,
      );

      try {
        const result = await container.pythonBridge.call<ExecutionResult>('runSimulator', {
          source: editor.document.getText(),
          filePath: editor.document.uri.fsPath,
          shots,
          seed,
        });

        // Broadcast the result back to the webviews
        container.webviewMessages.sendSimulationResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        container.outputChannel.appendLine(`[QForge] Simulation failed: ${message}`);
        container.webviewMessages.sendError('SIMULATION_FAILED', message);
        throw err;
      }
    },
  );
}
