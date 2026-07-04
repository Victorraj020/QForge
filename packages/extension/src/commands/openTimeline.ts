/**
 * @file openTimeline.ts
 * @description Command: qforge.openTimeline
 *
 * Opens (or reveals) the Circuit Timeline panel for the active Python file.
 * The timeline shows every gate operation as an ordered sequence of steps.
 */

import * as vscode from 'vscode';
import type { QForgeContainer } from '../extension/container';
import { Commands } from '../shared/constants';

export function registerOpenTimeline(container: QForgeContainer): vscode.Disposable {
  return vscode.commands.registerCommand(Commands.OPEN_TIMELINE, async () => {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.languageId === 'python',
      );
    }

    if (!editor) {
      vscode.window.showInformationMessage(
        'QForge: Open a Python file with a QuantumCircuit to use Circuit Timeline.',
      );
      return;
    }

    container.timelinePanel.show();

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
