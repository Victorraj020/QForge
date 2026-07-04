/**
 * @file openCircuitPreview.ts
 * @description Command: qforge.openCircuitPreview
 *
 * Opens (or reveals) the Circuit Preview webview panel for the active Python file.
 * If no QuantumCircuit is detected in the file, shows an informational message.
 *
 * Design rule: This command contains zero business logic.
 * It receives input → calls a service → delegates rendering to the panel.
 */

import * as vscode from 'vscode';
import type { QForgeContainer } from '../extension/container';
import { Commands } from '../shared/constants';

export function registerOpenCircuitPreview(container: QForgeContainer): vscode.Disposable {
  return vscode.commands.registerCommand(Commands.OPEN_CIRCUIT_PREVIEW, async () => {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.languageId === 'python',
      );
    }

    if (!editor) {
      vscode.window.showInformationMessage(
        'QForge: Open a Python file with a QuantumCircuit to use Circuit Preview.',
      );
      return;
    }

    // Open the panel — it will request a fresh parse once it's ready.
    container.circuitPreviewPanel.show();

    // Trigger an immediate parse of the current document.
    const ir = await container.circuitAnalysis.parseDocument(editor.document);
    if (!ir) {
      vscode.window.showInformationMessage(
        'QForge: No QuantumCircuit detected in the active file.',
      );
      return;
    }

    container.webviewMessages.sendCircuitUpdated(ir);
  });
}
