"""
local_runner.py — Runs quantum circuits locally using Qiskit Aer or Qiskit Primitives,
with a robust pure-Python statevector simulator fallback.
"""

from __future__ import annotations
import logging
import time
import math
import random
from typing import Any

from qforge.parser.ast_extractor import extract_circuits

log = logging.getLogger(__name__)

def handle_run_simulator(params: Any) -> dict[str, Any]:
    """
    JSON-RPC handler for 'runSimulator'.
    Params: { source: str, filePath: str, shots: int, seed: int }
    """
    if not isinstance(params, dict):
        raise ValueError("runSimulator requires a dict params object")

    source: str = params.get("source", "")
    file_path: str = params.get("filePath", "<unknown>")
    shots: int = params.get("shots", 1024)
    seed: int | None = params.get("seed", None)

    circuits = extract_circuits(source, file_path)
    if not circuits:
        raise ValueError("No QuantumCircuit found in the provided source.")

    circuit_data = circuits[0]
    n_qubits = circuit_data.get("qubits", 1)
    gates = circuit_data.get("gates", [])

    start_time = time.perf_counter()

    # Try running with Qiskit
    try:
        counts, provider = _run_with_qiskit(circuit_data, shots, seed)
    except Exception as exc:
        log.warning("Qiskit simulation failed, falling back to mock simulator: %s", exc)
        counts = _run_mock_simulation(n_qubits, gates, shots, seed)
        provider = "QForge Mock Statevector Simulator (Fallback)"

    elapsed = int((time.perf_counter() - start_time) * 1000)

    return {
        "counts": counts,
        "provider": provider,
        "shots": shots,
        "executionTimeMs": max(elapsed, 1)
    }

def _run_with_qiskit(circuit_data: dict[str, Any], shots: int, seed: int | None) -> tuple[dict[str, int], str]:
    """Execute circuit using Qiskit Aer or Qiskit Primitives."""
    from qiskit import QuantumCircuit
    
    n_qubits = circuit_data["qubits"]
    n_cbits = circuit_data.get("classicalBits", 0)
    gates = circuit_data.get("gates", [])

    qc = QuantumCircuit(n_qubits, n_cbits or 0)
    
    has_measure = False
    for gate in gates:
        name = gate["name"]
        qubits = gate["qubits"]
        params = gate["params"]
        
        if name == "measure":
            has_measure = True

        gate_method = getattr(qc, name, None)
        if gate_method is None:
            continue
            
        if name == "measure":
            if len(qubits) >= 1:
                gate_method(qubits[0], qubits[0])
        elif params:
            gate_method(*params, *qubits)
        else:
            gate_method(*qubits)

    # If no measurement gates, measure all qubits
    if not has_measure:
        qc.measure_all()
        # Qiskit measure_all adds a new classical register, which is perfect for sampling

    # 1. Try Qiskit Aer
    try:
        from qiskit_aer import AerSimulator
        backend = AerSimulator()
        job = backend.run(qc, shots=shots, seed_simulator=seed)
        counts = job.result().get_counts()
        return counts, "Qiskit Aer Simulator"
    except ImportError:
        pass

    # 2. Try Qiskit 1.x StatevectorSampler primitive
    try:
        from qiskit.primitives import StatevectorSampler
        sampler = StatevectorSampler()
        # Pass seed viaoptions if supported, otherwise default run
        job = sampler.run([qc], shots=shots)
        result = job.result()
        
        # Merge counts from all classical registers
        counts: dict[str, int] = {}
        pub_result = result[0]
        for creg_name, value in pub_result.data.items():
            if hasattr(value, "get_counts"):
                reg_counts = value.get_counts()
                for bitstr, val in reg_counts.items():
                    counts[bitstr] = counts.get(bitstr, 0) + val
                    
        if counts:
            return counts, "Qiskit StatevectorSampler (Native)"
    except Exception:
        pass

    # 3. Try Qiskit 0.x / 1.x BasicAer / Aer fallback
    try:
        from qiskit import Aer
        backend = Aer.get_backend("qasm_simulator")
        job = backend.run(qc, shots=shots, seed_simulator=seed)
        counts = job.result().get_counts()
        return counts, "Qiskit QASM Simulator (Fallback)"
    except Exception:
        pass

    raise RuntimeError("No available Qiskit simulator backend found.")

def _run_mock_simulation(n_qubits: int, gates: list[dict[str, Any]], shots: int, seed: int | None) -> dict[str, int]:
    """
    Pure-Python statevector simulator for N qubits.
    Supports H, X, Y, Z, S, T, CX, CCX, and measure gates.
    """
    if seed is not None:
        random.seed(seed)

    # Statevector initialized to |00...0>
    # Statevector is a list of 2**N complex amplitudes
    dim = 2 ** n_qubits
    state = [0.0 + 0.0j] * dim
    state[0] = 1.0 + 0.0j

    for gate in gates:
        name = gate["name"]
        qubits = gate["qubits"]
        
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
            angle = cval = math.cos(math.pi / 4.0) + math.sin(math.pi / 4.0) * 1j
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

    # Probabilities
    probs = [abs(amp) ** 2 for amp in state]
    
    # Random sampling
    states = [format(i, f"0{n_qubits}b") for i in range(dim)]
    counts: dict[str, int] = {}
    
    if sum(probs) > 0.001:
        s = sum(probs)
        normalized_probs = [p / s for p in probs]
        samples = random.choices(states, weights=normalized_probs, k=shots)
        for item in samples:
            counts[item] = counts.get(item, 0) + 1
    else:
        counts[format(0, f"0{n_qubits}b")] = shots
        
    return counts
