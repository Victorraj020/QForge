/**
 * @file explainCircuit.ts
 * @description Command: qforge.explainCircuit
 *
 * Triggers deep Python-powered circuit analysis and opens the Explain panel
 * with a structured breakdown of the circuit.
 */

import * as vscode from 'vscode';
import type { QForgeContainer } from '../extension/container';
import { Commands } from '../shared/constants';

export function registerExplainCircuit(container: QForgeContainer): vscode.Disposable {
  return vscode.commands.registerCommand(Commands.EXPLAIN_CIRCUIT, async () => {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.languageId === 'python',
      );
    }

    if (!editor) {
      vscode.window.showInformationMessage(
        'QForge: Open a Python file with a QuantumCircuit to use Explain Circuit.',
      );
      return;
    }

    container.explainPanel.show();
    container.webviewMessages.sendLoading('Analyzing circuit…');

    try {
      const result = await container.circuitAnalysis.analyzeDocument(editor.document);
      if (!result) {
        vscode.window.showInformationMessage(
          'QForge: No QuantumCircuit detected in the active file.',
        );
        return;
      }
      container.webviewMessages.sendAnalysisResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      container.webviewMessages.sendError('ANALYSIS_FAILED', message);
      container.outputChannel.appendLine(`[QForge] Analysis failed: ${message}`);
    }
  });
}
