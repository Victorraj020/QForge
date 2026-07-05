/**
 * @file CircuitPreviewPanel.tsx
 * @description React view for the Circuit Preview panel.
 *
 * Shows the live SVG circuit diagram or local simulation results.
 * Updates in real time as the user types.
 */

import { useState, useEffect } from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { useUIStore } from '../store/uiStateStore';
import { CircuitCanvas } from '../components/CircuitCanvas';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { postMessageToExtension } from '../hooks/useVSCodeMessage';

export function CircuitPreviewPanel(): JSX.Element {
  const {
    circuit,
    simulationResult,
    isSimulating,
    setIsSimulating,
    debugResult,
    currentStepIndex,
    setCurrentStepIndex,
    isPlayMode,
    setIsPlayMode,
  } = useCircuitStore();
  const { isLoading, loadingMessage, error } = useUIStore();
  const [activeTab, setActiveTab] = useState<'diagram' | 'simulation' | 'debugger'>('diagram');
  const [shots, setShots] = useState<number>(1024);
  const [seed, setSeed] = useState<string>('');

  // Fetch debug states when switching to the debugger tab or when circuit updates
  useEffect(() => {
    if (activeTab === 'debugger') {
      postMessageToExtension({ type: 'REQUEST_DEBUG_STATES' });
    }
  }, [activeTab, circuit]);

  // Handle auto-play in Debugger mode
  useEffect(() => {
    if (!isPlayMode || !debugResult?.steps) {
      return;
    }
    const interval = setInterval(() => {
      setCurrentStepIndex((currentStepIndex + 1) % debugResult.steps.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlayMode, debugResult, currentStepIndex]);

  const handleRunSimulation = () => {
    setIsSimulating(true);
    postMessageToExtension({
      type: 'REQUEST_SIMULATOR_RUN',
      payload: {
        shots,
        seed: seed.trim() ? parseInt(seed, 10) : undefined,
      },
    });
  };

  if (isLoading) {
    return <LoadingSpinner message={loadingMessage} />;
  }

  if (error) {
    return (
      <div className="panel-error" role="alert">
        <span className="panel-error-icon">⚠️</span>
        <div className="panel-error-content">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!circuit) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">⚛️</div>
        <h2>No Circuit Detected</h2>
        <p>Open a Python file with a <code>QuantumCircuit</code> and start typing.</p>
        <p className="panel-empty-hint">Try: <code>qc = QuantumCircuit(2, 2)</code></p>
      </div>
    );
  }

  // Calculate histogram statistics
  let sortedStates: Array<[string, number]> = [];
  let totalCounts = 0;
  if (simulationResult?.counts) {
    sortedStates = Object.entries(simulationResult.counts).sort((a, b) => a[0].localeCompare(b[0]));
    totalCounts = sortedStates.reduce((sum, [_, count]) => sum + count, 0);
  }

  return (
    <div className="circuit-preview-panel">
      <header className="panel-header">
        <div className="panel-header-top">
          <h1 className="panel-title">
            <span className="panel-circuit-name">{circuit.variableName}</span>
            <span className="panel-circuit-meta">
              {circuit.qubits} qubit{circuit.qubits !== 1 ? 's' : ''}
              {circuit.classicalBits > 0 ? ` · ${circuit.classicalBits} classical` : ''}
              {' · '}
              {circuit.gates.length} gate{circuit.gates.length !== 1 ? 's' : ''}
              {circuit.isApproximate && <span className="badge-approx">approx.</span>}
            </span>
          </h1>
        </div>

        <div className="panel-tabs" role="tablist">
          <button
            className={`panel-tab ${activeTab === 'diagram' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'diagram'}
            onClick={() => setActiveTab('diagram')}
          >
            Diagram
          </button>
          <button
            className={`panel-tab ${activeTab === 'simulation' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'simulation'}
            onClick={() => setActiveTab('simulation')}
          >
            Simulation
          </button>
          <button
            className={`panel-tab ${activeTab === 'debugger' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'debugger'}
            onClick={() => setActiveTab('debugger')}
          >
            Debugger
          </button>
        </div>
      </header>

      <main className="circuit-panel-content">
        {activeTab === 'diagram' && (
          <div className="circuit-canvas-wrapper">
            <ErrorBoundary>
              <CircuitCanvas ir={circuit} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'simulation' && (
          <div className="simulator-view">
            {/* Control Panel */}
            <div className="sim-control-panel">
              <div className="sim-field">
                <label htmlFor="sim-shots-input" className="sim-label">Shots</label>
                <div className="sim-shots-container">
                  <input
                    type="number"
                    id="sim-shots-input"
                    className="sim-input"
                    value={shots}
                    min={1}
                    max={100000}
                    disabled={isSimulating}
                    onChange={(e) => setShots(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  />
                  <div className="sim-presets">
                    {[1024, 2048, 8192].map((preset) => (
                      <button
                        key={preset}
                        className={`preset-btn ${shots === preset ? 'active' : ''}`}
                        disabled={isSimulating}
                        onClick={() => setShots(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sim-field">
                <label htmlFor="sim-seed-input" className="sim-label">Seed (Optional)</label>
                <input
                  type="text"
                  id="sim-seed-input"
                  className="sim-input sim-seed-input"
                  placeholder="e.g. 42"
                  value={seed}
                  disabled={isSimulating}
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button
                className="panel-action-button sim-run-button"
                disabled={isSimulating}
                onClick={handleRunSimulation}
              >
                {isSimulating ? (
                  <>
                    <span className="sim-spinner"></span>
                    Simulating...
                  </>
                ) : (
                  'Run Simulation'
                )}
              </button>
            </div>

            {/* Results Area */}
            <div className="sim-results-panel">
              {isSimulating ? (
                <div className="sim-loading">
                  <div className="loading-spinner"></div>
                  <p className="loading-message">Executing simulation on local backend...</p>
                </div>
              ) : simulationResult ? (
                <div className="sim-results-card">
                  <h3 className="sim-results-title">Measurement Outcome Distribution</h3>
                  
                  <div className="histogram-container">
                    {sortedStates.length === 0 ? (
                      <div className="sim-empty-results">
                        <p>No measurement states returned. Check if the circuit contains measurements or qubits.</p>
                      </div>
                    ) : (
                      <div className="histogram">
                        {sortedStates.map(([bitstring, count]) => {
                          const percentage = totalCounts > 0 ? (count / totalCounts) * 100 : 0;
                          return (
                            <div key={bitstring} className="histogram-column">
                              <div className="histogram-bar-wrapper">
                                <div
                                  className="histogram-bar"
                                  style={{ height: `${percentage}%` }}
                                >
                                  <div className="histogram-bar-tooltip">
                                    <div className="tooltip-state">State: |{bitstring}⟩</div>
                                    <div className="tooltip-value">{count} shots ({percentage.toFixed(1)}%)</div>
                                  </div>
                                </div>
                              </div>
                              <div className="histogram-label" title={`|${bitstring}⟩`}>
                                |{bitstring}⟩
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="sim-meta-footer">
                    <div className="meta-item">
                      <span className="meta-label">Provider:</span>
                      <span className="meta-value">{simulationResult.provider}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Time:</span>
                      <span className="meta-value">{simulationResult.executionTimeMs} ms</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Shots:</span>
                      <span className="meta-value">{totalCounts}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sim-placeholder">
                  <div className="sim-placeholder-icon">📊</div>
                  <h3>Ready to Simulate</h3>
                  <p>Configure options above and click <strong>Run Simulation</strong> to compute measurement statistics.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'debugger' && (
          <div className="debugger-view">
            <div className="debug-layout">
              {/* Control Sidebar */}
              <div className="debug-sidebar">
                <div className="debug-card">
                  <h4 className="debug-card-title">Playback Controls</h4>
                  
                  {/* Media Buttons */}
                  <div className="debug-media-buttons">
                    <button
                      className="debug-btn"
                      title="Reset"
                      onClick={() => {
                        setIsPlayMode(false);
                        setCurrentStepIndex(0);
                      }}
                    >
                      ⏮️
                    </button>
                    <button
                      className="debug-btn"
                      title="Step Back"
                      onClick={() => {
                        setIsPlayMode(false);
                        setCurrentStepIndex(Math.max(0, currentStepIndex - 1));
                      }}
                    >
                      ◀️
                    </button>
                    <button
                      className={`debug-btn play-btn ${isPlayMode ? 'active' : ''}`}
                      title={isPlayMode ? 'Pause' : 'Play'}
                      onClick={() => setIsPlayMode(!isPlayMode)}
                    >
                      {isPlayMode ? '⏸️' : '▶️'}
                    </button>
                    <button
                      className="debug-btn"
                      title="Step Forward"
                      onClick={() => {
                        setIsPlayMode(false);
                        setCurrentStepIndex(Math.min((debugResult?.steps?.length ?? 1) - 1, currentStepIndex + 1));
                      }}
                    >
                      ▶️
                    </button>
                  </div>

                  {/* Scrubber Range Slider */}
                  {debugResult?.steps && (
                    <div className="debug-scrubber-container">
                      <input
                        type="range"
                        className="debug-scrubber"
                        min={0}
                        max={debugResult.steps.length - 1}
                        value={currentStepIndex}
                        onChange={(e) => {
                          setIsPlayMode(false);
                          setCurrentStepIndex(parseInt(e.target.value, 10));
                        }}
                      />
                      <div className="debug-step-text">
                        Step {currentStepIndex} / {debugResult.steps.length - 1}
                      </div>
                    </div>
                  )}
                </div>

                {/* Interactive Gate List */}
                <div className="debug-card gate-list-card">
                  <h4 className="debug-card-title">Execution Steps</h4>
                  <div className="debug-gate-list">
                    {/* Initial state step */}
                    <div
                      className={`debug-gate-item ${currentStepIndex === 0 ? 'active' : ''}`}
                      onClick={() => {
                        setIsPlayMode(false);
                        setCurrentStepIndex(0);
                      }}
                    >
                      <span className="gate-index">0</span>
                      <span className="gate-details">Initial State |00...0⟩</span>
                    </div>
                    
                    {/* Gates step */}
                    {circuit.gates.map((gate, idx) => {
                      const stepNum = idx + 1;
                      const targets = gate.qubits.map(q => `q${q}`).join(', ');
                      const paramsStr = gate.params && gate.params.length > 0
                        ? `(${gate.params.map(p => typeof p === 'number' ? p.toFixed(2) : p).join(', ')})`
                        : '';
                      return (
                        <div
                          key={idx}
                          className={`debug-gate-item ${currentStepIndex === stepNum ? 'active' : ''}`}
                          onClick={() => {
                            setIsPlayMode(false);
                            setCurrentStepIndex(stepNum);
                          }}
                        >
                          <span className="gate-index">{stepNum}</span>
                          <span className="gate-details">
                            <strong className="gate-name">{gate.name.toUpperCase()}</strong>
                            <span className="gate-targets"> on {targets}</span>
                            {paramsStr && <span className="gate-params"> {paramsStr}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Statevector Table */}
              <div className="debug-main">
                <div className="debug-card statevector-card">
                  <h4 className="debug-card-title">Intermediate Statevector</h4>
                  
                  {debugResult?.steps?.[currentStepIndex] ? (
                    <div className="statevector-list">
                      <div className="statevector-header">
                        <span className="col-basis">Basis State</span>
                        <span className="col-phase">Phase</span>
                        <span className="col-amplitude">Amplitude</span>
                        <span className="col-probability">Probability</span>
                      </div>
                      {debugResult.steps[currentStepIndex].statevector.map((amp) => {
                        const percentage = amp.probability * 100;
                        const isZero = amp.probability < 0.0001;
                        const hue = ((amp.phase + Math.PI) / (2 * Math.PI)) * 360;
                        const diskColor = isZero ? 'transparent' : `hsl(${hue}, 80%, 55%)`;
                        const strokeColor = isZero ? 'var(--vscode-panel-border)' : 'var(--vscode-editor-foreground)';
                        const lineStroke = isZero ? 'transparent' : 'var(--vscode-editor-background)';

                        // Amplitude string
                        const reStr = amp.re >= 0 ? `+${amp.re.toFixed(3)}` : amp.re.toFixed(3);
                        const imStr = amp.im >= 0 ? `+${amp.im.toFixed(3)}j` : `${amp.im.toFixed(3)}j`;
                        const ampStr = `${reStr} ${imStr}`;

                        return (
                          <div key={amp.state} className={`statevector-row ${amp.probability > 0.01 ? 'nonzero' : ''}`}>
                            <span className="col-basis">|{amp.state}⟩</span>
                            
                            <span className="col-phase">
                              <svg width="20" height="20" viewBox="0 0 20 20" className="phase-disk">
                                <circle cx="10" cy="10" r="8" fill={diskColor} stroke={strokeColor} strokeWidth="1.5" />
                                {!isZero && (
                                  <line
                                    x1="10"
                                    y1="10"
                                    x2={10 + 8 * Math.cos(amp.phase)}
                                    y2={10 - 8 * Math.sin(amp.phase)}
                                    stroke={lineStroke}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                )}
                              </svg>
                              {!isZero && <span className="phase-text">{(amp.phase * (180 / Math.PI)).toFixed(0)}°</span>}
                            </span>

                            <span className="col-amplitude" title={ampStr}>{ampStr}</span>
                            
                            <span className="col-probability">
                              <div className="prob-bar-wrapper">
                                <div className="prob-bar" style={{ width: `${percentage}%` }}></div>
                                <span className="prob-text">{percentage.toFixed(1)}%</span>
                              </div>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="sim-loading">
                      <div className="loading-spinner"></div>
                      <p className="loading-message">Calculating statevector values...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
