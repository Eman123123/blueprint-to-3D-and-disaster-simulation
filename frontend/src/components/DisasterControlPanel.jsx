import React, { useState } from 'react';
import './DisasterControlPanel.css';

const DisasterControlPanel = ({ 
  onSimulationStart, 
  onSimulationStop, 
  isSimulationActive,
  timeRemaining,
  formattedTime,
  disasterParams 
}) => {
  const [selectedDisaster, setSelectedDisaster] = useState('earthquake');
  const [earthquakeParams, setEarthquakeParams] = useState({
    magnitude: 3,
    duration: 20,
    intensity: 1.0
  });

  const [floodParams, setFloodParams] = useState({
    duration: 30,
    speed: 0.05, // meters per second
    flowDirection: 'north'
  });

  const handleEarthquakeParamChange = (param, value) => {
    setEarthquakeParams(prev => ({
      ...prev,
      [param]: value
    }));
  };

  const handleFloodParamChange = (param, value) => {
    setFloodParams(prev => ({
      ...prev,
      [param]: value
    }));
  };

  const handleStartSimulation = () => {
    if (selectedDisaster === 'earthquake') {
      onSimulationStart('earthquake', earthquakeParams);
    } else if (selectedDisaster === 'flood') {
      onSimulationStart('flood', floodParams);
    }
  };

  return (
    <div className="disaster-control-panel">
      <h3>Disaster Simulation</h3>
      
      <div className="disaster-selection">
        <h4>Select Disaster</h4>
        <div className="disaster-buttons">
          <button 
            className={selectedDisaster === 'earthquake' ? 'active' : ''}
            onClick={() => setSelectedDisaster('earthquake')}
            disabled={isSimulationActive}
          >
            🌋 Earthquake
          </button>
          <button 
            className={selectedDisaster === 'flood' ? 'active' : ''}
            onClick={() => setSelectedDisaster('flood')}
            disabled={isSimulationActive}
          >
            🌊 Flood
          </button>
        </div>
      </div>

      {selectedDisaster === 'earthquake' && (
        <div className="earthquake-params">
          <h4>Earthquake Parameters</h4>
          
          <div className="param-row">
            <div className="param-label">
              <span className="param-icon">📏</span>
              <span>Magnitude:</span>
            </div>
            <div className="param-value-display">
              <button 
                className="param-btn minus"
                onClick={() => handleEarthquakeParamChange('magnitude', Math.max(1, earthquakeParams.magnitude - 0.1))}
                disabled={isSimulationActive}
              >
                -
              </button>
              <span className="value">{earthquakeParams.magnitude.toFixed(1)}</span>
              <button 
                className="param-btn plus"
                onClick={() => handleEarthquakeParamChange('magnitude', Math.min(10, earthquakeParams.magnitude + 0.1))}
                disabled={isSimulationActive}
              >
                +
              </button>
            </div>
          </div>

          <div className="param-row">
            <div className="param-label">
              <span className="param-icon">⏱️</span>
              <span>Duration:</span>
            </div>
            <div className="param-value-display">
              <button 
                className="param-btn minus"
                onClick={() => handleEarthquakeParamChange('duration', Math.max(5, earthquakeParams.duration - 5))}
                disabled={isSimulationActive}
              >
                -
              </button>
              <span className="value">{earthquakeParams.duration}s</span>
              <button 
                className="param-btn plus"
                onClick={() => handleEarthquakeParamChange('duration', Math.min(120, earthquakeParams.duration + 5))}
                disabled={isSimulationActive}
              >
                +
              </button>
            </div>
          </div>

          <div className="param-row">
            <div className="param-label">
              <span className="param-icon">⚡</span>
              <span>Intensity:</span>
            </div>
            <div className="param-value-display">
              <button 
                className="param-btn minus"
                onClick={() => handleEarthquakeParamChange('intensity', Math.max(0.1, earthquakeParams.intensity - 0.1))}
                disabled={isSimulationActive}
              >
                -
              </button>
              <span className="value">{earthquakeParams.intensity.toFixed(1)}</span>
              <button 
                className="param-btn plus"
                onClick={() => handleEarthquakeParamChange('intensity', Math.min(2.0, earthquakeParams.intensity + 0.1))}
                disabled={isSimulationActive}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDisaster === 'flood' && (
        <div className="flood-params">
          <h4>Flood Parameters</h4>

          <div className="param-row">
            <div className="param-label">
              <span className="param-icon">⏱️</span>
              <span>Duration:</span>
            </div>
            <div className="param-value-display">
              <button 
                className="param-btn minus"
                onClick={() => handleFloodParamChange('duration', Math.max(10, floodParams.duration - 10))}
                disabled={isSimulationActive}
              >
                -
              </button>
              <span className="value">{floodParams.duration}s</span>
              <button 
                className="param-btn plus"
                onClick={() => handleFloodParamChange('duration', Math.min(300, floodParams.duration + 10))}
                disabled={isSimulationActive}
              >
                +
              </button>
            </div>
          </div>

          <div className="param-row">
            <div className="param-label">
              <span className="param-icon">🚀</span>
              <span>Speed:</span>
            </div>
            <div className="param-value-display">
              <button 
                className="param-btn minus"
                onClick={() => handleFloodParamChange('speed', Math.max(0.01, floodParams.speed - 0.01))}
                disabled={isSimulationActive}
              >
                -
              </button>
              <span className="value">{floodParams.speed.toFixed(2)} m/s</span>
              <button 
                className="param-btn plus"
                onClick={() => handleFloodParamChange('speed', Math.min(0.2, floodParams.speed + 0.01))}
                disabled={isSimulationActive}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="simulation-controls">
        {isSimulationActive ? (
          <>
            <div className="simulation-status">
              <span className="timer-icon">⏱️</span>
              <span className="timer-text">Time Remaining: {formattedTime}</span>
            </div>
            <button className="stop-btn" onClick={onSimulationStop}>
              🛑 STOP SIMULATION
            </button>
          </>
        ) : (
          <button 
            className="start-btn" 
            onClick={handleStartSimulation}
            disabled={isSimulationActive}
          >
            ▶️ START SIMULATION
          </button>
        )}
      </div>
    </div>
  );
};

export default DisasterControlPanel;