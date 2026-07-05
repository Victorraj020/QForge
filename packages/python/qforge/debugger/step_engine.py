"""
step_engine.py — Phase 3 quantum circuit debugger stepping engine.

Computes the statevector at each execution step gate-by-gate, supporting
Qiskit's Statevector.from_instruction and a pure-Python statevector fallback.
"""

from __future__ import annotations
import logging
import math
import cmath
from typing import Any

from qforge.parser.ast_extractor import extract_circuits

log = logging.getLogger(__name__)


def handle_step_circuit(params: Any) -> dict[str, Any]:
    """
    JSON-RPC handler for 'debugStepCircuit'.
    Params: { source: str, filePath: str }
    """
    if not isinstance(params, dict):
        raise ValueError("debugStepCircuit requires a dict params object")

    source: str = params.get("source", "")
    file_path: str = params.get("filePath", "<unknown>")

    circuits = extract_circuits(source, file_path)
    if not circuits:
        raise ValueError("No QuantumCircuit found in the provided source.")

    circuit_data = circuits[0]
    n_qubits = circuit_data.get("qubits", 1)
    gates = circuit_data.get("gates", [])

    steps = []

    # Try simulating with Qiskit
    try:
        steps = _step_with_qiskit(n_qubits, gates)
    except Exception as exc:
        log.warning("Qiskit step simulation failed, falling back to mock: %s", exc)
        steps = _step_mock_simulation(n_qubits, gates)

    return {"steps": steps}


def _step_with_qiskit(n_qubits: int, gates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute intermediate statevectors using Qiskit."""
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector

    steps = []
    qc = QuantumCircuit(n_qubits)

    def get_amplitudes(sv: Statevector) -> list[dict[str, Any]]:
        amps = []
        dim = 2 ** n_qubits
        data = sv.data
        for i in range(dim):
            val = complex(data[i])
            prob = abs(val) ** 2
            phase = math.atan2(val.imag, val.real)
            amps.append({
                "state": format(i, f"0{n_qubits}b"),
                "re": round(val.real, 6),
                "im": round(val.imag, 6),
                "probability": round(prob, 6),
                "phase": round(phase, 6)
            })
        return amps

    # Step -1: Initial state
    sv_init = Statevector.from_instruction(qc)
    steps.append({
        "gateIndex": -1,
        "statevector": get_amplitudes(sv_init)
    })

    # Step 0 to M-1
    for idx, gate in enumerate(gates):
        name = gate["name"]
        qubits = gate["qubits"]
        params = gate.get("params", [])

        # Skip measure gates for statevector simulation (they are non-unitary)
        if name == "measure":
            # Current state remains unchanged
            sv_current = Statevector.from_instruction(qc)
            steps.append({
                "gateIndex": idx,
                "statevector": get_amplitudes(sv_current)
            })
            continue

        gate_method = getattr(qc, name, None)
        if gate_method is not None:
            if params:
                gate_method(*params, *qubits)
            else:
                gate_method(*qubits)

        sv_current = Statevector.from_instruction(qc)
        steps.append({
            "gateIndex": idx,
            "statevector": get_amplitudes(sv_current)
        })

    return steps


def _step_mock_simulation(n_qubits: int, gates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pure-Python fallback for step-by-step statevector simulation."""
    dim = 2 ** n_qubits
    state = [0.0 + 0.0j] * dim
    state[0] = 1.0 + 0.0j

    steps = []

    def get_amplitudes(curr_state: list[complex]) -> list[dict[str, Any]]:
        amps = []
        for i in range(dim):
            val = curr_state[i]
            prob = abs(val) ** 2
            phase = math.atan2(val.imag, val.real)
            amps.append({
                "state": format(i, f"0{n_qubits}b"),
                "re": round(val.real, 6),
                "im": round(val.imag, 6),
                "probability": round(prob, 6),
                "phase": round(phase, 6)
            })
        return amps

    # Step -1: Initial state
    steps.append({
        "gateIndex": -1,
        "statevector": get_amplitudes(state)
    })

    for idx, gate in enumerate(gates):
        name = gate["name"]
        qubits = gate["qubits"]
        params = gate.get("params", [])

        if name == "h":
            q = qubits[0]
            new_state = [0.0 + 0.0j] * dim
            sqrt2 = math.sqrt(2.0)
            for i in range(dim):
                bit = (i >> q) & 1
                if bit == 0:
                    partner = i | (1 << q)
                    val0 = state[i]
                    val1 = state[partner]
                    new_state[i] = (val0 + val1) / sqrt2
                    new_state[partner] = (val0 - val1) / sqrt2
            state = new_state

        elif name == "x":
            q = qubits[0]
            new_state = [0.0 + 0.0j] * dim
            for i in range(dim):
                partner = i ^ (1 << q)
                new_state[partner] = state[i]
            state = new_state

        elif name == "y":
            q = qubits[0]
            new_state = [0.0 + 0.0j] * dim
            for i in range(dim):
                partner = i ^ (1 << q)
                bit = (i >> q) & 1
                if bit == 0:
                    new_state[partner] = state[i] * 1j
                else:
                    new_state[partner] = state[i] * -1j
            state = new_state

        elif name == "z":
            q = qubits[0]
            new_state = list(state)
            for i in range(dim):
                if (i >> q) & 1:
                    new_state[i] *= -1.0
            state = new_state

        elif name == "s":
            q = qubits[0]
            new_state = list(state)
            for i in range(dim):
                if (i >> q) & 1:
                    new_state[i] *= 1j
            state = new_state

        elif name == "t":
            q = qubits[0]
            new_state = list(state)
            angle = math.cos(math.pi / 4.0) + math.sin(math.pi / 4.0) * 1j
            for i in range(dim):
                if (i >> q) & 1:
                    new_state[i] *= angle
            state = new_state

        elif name in ("cx", "cnot"):
            ctrl, tgt = qubits[0], qubits[1]
            new_state = list(state)
            for i in range(dim):
                if (i >> ctrl) & 1:
                    partner = i ^ (1 << tgt)
                    if i < partner:
                        new_state[i], new_state[partner] = state[partner], state[i]
            state = new_state

        elif name in ("ccx", "toffoli"):
            ctrl1, ctrl2, tgt = qubits[0], qubits[1], qubits[2]
            new_state = list(state)
            for i in range(dim):
                if ((i >> ctrl1) & 1) and ((i >> ctrl2) & 1):
                    partner = i ^ (1 << tgt)
                    if i < partner:
                        new_state[i], new_state[partner] = state[partner], state[i]
            state = new_state

        elif name == "cz":
            ctrl, tgt = qubits[0], qubits[1]
            new_state = list(state)
            for i in range(dim):
                if ((i >> ctrl) & 1) and ((i >> tgt) & 1):
                    new_state[i] *= -1.0
            state = new_state

        elif name == "swap":
            q1, q2 = qubits[0], qubits[1]
            new_state = list(state)
            for i in range(dim):
                bit1 = (i >> q1) & 1
                bit2 = (i >> q2) & 1
                if bit1 != bit2:
                    partner = i ^ (1 << q1) ^ (1 << q2)
                    if i < partner:
                        new_state[i], new_state[partner] = state[partner], state[i]
            state = new_state

        elif name == "rx" and params:
            q = qubits[0]
            theta = float(params[0])
            new_state = [0.0 + 0.0j] * dim
            cos_val = math.cos(theta / 2.0)
            sin_val = math.sin(theta / 2.0)
            for i in range(dim):
                bit = (i >> q) & 1
                if bit == 0:
                    partner = i | (1 << q)
                    val0 = state[i]
                    val1 = state[partner]
                    new_state[i] = cos_val * val0 - 1j * sin_val * val1
                    new_state[partner] = -1j * sin_val * val0 + cos_val * val1
            state = new_state

        elif name == "ry" and params:
            q = qubits[0]
            theta = float(params[0])
            new_state = [0.0 + 0.0j] * dim
            cos_val = math.cos(theta / 2.0)
            sin_val = math.sin(theta / 2.0)
            for i in range(dim):
                bit = (i >> q) & 1
                if bit == 0:
                    partner = i | (1 << q)
                    val0 = state[i]
                    val1 = state[partner]
                    new_state[i] = cos_val * val0 - sin_val * val1
                    new_state[partner] = sin_val * val0 + cos_val * val1
            state = new_state

        elif name == "rz" and params:
            q = qubits[0]
            theta = float(params[0])
            new_state = list(state)
            phase0 = cmath.exp(-1j * theta / 2.0)
            phase1 = cmath.exp(1j * theta / 2.0)
            for i in range(dim):
                if ((i >> q) & 1) == 0:
                    new_state[i] *= phase0
                else:
                    new_state[i] *= phase1
            state = new_state

        elif name == "measure":
            pass

        steps.append({
            "gateIndex": idx,
            "statevector": get_amplitudes(state)
        })

    return steps
