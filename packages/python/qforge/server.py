"""
server.py — QForge Python IPC server.

Transport: JSON-RPC 2.0 over stdin/stdout (line-delimited).
The VS Code extension spawns this as a subprocess and communicates via pipes.

Method registry:
  - analyzeCircuit(source, filePath) → AnalysisResult

Each method is handled by a dedicated module. Adding a new method:
  1. Add a handler function in the appropriate module.
  2. Register it in HANDLERS below.
  3. No changes to this file's protocol loop.
"""

from __future__ import annotations

import sys
import os
import json
import logging
from typing import Any, Callable

# Add parent directory to sys.path so that 'qforge' package can be imported when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from qforge.protocol import (
    JsonRpcRequest,
    JsonRpcSuccess,
    JsonRpcError,
    PARSE_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    INTERNAL_ERROR,
)
from qforge.analyzer.circuit_analyzer import handle_analyze_circuit

# ---------------------------------------------------------------------------
# Logging — goes to stderr so it doesn't pollute the stdout JSON-RPC stream
# ---------------------------------------------------------------------------

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="[qforge/server] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Method registry
# ---------------------------------------------------------------------------

Handler = Callable[[Any], Any]

HANDLERS: dict[str, Handler] = {
    "analyzeCircuit": handle_analyze_circuit,
}


# ---------------------------------------------------------------------------
# Protocol loop
# ---------------------------------------------------------------------------

def send_response(response: JsonRpcSuccess | JsonRpcError) -> None:
    """Write a response line to stdout and flush immediately."""
    sys.stdout.write(response.to_json() + "\n")
    sys.stdout.flush()


def handle_line(line: str) -> None:
    """Parse and dispatch a single JSON-RPC request line."""
    request_id: str | None = None

    try:
        raw = json.loads(line)
        request = JsonRpcRequest.from_dict(raw)
        request_id = request.id
    except (json.JSONDecodeError, KeyError) as exc:
        send_response(JsonRpcError(id="null", code=PARSE_ERROR, message=str(exc)))
        return

    handler = HANDLERS.get(request.method)
    if handler is None:
        send_response(JsonRpcError(
            id=request.id,
            code=METHOD_NOT_FOUND,
            message=f"Unknown method: {request.method}",
        ))
        return

    try:
        result = handler(request.params)
        send_response(JsonRpcSuccess(id=request.id, result=result))
    except Exception as exc:
        log.exception("Unhandled error in handler %s", request.method)
        send_response(JsonRpcError(
            id=request.id,
            code=INTERNAL_ERROR,
            message=str(exc),
        ))


def main() -> None:
    """
    Main server loop. Reads newline-delimited JSON-RPC requests from stdin.
    Each line is one complete request.
    """
    log.info("QForge Python server starting. Python %s", sys.version.split()[0])

    # Signal readiness by flushing stdout (TypeScript side resolves startup promise on first data)
    sys.stdout.flush()

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            handle_line(line)
    except KeyboardInterrupt:
        pass
    finally:
        log.info("QForge Python server shutting down.")


if __name__ == "__main__":
    main()
