import React from 'react';

const LoadingSpinner = ({ message = "Processing..." }) => {
  return (
    <div className="loading-spinner-container">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p className="loading-text">{message}</p>
        <p className="loading-subtext">
          Analyzing floor plan and generating 3D model...
        </p>
      </div>
    </div>
  );
};

export default LoadingSpinner;