import React, { useState, useRef } from 'react';

const ImageUpload = ({ onFileProcess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFileSelection(file);
    }
  };

  const handleFileSelection = (file) => {
    // Check if file is an image
    if (!file.type.match('image.*')) {
      alert('Please select an image file (PNG, JPG, JPEG)');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size too large. Please select an image smaller than 10MB.');
      return;
    }

    setSelectedFile(file);
    onFileProcess(file);
  };

  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleConvertClick = () => {
    if (selectedFile) {
      onFileProcess(selectedFile);
    }
  };

  return (
    <div className="image-upload-container">
      <div 
        className={`upload-area ${dragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleUploadAreaClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="file-input"
        />
        
        {!selectedFile ? (
          <div className="upload-placeholder">
            <div className="upload-icon">📁</div>
            <p className="upload-text">Click to upload or drag and drop</p>
            <p className="upload-subtext">Supported formats: PNG, JPG, JPEG</p>
            <p className="upload-subtext">Max file size: 10MB</p>
          </div>
        ) : (
          <div className="file-preview">
            <div className="file-info">
              <div className="file-icon">📄</div>
              <div className="file-details">
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button 
              className="change-file-btn"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Change File
            </button>
          </div>
        )}
      </div>

      {selectedFile && (
        <button 
          className="convert-btn"
          onClick={handleConvertClick}
        >
          Convert to 3D
        </button>
      )}
    </div>
  );
};

export default ImageUpload;