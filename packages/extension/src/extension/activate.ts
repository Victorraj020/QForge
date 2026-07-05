/**
 * @file activate.ts
 * @description Extension entry point. Called once by VS Code when the extension activates.
 *
 * Responsibilities:
 *  1. Construct the dependency container.
 *  2. Register all VS Code providers and commands.
 *  3. Start the Python IPC server.
 *  4. Return disposables so VS Code can clean up on deactivate.
 *
 * This function must remain thin. No business logic here.
 */

import * as vscode from 'vscode';
import { createContainer } from './container';
import { registerOpenCircuitPreview } from '../commands/openCircuitPreview';
import { registerExplainCircuit } from '../commands/explainCircuit';
import { registerOpenTimeline } from '../commands/openTimeline';
import { registerRunSimulation } from '../commands/runSimulation';
import { Commands, EXTENSION_DISPLAY_NAME } from '../shared/constants';

export function activate(context: vscode.ExtensionContext): void {
  const container = createContainer(context);

  // --- Register VS Code language feature providers ---
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'python', scheme: 'file' },
      container.hoverProvider,
    ),
    vscode.languages.registerCodeLensProvider(
      { language: 'python', scheme: 'file' },
      container.codeLensProvider,
    ),
  );

  // --- Register commands ---
  context.subscriptions.push(
    registerOpenCircuitPreview(container),
    registerExplainCircuit(container),
    registerOpenTimeline(container),
    registerRunSimulation(container),
    vscode.commands.registerCommand(Commands.RESTART_SERVER, () => {
      container.pythonBridge.restart().catch((err: Error) => {
        vscode.window.showErrorMessage(`QForge: Failed to restart server — ${err.message}`);
      });
    }),
  );

  // --- Start the document change listener ---
  context.subscriptions.push(container.documentChangeListener);

  // --- Register container dispose with VS Code lifecycle ---
  context.subscriptions.push({ dispose: () => container.dispose() });

  // --- Start Python server (non-blocking; extension works without it) ---
  container.pythonBridge.start().catch((err: Error) => {
    container.outputChannel.appendLine(
      `[QForge] Python server failed to start: ${err.message}`,
    );
    vscode.window.showWarningMessage(
      `${EXTENSION_DISPLAY_NAME}: Python server unavailable. ` +
        'Hover documentation works offline. Analysis features require Python + Qiskit.',
      'Configure Python Path',
    ).then((selection) => {
      if (selection === 'Configure Python Path') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'qforge.pythonPath');
      }
    });
  });

  container.outputChannel.appendLine(`[QForge] Extension activated.`);
}
