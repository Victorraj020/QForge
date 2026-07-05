/**
 * @file container.ts
 * @description Dependency injection container for QForge.
 *
 * All services are constructed here and injected into their dependents.
 * Nothing instantiates itself. This makes every service independently
 * testable (swap real services for mocks by replacing this file).
 *
 * Lifecycle: container is created in activate(), disposed in deactivate().
 */

import * as vscode from 'vscode';
import { PythonBridgeService } from '../services/PythonBridgeService';
import { CircuitAnalysisService } from '../services/CircuitAnalysisService';
import { HoverDocumentationService } from '../services/HoverDocumentationService';
import { WebviewMessageService } from '../services/WebviewMessageService';
import { GateKnowledgeBase } from '../services/GateKnowledgeBase';
import { HoverProvider } from '../providers/HoverProvider';
import { CodeLensProvider } from '../providers/CodeLensProvider';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { DocumentChangeListener } from '../providers/DocumentChangeListener';
import { CircuitPreviewPanel } from '../webview/CircuitPreviewPanel';
import { TimelinePanel } from '../webview/TimelinePanel';
import { ExplainPanel } from '../webview/ExplainPanel';
import { OUTPUT_CHANNEL_NAME } from '../shared/constants';

export interface QForgeContainer {
  // Services
  readonly pythonBridge: PythonBridgeService;
  readonly circuitAnalysis: CircuitAnalysisService;
  readonly hoverDocs: HoverDocumentationService;
  readonly webviewMessages: WebviewMessageService;
  readonly gateKnowledge: GateKnowledgeBase;

  // Providers
  readonly hoverProvider: HoverProvider;
  readonly codeLensProvider: CodeLensProvider;
  readonly diagnosticProvider: DiagnosticProvider;
  readonly documentChangeListener: DocumentChangeListener;

  // Panels (created lazily, referenced here for dispose)
  readonly circuitPreviewPanel: CircuitPreviewPanel;
  readonly timelinePanel: TimelinePanel;
  readonly explainPanel: ExplainPanel;

  // VS Code resources
  readonly outputChannel: vscode.OutputChannel;

  dispose(): void;
}

export function createContainer(context: vscode.ExtensionContext): QForgeContainer {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  // --- Layer 1: Stateless knowledge base (no deps)
  const gateKnowledge = new GateKnowledgeBase();

  // --- Layer 2: Services (depend only on VS Code APIs and each other)
  const pythonBridge = new PythonBridgeService(context, outputChannel);
  const webviewMessages = new WebviewMessageService(outputChannel);
  const hoverDocs = new HoverDocumentationService(gateKnowledge);
  const circuitAnalysis = new CircuitAnalysisService(pythonBridge, webviewMessages, outputChannel);

  // --- Layer 3: Panels (depend on services)
  const circuitPreviewPanel = new CircuitPreviewPanel(context, webviewMessages, pythonBridge, outputChannel);
  const timelinePanel = new TimelinePanel(context, webviewMessages, outputChannel);
  const explainPanel = new ExplainPanel(context, webviewMessages, outputChannel);

  // Wire panels into webviewMessages so the service knows where to send messages
  webviewMessages.registerPanel(circuitPreviewPanel);
  webviewMessages.registerPanel(timelinePanel);
  webviewMessages.registerPanel(explainPanel);

  // --- Layer 4: Providers (depend on services and panels)
  const hoverProvider = new HoverProvider(hoverDocs);
  const codeLensProvider = new CodeLensProvider();
  const diagnosticProvider = new DiagnosticProvider();
  const documentChangeListener = new DocumentChangeListener(
    circuitAnalysis,
    webviewMessages,
    outputChannel,
  );

  function dispose(): void {
    outputChannel.dispose();
    pythonBridge.dispose();
    webviewMessages.dispose();
    circuitPreviewPanel.dispose();
    timelinePanel.dispose();
    explainPanel.dispose();
    diagnosticProvider.dispose();
    documentChangeListener.dispose();
  }

  return {
    pythonBridge,
    circuitAnalysis,
    hoverDocs,
    webviewMessages,
    gateKnowledge,
    hoverProvider,
    codeLensProvider,
    diagnosticProvider,
    documentChangeListener,
    circuitPreviewPanel,
    timelinePanel,
    explainPanel,
    outputChannel,
    dispose,
  };
}
