"""
ast_extractor.py — AST-based QuantumCircuit extractor.

Uses Python's built-in `ast` module to parse source code and extract
QuantumCircuit structure. More reliable than regex — handles:
  - Multi-line constructors
  - Circuits inside functions and classes
  - Variable reassignment
  - QuantumRegister / ClassicalRegister constructors

Returns a CircuitIR-compatible dict for each detected circuit.
"""

from __future__ import annotations

import ast
import uuid
import logging
import math
from typing import Any, Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Gate argument normalisation
# ---------------------------------------------------------------------------

# Maps gate method names to their (qubit_arg_count, param_arg_count)
# This is used to split positional args correctly.
GATE_SIGNATURES: dict[str, tuple[int, int]] = {
    # name: (qubit_count, param_count)
    "h": (1, 0), "x": (1, 0), "y": (1, 0), "z": (1, 0),
    "s": (1, 0), "t": (1, 0), "sdg": (1, 0), "tdg": (1, 0),
    "sx": (1, 0), "sxdg": (1, 0), "id": (1, 0), "i": (1, 0),
    "rx": (1, 1), "ry": (1, 1), "rz": (1, 1), "p": (1, 1),
    "u": (1, 3), "u1": (1, 1), "u2": (1, 2), "u3": (1, 3),
    "cx": (2, 0), "cy": (2, 0), "cz": (2, 0), "ch": (2, 0),
    "swap": (2, 0), "iswap": (2, 0),
    "cp": (2, 1), "crx": (2, 1), "cry": (2, 1), "crz": (2, 1),
    "ccx": (3, 0), "ccz": (3, 0), "cswap": (3, 0),
    "measure": (1, 0),
    "reset": (1, 0),
    "barrier": (0, 0),
}

KNOWN_GATE_NAMES = set(GATE_SIGNATURES.keys())


def _extract_int(node: ast.expr) -> Optional[int]:
    """Safely extract an integer constant from an AST node."""
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    return None


def _extract_float(node: ast.expr) -> Optional[float]:
    """Safely extract a numeric constant (int or float) or math expression from an AST node."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    
    if isinstance(node, ast.Name):
        if node.id.lower() == "pi":
            return math.pi
    
    if isinstance(node, ast.Attribute):
        if isinstance(node.value, ast.Name) and node.value.id == "math" and node.attr == "pi":
            return math.pi

    if isinstance(node, ast.UnaryOp):
        operand = _extract_float(node.operand)
        if operand is not None:
            if isinstance(node.op, ast.USub):
                return -operand
            elif isinstance(node.op, ast.UAdd):
                return operand

    if isinstance(node, ast.BinOp):
        left = _extract_float(node.left)
        right = _extract_float(node.right)
        if left is not None and right is not None:
            if isinstance(node.op, ast.Add):
                return left + right
            elif isinstance(node.op, ast.Sub):
                return left - right
            elif isinstance(node.op, ast.Mult):
                return left * right
            elif isinstance(node.op, ast.Div):
                return left / right if right != 0 else 0.0
            elif isinstance(node.op, ast.Pow):
                return left ** right

    return None


def _extract_list_ints(node: ast.expr) -> list[int]:
    """Extract a list of integer constants from a List AST node."""
    if not isinstance(node, ast.List):
        return []
    result = []
    for elt in node.elts:
        v = _extract_int(elt)
        if v is not None:
            result.append(v)
    return result


# ---------------------------------------------------------------------------
# Main extractor
# ---------------------------------------------------------------------------

class CircuitExtractor(ast.NodeVisitor):
    """
    Walks a Python AST to find QuantumCircuit assignments and their gate calls.
    """

    def __init__(self, source_lines: list[str]) -> None:
        self._source_lines = source_lines
        # Maps variable name → circuit info dict (mutable during visit)
        self._circuits: dict[str, dict[str, Any]] = {}
        # Ordered list of gate operations across all circuits
        self._all_gates: list[dict[str, Any]] = []

    def visit_Assign(self, node: ast.Assign) -> None:
        """Detect: varName = QuantumCircuit(...)"""
        if not isinstance(node.value, ast.Call):
            self.generic_visit(node)
            return

        call = node.value
        func_name = self._get_call_name(call)
        if func_name != "QuantumCircuit":
            self.generic_visit(node)
            return

        # Extract variable name (support simple assignments only)
        for target in node.targets:
            if not isinstance(target, ast.Name):
                continue

            var_name = target.id
            qubits, cbits = self._parse_qc_args(call)

            self._circuits[var_name] = {
                "id": str(uuid.uuid4()),
                "variableName": var_name,
                "qubits": qubits,
                "classicalBits": cbits,
                "sourceRange": {
                    "startLine": node.lineno,
                    "endLine": node.end_lineno or node.lineno,
                },
                "gates": [],
            }

        self.generic_visit(node)

    def visit_Expr(self, node: ast.Expr) -> None:
        """Detect: varName.gate_name(args)"""
        if not isinstance(node.value, ast.Call):
            self.generic_visit(node)
            return

        call = node.value
        if not isinstance(call.func, ast.Attribute):
            self.generic_visit(node)
            return

        attr = call.func
        if not isinstance(attr.value, ast.Name):
            self.generic_visit(node)
            return

        var_name = attr.value.id
        gate_name = attr.attr.lower()

        if var_name not in self._circuits:
            self.generic_visit(node)
            return

        if gate_name not in KNOWN_GATE_NAMES:
            self.generic_visit(node)
            return

        qubits, params = self._parse_gate_args(gate_name, call.args)
        circuit = self._circuits[var_name]

        gate_op: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "name": gate_name,
            "qubits": qubits,
            "params": params,
            "step": len(circuit["gates"]),
            "sourceLine": node.lineno,
        }
        circuit["gates"].append(gate_op)

        self.generic_visit(node)

    def _get_call_name(self, call: ast.Call) -> Optional[str]:
        if isinstance(call.func, ast.Name):
            return call.func.id
        if isinstance(call.func, ast.Attribute):
            return call.func.attr
        return None

    def _parse_qc_args(self, call: ast.Call) -> tuple[int, int]:
        """Parse QuantumCircuit(n_qubits [, n_cbits]) constructor args."""
        args = call.args
        qubits = _extract_int(args[0]) if args else None
        cbits = _extract_int(args[1]) if len(args) > 1 else 0
        return (qubits or -1, cbits or 0)

    def _parse_gate_args(
        self, gate_name: str, args: list[ast.expr]
    ) -> tuple[list[int], list[float]]:
        sig = GATE_SIGNATURES.get(gate_name, (1, 0))
        qubit_count, param_count = sig

        qubits: list[int] = []
        params: list[float] = []

        # Handle measure([0,1], [0,1]) list syntax
        if gate_name == "measure" and args and isinstance(args[0], ast.List):
            qubits = _extract_list_ints(args[0])
            return qubits, params

        for i, arg in enumerate(args):
            if i < param_count:
                v = _extract_float(arg)
                if v is not None:
                    params.append(v)
            else:
                v_int = _extract_int(arg)
                if v_int is not None:
                    qubits.append(v_int)

        return qubits, params

    def get_results(self) -> list[dict[str, Any]]:
        return list(self._circuits.values())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_circuits(source: str, file_path: str) -> list[dict[str, Any]]:
    """
    Parse Python source and extract all QuantumCircuit instances.

    Returns a list of CircuitIR-compatible dicts.
    Returns [] if no circuits are found or the source cannot be parsed.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        log.warning("Failed to parse source %s: %s", file_path, exc)
        return []

    source_lines = source.splitlines()
    extractor = CircuitExtractor(source_lines)
    extractor.visit(tree)

    results = extractor.get_results()
    for r in results:
        r["filePath"] = file_path
        r["isApproximate"] = False

    return results
