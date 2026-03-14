import React from 'react';

const PredictionResults = ({ prediction }) => {
  if (!prediction) return null;

  // Count objects by type
  const countObjects = () => {
    const counts = { wall: 0, door: 0, window: 0 };
    
    if (prediction.classes && Array.isArray(prediction.classes)) {
      prediction.classes.forEach(cls => {
        if (cls.name && counts.hasOwnProperty(cls.name)) {
          counts[cls.name]++;
        }
      });
    }
    
    return counts;
  };

  const counts = countObjects();

  return (
    <div className="prediction-results">
      <h3 className="results-title">Detection Results</h3>
      
      <div className="results-content">
        <div className="detection-summary">
          <div className="summary-header">
            <h4>✅ Detection Successful!</h4>
            <p className="summary-subtitle">Found the following elements:</p>
          </div>
          
          <div className="detection-stats">
            <div className="stat-item">
              <span className="stat-icon">🏗️</span>
              <span className="stat-label">Walls:</span>
              <span className="stat-value">{counts.wall}</span>
            </div>
            
            <div className="stat-item">
              <span className="stat-icon">🚪</span>
              <span className="stat-label">Doors:</span>
              <span className="stat-value">{counts.door}</span>
            </div>
            
            <div className="stat-item">
              <span className="stat-icon">🪟</span>
              <span className="stat-label">Windows:</span>
              <span className="stat-value">{counts.window}</span>
            </div>
          </div>

          {prediction.width && prediction.height && (
            <div className="image-info">
              <div className="info-item">
                <span className="info-label">Image Size:</span>
                <span className="info-value">
                  {prediction.width} × {prediction.height} pixels
                </span>
              </div>
            </div>
          )}

          <div className="success-message">
            <p>✓ Enhanced 3D model generated successfully!</p>
          </div>
        </div>

        {/* Additional prediction details can be added here */}
        {prediction.points && (
          <div className="detailed-results">
            <h5>Detailed Detection:</h5>
            <p className="detail-text">
              Processed {prediction.points.length} detection points
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionResults;