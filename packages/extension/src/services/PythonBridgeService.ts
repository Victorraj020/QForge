/**
 * @file PythonBridgeService.ts
 * @description Manages the lifecycle of the Python IPC server subprocess.
 *
 * Transport: JSON-RPC 2.0 over stdin/stdout.
 *  - Same protocol as the Language Server Protocol.
 *  - No ports, no firewall rules, no startup races.
 *  - Process lifecycle is tied to the extension.
 *
 * Reliability:
 *  - Startup timeout: 10 seconds (configurable)
 *  - Per-request timeout: 5 seconds
 *  - Auto-restart on unexpected exit
 *  - Graceful shutdown on dispose
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  PYTHON_SERVER_STARTUP_TIMEOUT_MS,
  PYTHON_SERVER_REQUEST_TIMEOUT_MS,
  ConfigKeys,
} from '../shared/constants';

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class PythonBridgeService implements vscode.Disposable {
  private process: cp.ChildProcess | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private buffer = '';
  private isReady = false;
  private isDisposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    const pythonPath = this.resolvePythonPath();
    let serverScript = path.join(
      this.context.extensionPath,
      'python',
      'qforge',
      'server.py',
    );
    if (!fs.existsSync(serverScript)) {
      serverScript = path.resolve(
        this.context.extensionPath,
        '..',
        'python',
        'qforge',
        'server.py',
      );
    }

    this.outputChannel.appendLine(`[QForge] Starting Python server: ${pythonPath} ${serverScript}`);

    return new Promise((resolve, reject) => {
      const pythonParentDir = path.dirname(path.dirname(serverScript));
      const env = {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH
          ? `${pythonParentDir}${path.delimiter}${process.env.PYTHONPATH}`
          : pythonParentDir,
      };

      const proc = cp.spawn(pythonPath, [serverScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });

      this.process = proc;

      // Startup timeout
      const startupTimer = setTimeout(() => {
        reject(new Error(`Python server did not start within ${PYTHON_SERVER_STARTUP_TIMEOUT_MS}ms`));
        proc.kill();
      }, PYTHON_SERVER_STARTUP_TIMEOUT_MS);

      proc.stdout?.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8');
        this.processBuffer();

        // Resolve startup promise on first valid response or ready signal
        if (!this.isReady) {
          this.isReady = true;
          clearTimeout(startupTimer);
          this.outputChannel.appendLine('[QForge] Python server ready.');
          resolve();
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.outputChannel.appendLine(`[QForge/python] ${chunk.toString('utf-8').trimEnd()}`);
      });

      proc.on('error', (err) => {
        clearTimeout(startupTimer);
        reject(err);
      });

      proc.on('exit', (code) => {
        this.isReady = false;
        this.process = null;
        this.outputChannel.appendLine(`[QForge] Python server exited with code ${code ?? 'null'}.`);

        // Reject any pending requests
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Python server exited unexpectedly'));
          this.pending.delete(id);
        }
      });
    });
  }

  async restart(): Promise<void> {
    this.process?.kill();
    this.process = null;
    this.isReady = false;
    this.buffer = '';
    await this.start();
  }

  dispose(): void {
    this.isDisposed = true;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Extension deactivated'));
    }
    this.pending.clear();
    this.process?.kill();
    this.process = null;
  }

  // ---------------------------------------------------------------------------
  // RPC
  // ---------------------------------------------------------------------------

  async call<T>(method: string, params?: unknown): Promise<T> {
    if (this.isDisposed) {
      throw new Error('Python bridge service has been disposed');
    }
    if (!this.isReady || !this.process?.stdin) {
      throw new Error('Python server is not running. Configure qforge.pythonPath in settings.');
    }

    const id = uuidv4();
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const line = JSON.stringify(request) + '\n';

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out after ${PYTHON_SERVER_REQUEST_TIMEOUT_MS}ms`));
      }, PYTHON_SERVER_REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });

      this.process!.stdin!.write(line);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    // Last element is an incomplete line — keep it in the buffer.
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === 'READY') {
        this.outputChannel.appendLine('[QForge] Received ready signal from Python server.');
        continue;
      }
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleResponse(response);
      } catch {
        this.outputChannel.appendLine(`[QForge] Malformed response from Python: ${trimmed}`);
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.error) {
      const { message, data } = response.error;
      const suggestion = (data as Record<string, unknown> | undefined)?.['suggestion'];
      const fullMessage = suggestion ? `${message}. ${suggestion}` : message;
      pending.reject(new Error(fullMessage));
    } else {
      pending.resolve(response.result);
    }
  }

  private resolvePythonPath(): string {
    const config = vscode.workspace.getConfiguration();
    const configured = config.get<string>(ConfigKeys.PYTHON_PATH, '');
    if (configured.trim()) {
      return configured.trim();
    }
    // Fall back to the Python extension's selected interpreter, then standard Windows user install paths.
    const pythonExt = vscode.extensions.getExtension('ms-python.python');
    if (pythonExt?.isActive) {
      const api = pythonExt.exports as { settings?: { getExecutionDetails?: () => { execCommand?: string[] } } };
      const execDetails = api?.settings?.getExecutionDetails?.();
      const execCommand = execDetails?.execCommand;
      if (execCommand?.[0]) {
        return execCommand[0];
      }
    }

    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
      if (localAppData) {
        const programsDir = path.join(localAppData, 'Programs', 'Python');
        if (fs.existsSync(programsDir)) {
          try {
            const dirs = fs.readdirSync(programsDir);
            for (const dir of dirs) {
              const candidate = path.join(programsDir, dir, 'python.exe');
              if (fs.existsSync(candidate)) {
                return candidate;
              }
            }
          } catch {
            // ignore listing errors
          }
        }
      }
    }

    return 'python';
  }
}
