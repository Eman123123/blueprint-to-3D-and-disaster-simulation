// D:\FYP\frontend\src\App.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import Header from "./components/Header";
import ImageUpload from "./components/ImageUpload";
import LoadingSpinner from "./components/LoadingSpinner";
import PredictionResults from "./components/PredictionResults";
import DisasterControlPanel from "./components/DisasterControlPanel";
import SafetyGuidelines from "./components/SafetyGuidelines";
import EscapePathVisualizer from "./components/EscapePathVisualizer";
import "./App.css";

// =======================================================
// Furniture Default Dimensions Helper
// =======================================================

const getFurnitureDefaults = (type) => {
  const defaults = {
    bed: { width: 3.5, height: 2.5, depth: 4 },
    sofa: {  width: 4, height: 2, depth: 2.5 }, 
    chair: { width: 2, height: 3, depth: 1.7},
    table: { width: 2.5, height: 2, depth: 2.5 },
    dining: { width: 2.5, height: 2, depth: 4 }
  };
  return defaults[type] || defaults.bed;
};

// =======================================================
// Geometry Builder Functions
// =======================================================

// Floor - Enhanced with better raycast detection
function createEnhancedFloor(prediction, scaleX, scaleY, group) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  
  prediction.points.forEach((point, index) => {
    if (index >= prediction.classes.length) return;
    const cls = prediction.classes[index];
    if (cls.name === 'wall') {
      const x1 = point.x1 * scaleX;
      const z1 = point.y1 * scaleY;
      const x2 = point.x2 * scaleX;
      const z2 = point.y2 * scaleY;
      
      minX = Math.min(minX, x1, x2);
      maxX = Math.max(maxX, x1, x2);
      minZ = Math.min(minZ, z1, z2);
      maxZ = Math.max(maxZ, z1, z2);
    }
  });

  const foundationWidth = (maxX - minX) * 1.1;
  const foundationDepth = (maxZ - minZ) * 1.1;
  const foundationCenterX = (minX + maxX) / 2;
  const foundationCenterZ = (minZ + maxZ) / 2;

  // Main floor - make it more detectable
  const floorGeometry = new THREE.PlaneGeometry(foundationWidth, foundationDepth);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.8,
    metalness: 0.2,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(foundationCenterX, 0, foundationCenterZ);
  floor.receiveShadow = true;
  floor.userData = { 
    type: 'floor',
    selectable: true,
    isFloor: true
  };
  group.add(floor);

  // Foundation base
  const foundationGeometry = new THREE.BoxGeometry(foundationWidth, 0.2, foundationDepth);
  const foundationMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.9,
  });
  const foundation = new THREE.Mesh(foundationGeometry, foundationMaterial);
  foundation.position.set(foundationCenterX, -0.1, foundationCenterZ);
  foundation.receiveShadow = true;
  group.add(foundation);

  // Grid helper
  const gridSize = Math.max(foundationWidth, foundationDepth) * 1.2;
  const gridHelper = new THREE.GridHelper(gridSize, 20, 0x444444, 0x222222);
  gridHelper.position.set(foundationCenterX, 0.01, foundationCenterZ);
  group.add(gridHelper);

  return floor;
}

// Wall - Enhanced with earthquake simulation data
function createEnhancedWall(centerX, centerZ, width, depth, group) {
  const wallHeight = 6;
  
  const geometry = new THREE.BoxGeometry(width, wallHeight, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
  });
  const wall = new THREE.Mesh(geometry, material);
  wall.position.set(centerX, wallHeight / 2, centerZ);
  wall.castShadow = true;
  wall.receiveShadow = true;
  
  // CRITICAL: Set name for identification in GLB Analysis
  wall.name = "wall";
  
  wall.userData = { 
    type: 'wall',
    isWall: true,
    originalPosition: new THREE.Vector3(centerX, wallHeight / 2, centerZ),
    originalRotation: new THREE.Euler(0, 0, 0)
  };
  group.add(wall);

  return wall;
}

// Door - Enhanced with earthquake simulation data
function createEnhancedDoor(centerX, centerZ, width, depth, group) {
  const doorHeight = 4.2;
  const geometry = new THREE.BoxGeometry(width, doorHeight, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4ecdc4,
  });
  const door = new THREE.Mesh(geometry, material);
  door.position.set(centerX, doorHeight / 2, centerZ);
  door.castShadow = true;
  door.receiveShadow = true;
  
  // CRITICAL: Set name for identification in GLB Analysis
  door.name = "door";
  
  door.userData = { 
    type: 'door',
    isDoor: true,
    originalPosition: new THREE.Vector3(centerX, doorHeight / 2, centerZ),
    originalRotation: new THREE.Euler(0, 0, 0)
  };
  group.add(door);
  return door;
}

// Window - Enhanced with earthquake simulation data
function createEnhancedWindow(centerX, centerZ, width, depth, group) {
  const windowHeight = 2.5;
  const floorOffset = 1; 
  const geometry = new THREE.BoxGeometry(width, windowHeight, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x45b7d1,
    transparent: true,
    opacity: 0.6,
  });
  const windowMesh = new THREE.Mesh(geometry, material);
  windowMesh.position.set(centerX, floorOffset + windowHeight / 2, centerZ);
  windowMesh.castShadow = true;
  windowMesh.receiveShadow = true;
  
  // CRITICAL: Set name for identification in GLB Analysis
  windowMesh.name = "window";
  
  windowMesh.userData = { 
    type: 'window',
    isWindow: true,
    originalPosition: new THREE.Vector3(centerX, floorOffset + windowHeight / 2, centerZ),
    originalRotation: new THREE.Euler(0, 0, 0)
  };
  group.add(windowMesh);
  return windowMesh;
}

// =======================================================
// Furniture Geometry Functions - Modular Structure
// =======================================================

// Main furniture geometry factory function
export const createFurnitureGeometry = (type, dimensions, color) => {
  const { width, depth, height } = dimensions;
  
  switch (type) {
    case 'bed':
      return createBedGeometry(width, depth, height, color);
    case 'sofa':
      return createSofaGeometry(width, depth, height, color);
    case 'chair':
      return createChairGeometry(width, depth, height, color);
    case 'table':
      return createTableGeometry(width, depth, height, color);
    case 'dining':
      return createTableGeometry(width, depth, height, color)
    default:
      return createDefaultGeometry(width, depth, height, color);
  }
};

// Enhanced Bed with backrest (similar to sofa)
function createBedGeometry(width, depth, height, color) {
  const bedGroup = new THREE.Group();
  
  // Bed base/frame
  const bedFrameGeometry = new THREE.BoxGeometry(width, height * 0.2, depth);
  const bedFrameMaterial = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.7,
  });
  const bedFrame = new THREE.Mesh(bedFrameGeometry, bedFrameMaterial);
  bedFrame.position.set(0, height * 0.1, 0);
  bedFrame.castShadow = true;
  bedFrame.receiveShadow = true;
  bedGroup.add(bedFrame);
  
  // Mattress
  const mattressGeometry = new THREE.BoxGeometry(width - 0.2, 0.5, depth - 0.2);
  const mattressMaterial = new THREE.MeshStandardMaterial({
    color: 0x4169E1, // Blue mattress
    roughness: 0.8,
  });
  const mattress = new THREE.Mesh(mattressGeometry, mattressMaterial);
  mattress.position.set(0, height * 0.2 + 0.25, 0);
  mattress.castShadow = true;
  mattress.receiveShadow = true;
  bedGroup.add(mattress);
  
  // Headboard/Backrest (similar to sofa back)
  const headboardWidth = width * 0.9;
  const headboardHeight = height * 0.8;
  
  // Headboard frame
  const headboardFrameGeometry = new THREE.BoxGeometry(headboardWidth, headboardHeight, 0.25);
  const headboardFrame = new THREE.Mesh(headboardFrameGeometry, bedFrameMaterial);
  headboardFrame.position.set(0, headboardHeight/2, -depth/2 + 0.125);
  headboardFrame.castShadow = true;
  bedGroup.add(headboardFrame);
  
  // Headboard cushions (3 cushions like sofa)
  const cushionCount = 3;
  const cushionHeight = headboardHeight * 0.85;
  const cushionMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B4513, // Brown cushions
    roughness: 0.7,
  });
  
  for (let i = 0; i < cushionCount; i++) {
    const cushionWidth = headboardWidth / cushionCount * 0.9;
    const cushionGeometry = new THREE.BoxGeometry(cushionWidth, cushionHeight, 0.15);
    
    const xPos = -headboardWidth/2 + cushionWidth/2 + i * (headboardWidth / cushionCount);
    const cushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
    cushion.position.set(xPos, headboardHeight/2, -depth/2 + 0.25);
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    bedGroup.add(cushion);
  }
  
  // Footboard (smaller version at foot of bed)
  const footboardHeight = height * 0.4;
  const footboardGeometry = new THREE.BoxGeometry(width * 0.9, footboardHeight, 0.15);
  const footboard = new THREE.Mesh(footboardGeometry, bedFrameMaterial);
  footboard.position.set(0, footboardHeight/2, depth/2 - 0.075);
  footboard.castShadow = true;
  bedGroup.add(footboard);
  
  // Bed legs (4 legs)
  const legGeometry = new THREE.BoxGeometry(0.2, height * 0.2, 0.2);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321, // Dark wood
    roughness: 0.8,
  });
  
  const legPositions = [
    [-width/2 + 0.3, 0, -depth/2 + 0.3],
    [width/2 - 0.3, 0, -depth/2 + 0.3],
    [-width/2 + 0.3, 0, depth/2 - 0.3],
    [width/2 - 0.3, 0, depth/2 - 0.3],
  ];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    bedGroup.add(leg);
  });
  
  // Pillows (2 pillows)
  const pillowGeometry = new THREE.BoxGeometry(1.5, 0.3, 1.0);
  const pillowMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, // White pillows
    roughness: 0.9,
  });
  
  // Left pillow
  const leftPillow = new THREE.Mesh(pillowGeometry, pillowMaterial);
  leftPillow.position.set(-width/4, height * 0.2 + 0.3, 0);
  leftPillow.castShadow = true;
  bedGroup.add(leftPillow);
  
  // Right pillow
  const rightPillow = new THREE.Mesh(pillowGeometry, pillowMaterial);
  rightPillow.position.set(width/4, height * 0.2 + 0.3, 0);
  rightPillow.castShadow = true;
  bedGroup.add(rightPillow);
  
  return bedGroup;
}

function createSofaGeometry(width, depth, height, color) {
  const sofaGroup = new THREE.Group();
  
  // Seat base
  const seatGeometry = new THREE.BoxGeometry(width, height * 0.4, depth * 0.8);
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.8,
  });
  const seat = new THREE.Mesh(seatGeometry, seatMaterial);
  seat.position.set(0, height * 0.2, depth * 0.1);
  seat.castShadow = true;
  seat.receiveShadow = true;
  sofaGroup.add(seat);
  
  // Back
  const backGeometry = new THREE.BoxGeometry(width, height * 0.8, 0.2);
  const back = new THREE.Mesh(backGeometry, seatMaterial);
  back.position.set(0, height * 0.6, -depth * 0.4 + 0.1);
  back.castShadow = true;
  sofaGroup.add(back);
  
  // Arms
  const armGeometry = new THREE.BoxGeometry(0.3, height * 0.8, depth * 0.8);
  const leftArm = new THREE.Mesh(armGeometry, seatMaterial);
  leftArm.position.set(-width / 2 + 0.15, height * 0.4, depth * 0.1);
  leftArm.castShadow = true;
  sofaGroup.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeometry, seatMaterial);
  rightArm.position.set(width / 2 - 0.15, height * 0.4, depth * 0.1);
  rightArm.castShadow = true;
  sofaGroup.add(rightArm);
  
  return sofaGroup;
}

// Chair with backrest
function createChairGeometry(width, depth, height, color) {
  const chairGroup = new THREE.Group();
  
  // Seat
  const seatGeometry = new THREE.BoxGeometry(width, 0.1, depth);
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.7,
  });
  const seat = new THREE.Mesh(seatGeometry, seatMaterial);
  seat.position.set(0, height * 0.3, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  chairGroup.add(seat);
  
  // Back
  const backGeometry = new THREE.BoxGeometry(width, height * 0.6, 0.1);
  const back = new THREE.Mesh(backGeometry, seatMaterial);
  back.position.set(0, height * 0.6, -depth / 2 + 0.05);
  back.castShadow = true;
  chairGroup.add(back);
  
  // Legs
  const legGeometry = new THREE.BoxGeometry(0.1, height * 0.3, 0.1);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.8,
  });
  
  const legPositions = [
    [-width/2 + 0.05, height * 0.15, -depth/2 + 0.05],
    [width/2 - 0.05, height * 0.15, -depth/2 + 0.05],
    [-width/2 + 0.05, height * 0.15, depth/2 - 0.05],
    [width/2 - 0.05, height * 0.15, depth/2 - 0.05],
  ];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    chairGroup.add(leg);
  });
  
  return chairGroup;
}

// Table with legs
function createTableGeometry(width, depth, height, color) {
  const tableGroup = new THREE.Group();
  
  // Table top
  const tableTopGeometry = new THREE.BoxGeometry(width, 0.3, depth);
  const tableTopMaterial = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.6,
  });
  const tableTop = new THREE.Mesh(tableTopGeometry, tableTopMaterial);
  tableTop.position.set(0, height, 0);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  tableGroup.add(tableTop);
  
  // Table legs
  const legGeometry = new THREE.BoxGeometry(0.3, height, 0.3);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.8,
  });
  
  const positions = [
    [-width/2 + 0.3, height/2, -depth/2 + 0.3],
    [width/2 - 0.3, height/2, -depth/2 + 0.3],
    [-width/2 + 0.3, height/2, depth/2 - 0.3],
    [width/2 - 0.3, height/2, depth/2 - 0.3],
  ];
  
  positions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    tableGroup.add(leg);
  });
  
  return tableGroup;
}

// Default fallback geometry
function createDefaultGeometry(width, depth, height, color) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.7,
  });
  return new THREE.Mesh(geometry, material);
}

// Preview version (transparent)
export const createFurniturePreview = (type, dimensions, color) => {
  const preview = createFurnitureGeometry(type, dimensions, color);
  
  // Make transparent for preview
  preview.traverse((child) => {
    if (child.isMesh) {
      child.material.transparent = true;
      child.material.opacity = 0.7;
    }
  });
  
  preview.userData.isPreview = true;
  return preview;
};

// =======================================================
// Wrapper Functions for Your Existing Code
// =======================================================

// Furniture creation functions - Uses the modular geometry functions
function createCustomFurniture(type, centerX, centerZ, dimensions, color, group) {
  const { width, depth, height } = dimensions;
  
  // Create the geometry using the modular function
  const furniture = createFurnitureGeometry(type, dimensions, color);
  
  // Position the furniture
  furniture.position.set(centerX, 0, centerZ);
  
  // Add userData for furniture management
  furniture.userData.isFurniture = true;
  furniture.userData.originalColor = color;
  furniture.userData.dimensions = dimensions;
  furniture.userData.furnitureType = type;
  furniture.userData.originalPosition = furniture.position.clone();
  furniture.userData.originalRotation = furniture.rotation.clone();
  furniture.userData.originalScale = furniture.scale.clone();
  
  // Add shadows to all parts
  furniture.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.isPartOf = furniture;
    }
  });
  
  // Add to the group
  group.add(furniture);
  
  return furniture;
}

// =======================================================
// ENHANCED DISASTER SIMULATION FUNCTIONS
// =======================================================

// Enhanced earthquake simulation with magnitude-based shaking
function simulateEnhancedEarthquake(object, magnitude, time, objectId, originalPositions, originalRotations) {
  if (!originalPositions.has(objectId)) {
    originalPositions.set(objectId, object.position.clone());
    originalRotations.set(objectId, object.rotation.clone());
  }

  const baseIntensity = magnitude * 0.1;
  const objectSeed = objectId ? objectId.length : Math.random() * 1000;

  // Check object type using userData
  const isWallItem = object.userData?.isWall || object.userData?.isDoor || object.userData?.isWindow;
  const isFurniture = object.userData?.isFurniture;
  const isFloor = object.userData?.isFloor;
  
  // Get original positions
  const originalPos = originalPositions.get(objectId);
  const originalRot = originalRotations.get(objectId);
  
  if (isWallItem) {
    let shakeMultiplier = 1.0;
    
    if (magnitude < 4.0) {
      shakeMultiplier = 0.3;
    } else if (magnitude < 6.0) {
      shakeMultiplier = 0.6;
    } else if (magnitude < 8.0) {
      shakeMultiplier = 1.0;
    } else {
      shakeMultiplier = 0.8;
    }
    
    // Position shaking
    const shakeX = Math.sin(time * 15 + objectSeed) * baseIntensity * 0.05 * shakeMultiplier;
    const shakeY = Math.sin(time * 12 + objectSeed * 2) * baseIntensity * 0.03 * shakeMultiplier;
    const shakeZ = Math.cos(time * 18 + objectSeed * 3) * baseIntensity * 0.05 * shakeMultiplier;
    
    // Apply position shake
    object.position.set(
      originalPos.x + shakeX,
      originalPos.y + shakeY,
      originalPos.z + shakeZ
    );
    
    // Rotation shaking
    const rotIntensity = baseIntensity * 0.02 * shakeMultiplier;
    if (magnitude > 4.0) {
      const rotX = Math.sin(time * 8 + objectSeed) * rotIntensity;
      const rotY = Math.cos(time * 10 + objectSeed) * rotIntensity * 0.5;
      const rotZ = Math.sin(time * 6 + objectSeed) * rotIntensity;
      
      object.rotation.set(
        originalRot.x + rotX,
        originalRot.y + rotY,
        originalRot.z + rotZ
      );
    }
    
  } else if (isFurniture) {
    let shakeMultiplier = 1.0;
    
    if (object.userData.furnitureType === 'table' || object.userData.furnitureType === 'dining') {
      shakeMultiplier = 0.7;
    } else if (object.userData.furnitureType === 'bed') {
      shakeMultiplier = 0.9;
    } else if (object.userData.furnitureType === 'sofa') {
      shakeMultiplier = 1.0;
    } else if (object.userData.furnitureType === 'chair') {
      shakeMultiplier = 1.2;
    }
    
    if (magnitude < 4.0) {
      shakeMultiplier *= 0.4;
    } else if (magnitude < 6.0) {
      shakeMultiplier *= 0.8;
    } else if (magnitude < 8.0) {
      shakeMultiplier *= 1.2;
    } else {
      shakeMultiplier *= 1.0;
    }
    
    // Generate shake patterns
    const shakeX = Math.sin(time * 20 + objectSeed) * baseIntensity * 0.1 * shakeMultiplier;
    const shakeZ = Math.cos(time * 18 + objectSeed) * baseIntensity * 0.1 * shakeMultiplier;
    const shakeY = Math.sin(time * 15 + objectSeed) * baseIntensity * 0.05 * shakeMultiplier;
    
    object.position.set(
      originalPos.x + shakeX,
      originalPos.y + shakeY,
      originalPos.z + shakeZ
    );
    
    // Apply rotation shake
    if (magnitude > 3.0) {
      const rotShake = baseIntensity * 0.08 * shakeMultiplier;
      object.rotation.x = originalRot.x + Math.sin(time * 12 + objectSeed) * rotShake;
      object.rotation.z = originalRot.z + Math.cos(time * 10 + objectSeed) * rotShake;
      
      if (magnitude > 5.0) {
        object.rotation.y = originalRot.y + Math.sin(time * 8 + objectSeed) * rotShake * 0.7;
      }
    }
    
    if (magnitude > 6.5 && Math.random() < 0.001 * (magnitude - 6.5)) {
      object.rotation.x = Math.PI / 2;
    }
    
  } else if (isFloor) {
    const floorShakeIntensity = Math.min(0.005, baseIntensity * 0.001);
    const floorShakeX = Math.sin(time * 8) * floorShakeIntensity;
    const floorShakeZ = Math.cos(time * 6) * floorShakeIntensity;
    
    object.rotation.x = originalRot.x + floorShakeX;
    object.rotation.z = originalRot.z + floorShakeZ;
    
    if (magnitude > 6.0) {
      const crackIntensity = (magnitude - 6.0) * 0.02;
      object.scale.set(
        1.0 - Math.sin(time * 2) * crackIntensity,
        1,
        1.0 - Math.cos(time * 3) * crackIntensity
      );
    }
  }
}

// Create water plane for flood simulation
function createWaterPlane(scene, width, depth, position, opacity = 0.6) {
  const waterGeometry = new THREE.PlaneGeometry(width, depth);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0077be,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(position.x, position.y, position.z);
  water.userData = { type: 'water', isDisasterEffect: true };
  
  scene.add(water);
  return water;
}

// ENHANCED FLOOD SIMULATION - SLOW WATER RISE, 90% WALL LIMIT
function simulateEnhancedFlood(object, elapsedTime, offset) {
  if (!object.userData.originalPosition) {
    object.userData.originalPosition = object.position.clone();
    object.userData.originalRotation = object.rotation.clone();
    object.userData.originalColor = object.material?.color?.getHex() || 0x8B4513;
  }
  
  const floodState = window.floodProgressRef?.current;
  
  if (!floodState?.isFloodActive) return;
  
  const currentWaterLevel = floodState.currentWaterLevel || 0;
  const objectBaseHeight = object.userData.originalPosition.y;
  const objectHeight = object.userData.dimensions?.height || 1;
  
  // Furniture stays at original position
  object.position.y = objectBaseHeight;
  
  // Calculate how much of the furniture is submerged
  const waterCoverageRatio = Math.max(0, Math.min(1, (currentWaterLevel - objectBaseHeight) / objectHeight));
  
  // Only apply effects when furniture is actually in water
  if (waterCoverageRatio > 0.1) {
    // When water touches furniture (more than 10% coverage)
    const effectIntensity = Math.min(waterCoverageRatio, 0.5); // Cap intensity
    
    // Apply very subtle water effects
    const tiltIntensity = 0.03 * effectIntensity; // Reduced tilting
    object.rotation.x = object.userData.originalRotation.x + 
      Math.sin(elapsedTime * 0.3 + offset) * tiltIntensity;
    object.rotation.z = object.userData.originalRotation.z + 
      Math.cos(elapsedTime * 0.4 + offset) * tiltIntensity * 0.5;
    
    // Change color when wet
    if (object.material && waterCoverageRatio > 0.3) {
      const originalColor = object.userData.originalColor || 0x8B4513;
      const wetColor = 0x2F4F4F; // Darker wet color
      const lerpFactor = Math.min((waterCoverageRatio - 0.3) * 2, 1);
      
      // Create new color by interpolating
      const originalColorObj = new THREE.Color(originalColor);
      const wetColorObj = new THREE.Color(wetColor);
      const currentColor = originalColorObj.clone().lerp(wetColorObj, lerpFactor);
      object.material.color.copy(currentColor);
    }
  } else {
    // Gradually return to original rotation
    const returnSpeed = 0.02;
    object.rotation.x += (object.userData.originalRotation.x - object.rotation.x) * returnSpeed;
    object.rotation.z += (object.userData.originalRotation.z - object.rotation.z) * returnSpeed;
    
    // Return to original color
    if (object.material && object.userData.originalColor) {
      const originalColor = new THREE.Color(object.userData.originalColor);
      const currentColor = object.material.color.clone();
      const newColor = currentColor.lerp(originalColor, 0.1);
      object.material.color.copy(newColor);
    }
  }
}

// Reset objects after disaster
function resetDisasterEffects(object) {
  if (object.userData.originalPosition) {
    object.position.copy(object.userData.originalPosition);
  }
  if (object.userData.originalRotation) {
    object.rotation.copy(object.userData.originalRotation);
  }
  if (object.userData.originalScale) {
    object.scale.copy(object.userData.originalScale);
  }
  if (object.userData.originalColor && object.material) {
    object.material.color.setHex(object.userData.originalColor);
  }
}

// =======================================================
// MAIN APP COMPONENT
// =======================================================
function App() {
  // Add user state
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Load user data from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');
    
    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsLoggedIn(true);
        console.log('✅ User loaded in VR module:', userData);
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }, []);
  
  // In VR module's App.jsx
const handleLogout = async () => {
  console.log('Logging out from VR module');
  
  try {
    // Get user email from localStorage or state
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const email = userData?.email;
    const token = localStorage.getItem('token');
    
    // Call backend to set logout flag
    await fetch('http://localhost:5000/api/auth/logout-from-vr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email,
        token,
        timestamp: Date.now()
      })
    });
    
  } catch (error) {
    console.error('Logout notification error:', error);
  } finally {
    // Clear VR module's localStorage
    localStorage.clear();
    
    // Update state
    setIsLoggedIn(false);
    setUser(null);
    
    // Redirect to main module's login page
    window.location.href = 'http://localhost:3000/login';
  }
};

  const [predictionData, setPredictionData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isViewerInitialized, setIsViewerInitialized] = useState(false);
  const [showFurniturePanel, setShowFurniturePanel] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [showDisasterPanel, setShowDisasterPanel] = useState(false);
  const [customFurnitureInput, setCustomFurnitureInput] = useState({
    type: 'bed',
    ...getFurnitureDefaults('bed'), // Get realistic defaults
    color: '#8B4513'
  });
  const [placementStatus, setPlacementStatus] = useState("");
  const [selectedFurniture, setSelectedFurniture] = useState(null);
  
  // Disaster simulation state
  const [isDisasterActive, setIsDisasterActive] = useState(false);
  const [currentDisaster, setCurrentDisaster] = useState(null);
  const [disasterParams, setDisasterParams] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showSafetyGuidelines, setShowSafetyGuidelines] = useState(false);
  const [formattedTime, setFormattedTime] = useState("00:00");
  const [currentWaterLevel, setCurrentWaterLevel] = useState(0);
  const [targetWaterLevel, setTargetWaterLevel] = useState(0);
  const [safeWaterLimit, setSafeWaterLimit] = useState(0);
  const [waterRiseRate, setWaterRiseRate] = useState(0);

  // Escape path state
  const [showEscapePath, setShowEscapePath] = useState(false);
  const [currentPlayerPosition, setCurrentPlayerPosition] = useState(null);
  const [escapePath, setEscapePath] = useState(null);
  const [isSelectingStartPoint, setIsSelectingStartPoint] = useState(false); 

  const viewerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const currentModelRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const outlineRef = useRef(null);
  const waterPlaneRef = useRef(null);
  const animationFrameRef = useRef(null);
  const disasterStartTimeRef = useRef(0);
  const escapeVisualizerRef = useRef(); 

  // Store original positions for enhanced earthquake simulation
  const originalPositionsRef = useRef(new Map());
  const originalRotationsRef = useRef(new Map());

  // Enhanced flood simulation state - PROPER WATER RISE
  const floodProgressRef = useRef({
    currentWaterLevel: 0,
    targetWaterLevel: 0,
    waterLevelIncreaseRate: 0.01, // Dynamic rate based on duration
    elapsedTime: 0,
    isFloodActive: false,
    flowDirection: { x: 0, z: 0 },
    hasReachedTarget: false,
    duration: 0,
    startTime: 0,
    floorBaseHeight: 0,
    maxSafeWaterLevel: 0
  });

  // EXTERNAL STOP CONTROL - Immediate stop flag
  const shouldStopRef = useRef(false);

  // Expose floodProgressRef globally for access in simulation functions
  useEffect(() => {
    window.floodProgressRef = floodProgressRef;
    return () => {
      delete window.floodProgressRef;
    };
  }, []);

  // Furniture placement mode state
  const furniturePlacementModeRef = useRef({
    active: false,
    previewMesh: null,
    furnitureType: null,
    dimensions: null,
    color: null
  });

  const cameraControlsRef = useRef({
    target: new THREE.Vector3(0, 0, 0),
    distance: 60,
    phi: Math.PI / 3,
    theta: Math.PI / 3,
    mouse: { x: 0, y: 0, prevX: 0, prevY: 0, isDown: false },
    sensitivity: 0.005,
    zoomSpeed: 0.001,
  });



  // Get player position (center of floor) - kept for fallback
  const getPlayerPosition = useCallback(() => {
    if (!sceneRef.current) return null;
    
    // Try to find a good starting point (center of floor)
    let floorPos = null;
    let floorBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    
    sceneRef.current.traverse((object) => {
      if (object.userData.type === 'floor') {
        floorPos = object.position.clone();
        
        // Also calculate bounds from floor geometry
        const geometry = object.geometry;
        if (geometry && geometry.parameters) {
          const halfWidth = (geometry.parameters.width || 10) / 2;
          const halfDepth = (geometry.parameters.height || (geometry.parameters.depth || 10)) / 2;
          
          floorBounds.minX = Math.min(floorBounds.minX, object.position.x - halfWidth);
          floorBounds.maxX = Math.max(floorBounds.maxX, object.position.x + halfWidth);
          floorBounds.minZ = Math.min(floorBounds.minZ, object.position.z - halfDepth);
          floorBounds.maxZ = Math.max(floorBounds.maxZ, object.position.z + halfDepth);
        }
      }
    });
    
    // If we found floor, place player near the center
    if (floorPos) {
      const centerX = (floorBounds.minX + floorBounds.maxX) / 2;
      const centerZ = (floorBounds.minZ + floorBounds.maxZ) / 2;
      
      return new THREE.Vector3(centerX, 0.1, centerZ);
    }
    
    return new THREE.Vector3(0, 0.1, 0); // Default fallback
  }, []);

  // Add this near the top of your App component, before other useEffects
useEffect(() => {
  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  const tokenParam = urlParams.get('token');
  
  console.log('🔍 VR Module - URL Parameters:', { 
    userParam: userParam ? '✅ Present' : '❌ Missing', 
    tokenParam: tokenParam ? '✅ Present' : '❌ Missing' 
  });
  
  if (userParam && tokenParam && userParam !== 'undefined' && tokenParam !== 'undefined' && userParam !== '' && tokenParam !== '') {
    try {
      // Decode and parse user data
      const userData = JSON.parse(decodeURIComponent(userParam));
      console.log('✅ VR Module - User data loaded from URL:', userData);
      
      // Store in localStorage for persistence within VR module
      localStorage.setItem('user', userParam);
      localStorage.setItem('token', tokenParam);
      
      // Update state
      setUser(userData);
      setIsLoggedIn(true);
      
      // Clean URL by removing parameters (optional)
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    } catch (e) {
      console.error('❌ VR Module - Error parsing user data from URL:', e);
    }
  }
  
  // Fallback to localStorage (in case user came directly)
  const storedUser = localStorage.getItem('user');
  const storedToken = localStorage.getItem('token');
  
  console.log('VR Module - Checking localStorage:', { 
    storedUser: storedUser ? '✅ Found' : '❌ Not found', 
    storedToken: storedToken ? '✅ Found' : '❌ Not found' 
  });
  
  if (storedToken && storedUser && storedUser !== 'undefined' && storedToken !== 'undefined') {
    try {
      const userData = JSON.parse(storedUser);
      console.log('✅ VR Module - User data loaded from localStorage:', userData);
      setUser(userData);
      setIsLoggedIn(true);
    } catch (e) {
      console.error('❌ VR Module - Error parsing user data from localStorage:', e);
    }
  } else {
    console.log('❌ VR Module - No user data found - user is not logged in');
  }
}, []);

  // Timer effect - Fixed to properly stop simulation
  useEffect(() => {
    let timerInterval;
    
    if (isDisasterActive && timeRemaining > 0) {
      timerInterval = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          
          // Format time for display
          const minutes = Math.floor(newTime / 60);
          const seconds = newTime % 60;
          setFormattedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
          
          if (newTime <= 0) {
            // Use immediate stop when timer ends
            console.log("⏱️ Timer ended - stopping simulation");
            handleDisasterSimulationStop();
            return 0;
          }
          return newTime;
        });
      }, 1000);
    }
    
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isDisasterActive, timeRemaining]);

  // SINGLE UNIFIED DISASTER ANIMATION LOOP
  useEffect(() => {
    console.log("🔄 Animation loop updated. isDisasterActive:", isDisasterActive, "shouldStop:", shouldStopRef.current);
    
    // Clean up any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (!isDisasterActive || shouldStopRef.current || !sceneRef.current) {
      console.log("🛑 Animation loop not starting - conditions not met");
      return;
    }
    
    let lastTime = Date.now();
    
    const animateDisaster = () => {
      // MULTIPLE STOP CHECKS - Ensure we stop when needed
      if (!isDisasterActive || shouldStopRef.current || !sceneRef.current) {
        console.log("🛑 Animation loop stopping - stop condition met");
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }
      
      const currentTime = Date.now();
      const elapsedTime = (currentTime - disasterStartTimeRef.current) / 1000;
      
      // Update flood progress time
      if (currentDisaster === 'flood') {
        const floodState = floodProgressRef.current;
        floodState.elapsedTime = elapsedTime;
        
        // RATE-BASED CALCULATION
        if (floodState.isFloodActive && !floodState.hasReachedTarget) {
          // Calculate water level based on elapsed time and fixed rate
          const newWaterLevel = Math.min(
            floodState.targetWaterLevel,
            floodState.waterLevelIncreaseRate * elapsedTime
          );
          
          // Update water level
          floodState.currentWaterLevel = newWaterLevel;
          setCurrentWaterLevel(newWaterLevel);
          
          // Check if we've reached target
          if (newWaterLevel >= floodState.targetWaterLevel) {
            floodState.hasReachedTarget = true;
            console.log("✅ Water reached safe limit!");
          }
        }
        
        // Check if timer has ended
        if (elapsedTime >= floodState.duration && !floodState.timerEnded) {
          floodState.timerEnded = true;
          console.log("⏱️ Timer ended at", elapsedTime.toFixed(1), "seconds");
        }
      }
      
      // Apply disaster effects to objects
      sceneRef.current.traverse((object) => {
        if (object.isMesh || object.isGroup) {
          // Generate unique ID for each object
          const objectId = object.uuid || object.id.toString();
          
          // Store original positions if not already stored
          if (!originalPositionsRef.current.has(objectId)) {
            originalPositionsRef.current.set(objectId, object.position.clone());
            originalRotationsRef.current.set(objectId, object.rotation.clone());
          }
          
          // Apply enhanced earthquake effects
          if (currentDisaster === 'earthquake') {
            const magnitude = disasterParams.magnitude || 5.0;
            
            simulateEnhancedEarthquake(
              object, 
              magnitude, 
              elapsedTime, 
              objectId,
              originalPositionsRef.current,
              originalRotationsRef.current
            );
          }
          
          // Apply improved flood effects
          if (currentDisaster === 'flood') {
            if (object.userData.isFurniture) {
              const offset = object.position.x + object.position.z;
              simulateEnhancedFlood(object, elapsedTime, offset);
            }
          }
        }
      });
      
      // Animate water plane to gradually rise
      if (currentDisaster === 'flood' && waterPlaneRef.current) {
        const floodState = floodProgressRef.current;
        
        if (floodState.isFloodActive) {
          // Get target height for current water level
          const targetHeight = floodState.floorBaseHeight + floodState.currentWaterLevel;
          
          // Smoothly interpolate water plane height
          const currentHeight = waterPlaneRef.current.position.y;
          const heightDiff = targetHeight - currentHeight;
          
          if (Math.abs(heightDiff) > 0.001) {
            // Smooth interpolation
            waterPlaneRef.current.position.y = currentHeight + heightDiff * 0.1;
          }
          
          // Add subtle wave motion
          const waveIntensity = 0.01;
          waterPlaneRef.current.position.y += Math.sin(elapsedTime * 0.5) * waveIntensity * 0.1;
          
          // Update water material
          if (waterPlaneRef.current.material) {
            const baseOpacity = 0.6;
            const waveOpacity = Math.sin(elapsedTime * 0.3) * 0.03;
            waterPlaneRef.current.material.opacity = Math.min(0.7, Math.max(0.5, baseOpacity + waveOpacity));
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animateDisaster);
    };
    
    console.log("▶️ Starting animation loop");
    disasterStartTimeRef.current = Date.now();
    animateDisaster();
    
    // Cleanup function
    return () => {
      console.log("🧹 Cleaning up animation loop");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isDisasterActive, currentDisaster, disasterParams]);

  // Get floor intersection point using raycasting
  const getFloorIntersectionPoint = useCallback((mouse, camera) => {
    if (!sceneRef.current || !camera) return null;

    raycasterRef.current.setFromCamera(mouse, camera);
    
    const intersectableObjects = [];
    sceneRef.current.traverse((child) => {
      if (child.isMesh && child.userData.type === 'floor') {
        intersectableObjects.push(child);
      }
    });

    const intersects = raycasterRef.current.intersectObjects(intersectableObjects);
    
    if (intersects.length > 0) {
      return intersects[0].point;
    }
    
    return null;
  }, []);

  // Create selection outline
  const createSelectionOutline = useCallback((object) => {
    if (outlineRef.current && sceneRef.current) {
      sceneRef.current.remove(outlineRef.current);
      outlineRef.current = null;
    }

    if (!object) return;

    let targetGeometry;
    
    if (object.isGroup) {
      object.traverse((child) => {
        if (child.isMesh && child.geometry && !targetGeometry) {
          targetGeometry = child.geometry;
        }
      });
    } else if (object.isMesh && object.geometry) {
      targetGeometry = object.geometry;
    }

    if (targetGeometry) {
      const geometry = targetGeometry.clone();
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        side: THREE.BackSide
      });
      
      const outline = new THREE.Mesh(geometry, outlineMaterial);
      outline.scale.multiplyScalar(1.05);
      outline.position.copy(object.position);
      outline.rotation.copy(object.rotation);
      outline.userData = { isOutline: true };
      
      sceneRef.current.add(outline);
      outlineRef.current = outline;
    }
  }, []);

  // Select furniture
  const selectFurniture = useCallback((object) => {
    if (outlineRef.current && sceneRef.current) {
      sceneRef.current.remove(outlineRef.current);
      outlineRef.current = null;
    }

    if (object && object.userData.isFurniture) {
      setSelectedFurniture(object);
      createSelectionOutline(object);
      setShowCustomizePanel(true);
    } else {
      setSelectedFurniture(null);
      setShowCustomizePanel(false);
    }
  }, [createSelectionOutline]);

  // Delete selected furniture
  const deleteSelectedFurniture = useCallback(() => {
    if (selectedFurniture && sceneRef.current) {
      if (outlineRef.current) {
        sceneRef.current.remove(outlineRef.current);
        outlineRef.current = null;
      }

      if (selectedFurniture.parent) {
        selectedFurniture.parent.remove(selectedFurniture);
      }

      setSelectedFurniture(null);
      setShowCustomizePanel(false);
      setPlacementStatus("✅ Furniture deleted successfully");
      setTimeout(() => setPlacementStatus(""), 3000);
    }
  }, [selectedFurniture]);

  // Rotate selected furniture
  const rotateFurniture = useCallback((degrees) => {
    if (selectedFurniture) {
      const radians = degrees * (Math.PI / 180);
      selectedFurniture.rotation.y += radians;
      
      if (outlineRef.current) {
        outlineRef.current.rotation.y = selectedFurniture.rotation.y;
      }
    }
  }, [selectedFurniture]);

  // Move furniture to new position
  const moveFurniture = useCallback((newX, newZ) => {
    if (selectedFurniture) {
      const deltaX = newX - selectedFurniture.position.x;
      const deltaZ = newZ - selectedFurniture.position.z;
      
      selectedFurniture.position.x = newX;
      selectedFurniture.position.z = newZ;
      
      if (selectedFurniture.isGroup) {
        selectedFurniture.children.forEach(child => {
          child.position.x += deltaX;
          child.position.z += deltaZ;
        });
      }
      
      if (sceneRef.current) {
        sceneRef.current.traverse((child) => {
          if (child.userData.isPartOf === selectedFurniture) {
            child.position.x += deltaX;
            child.position.z += deltaZ;
          }
        });
      }
      
      if (outlineRef.current) {
        outlineRef.current.position.copy(selectedFurniture.position);
      }
    }
  }, [selectedFurniture]);

  // Change furniture color
  const changeFurnitureColor = useCallback((color) => {
    if (selectedFurniture) {
      const furnitureType = selectedFurniture.userData?.furnitureType;
      
      if (selectedFurniture.isGroup) {
        selectedFurniture.traverse((child) => {
          if (child.isMesh && child.material) {
            // For all furniture types, change color for all parts
            child.material.color.setHex(color);
            child.userData.originalColor = color;
          }
        });
      }
      else if (selectedFurniture.isMesh && selectedFurniture.material) {
        selectedFurniture.material.color.setHex(color);
        selectedFurniture.userData.originalColor = color;
      }
      
      selectedFurniture.userData.originalColor = color;
    }
  }, [selectedFurniture]);

  // Place furniture at the specified position
  const placeFurniture = useCallback((x, z) => {
    if (!sceneRef.current || !currentModelRef.current) return;

    const placementMode = furniturePlacementModeRef.current;
    const color = parseInt(placementMode.color.replace('#', '0x'), 16);

    const furniture = createCustomFurniture(
      placementMode.furnitureType,
      x, z,
      placementMode.dimensions,
      color,
      currentModelRef.current
    );
    
    if (placementMode.previewMesh && sceneRef.current) {
      sceneRef.current.remove(placementMode.previewMesh);
    }
    
    furniturePlacementModeRef.current = {
      active: false,
      previewMesh: null,
      furnitureType: null,
      dimensions: null,
      color: null
    };
    
    setTimeout(() => {
      selectFurniture(furniture);
    }, 100);
    
    setPlacementStatus("✅ Furniture placed successfully!");
    setTimeout(() => setPlacementStatus(""), 3000);
  }, [selectFurniture]);

  // Enhanced mouse move handler for furniture preview
  const handleMouseMove = useCallback((event) => {
    if (!furniturePlacementModeRef.current.active) return;

    const container = viewerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    const intersectionPoint = getFloorIntersectionPoint(mouseRef.current, cameraRef.current);
    
    if (intersectionPoint && furniturePlacementModeRef.current.previewMesh) {
      furniturePlacementModeRef.current.previewMesh.position.set(
        intersectionPoint.x,
        furniturePlacementModeRef.current.previewMesh.position.y,
        intersectionPoint.z
      );
    }
  }, [getFloorIntersectionPoint]);

  // Enhanced click handler for furniture placement and selection
  const handleCanvasClick = useCallback((event) => {
    const placementMode = furniturePlacementModeRef.current;
    
    if (placementMode.active && placementMode.previewMesh) {
      const intersectionPoint = getFloorIntersectionPoint(mouseRef.current, cameraRef.current);
      if (intersectionPoint) {
        placeFurniture(intersectionPoint.x, intersectionPoint.z);
        event.preventDefault();
      }
      return;
    }

    const container = viewerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const intersectableObjects = [];
    sceneRef.current.traverse((child) => {
      if ((child.isMesh && (child.userData.isFurniture || child.userData.type === 'furniture')) ||
          (child.isGroup && child.userData.isFurniture)) {
        intersectableObjects.push(child);
      }
    });

    const intersects = raycasterRef.current.intersectObjects(intersectableObjects);
    
    if (intersects.length > 0) {
      let selectedObj = intersects[0].object;
      
      while (selectedObj.userData && selectedObj.userData.isPartOf) {
        selectedObj = selectedObj.userData.isPartOf;
      }
      
      if (selectedObj.userData && selectedObj.userData.isFurniture) {
        selectFurniture(selectedObj);
      } else {
        let parent = selectedObj.parent;
        while (parent) {
          if (parent.userData && parent.userData.isFurniture) {
            selectFurniture(parent);
            break;
          }
          parent = parent.parent;
        }
      }
      
      event.preventDefault();
    } else {
      selectFurniture(null);
    }
  }, [getFloorIntersectionPoint, placeFurniture, selectFurniture]);

  // Start furniture placement mode
  const startFurniturePlacement = useCallback(() => {
    const color = parseInt(customFurnitureInput.color.replace('#', '0x'), 16);
    const dimensions = {
      width: parseFloat(customFurnitureInput.width),
      depth: parseFloat(customFurnitureInput.depth),
      height: parseFloat(customFurnitureInput.height)
    };

    const previewMesh = createFurniturePreview(
      customFurnitureInput.type,
      dimensions,
      color
    );

    previewMesh.position.set(0, 0.1, 0);

    if (sceneRef.current) {
      sceneRef.current.add(previewMesh);
    }

    furniturePlacementModeRef.current = {
      active: true,
      previewMesh: previewMesh,
      furnitureType: customFurnitureInput.type,
      dimensions: dimensions,
      color: customFurnitureInput.color
    };

    setShowFurniturePanel(false);
    setPlacementStatus("Move mouse to position furniture, then click to place");
  }, [customFurnitureInput]);

  // Handle path calculated from visualizer
  const handlePathCalculated = useCallback((path) => {
    setEscapePath(path);
    console.log(`Escape path received: ${path.length} waypoints`);
  }, []);

  const handleDisasterSimulationStart = useCallback(async (disasterType, params) => {
  if (!sceneRef.current || !currentModelRef.current) {
    alert("Please load a floor plan first");
    return;
  }
  
  console.log("Starting enhanced disaster simulation:", disasterType, params);
  
  // Reset stop flag
  shouldStopRef.current = false;
  
  // Clear stored positions
  originalPositionsRef.current.clear();
  originalRotationsRef.current.clear();
  
  // Remove previous water plane
  if (waterPlaneRef.current && sceneRef.current) {
    sceneRef.current.remove(waterPlaneRef.current);
    waterPlaneRef.current = null;
  }
  
  // Reset flood state
  floodProgressRef.current = {
    currentWaterLevel: 0,
    targetWaterLevel: 0,
    waterLevelIncreaseRate: 0.01,
    elapsedTime: 0,
    isFloodActive: false,
    flowDirection: { x: 0, z: 0 },
    hasReachedTarget: false,
    duration: 0,
    startTime: 0,
    floorBaseHeight: 0,
    maxSafeWaterLevel: 0
  };
  
  // CRITICAL: Show escape path visualizer and enable selection mode
  setShowEscapePath(true);
  setCurrentPlayerPosition(null); // Clear any previous position
  setIsSelectingStartPoint(true); // Show instruction
  
  // Wait a moment for the visualizer to mount, then enable selection
  setTimeout(() => {
    if (escapeVisualizerRef.current && escapeVisualizerRef.current.enableStartPointSelection) {
      escapeVisualizerRef.current.enableStartPointSelection((worldPos, gridPos) => {
        console.log('✅ Start point selected for disaster:', worldPos);
        setCurrentPlayerPosition(worldPos);
        setIsSelectingStartPoint(false);
        
        // =====================================================
        // SHOW COUNTDOWN
        // =====================================================
        let countdown = 3;
        const countdownInterval = setInterval(() => {
          if (countdown > 0) {
            setPlacementStatus(`⏳ Simulation starting in ${countdown}...`);
            countdown--;
          } else {
            clearInterval(countdownInterval);
            setPlacementStatus("✅ Simulation started!");
            
            // Clear the success message after 2 seconds
            setTimeout(() => {
              setPlacementStatus("");
            }, 2000);
            
            // =====================================================
            // NOW START THE ACTUAL SIMULATION SETUP
            // =====================================================
            
            // Set disaster state
            setIsDisasterActive(true);
            setCurrentDisaster(disasterType);
            setDisasterParams(params);
            setTimeRemaining(params.duration || 90);
            disasterStartTimeRef.current = Date.now();
            
            // Show safety guidelines
            setShowSafetyGuidelines(true);
            
            // Format initial time
            const minutes = Math.floor(params.duration / 60);
            const seconds = params.duration % 60;
            setFormattedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            
            // =====================================================
            // FLOOD SIMULATION SETUP - ONLY NOW!
            // =====================================================
            
            let targetLevel = 0;
            
            if (disasterType === 'flood') {
              // Find the floor and wall heights
              let floorBaseHeight = 0;
              let wallHeight = 6; // Default wall height
              let maxWallY = -Infinity;
              
              sceneRef.current.traverse((object) => {
                if (object.userData.isWall) {
                  const geometry = object.geometry;
                  if (geometry && geometry.parameters) {
                    const height = geometry.parameters.height || 6;
                    const wallTopY = object.position.y + (height / 2);
                    wallHeight = Math.max(wallHeight, height);
                    maxWallY = Math.max(maxWallY, wallTopY);
                  }
                }
                if (object.userData.isFloor) {
                  floorBaseHeight = object.position.y;
                }
              });
              
              console.log(`Detected: Floor base=${floorBaseHeight.toFixed(2)}m, Wall height=${wallHeight}m`);
              
              // Calculate maximum safe water level (70% of wall height)
              const maxSafeWaterLevel = floorBaseHeight + (wallHeight * 0.70);
              targetLevel = maxSafeWaterLevel - floorBaseHeight;
              const simulationDuration = params.duration || 90;
              const effectiveRiseRate = 0.05; // meters per second
              
              // Initialize flood progress state
              floodProgressRef.current = {
                currentWaterLevel: 0,
                targetWaterLevel: targetLevel,
                waterLevelIncreaseRate: effectiveRiseRate,
                elapsedTime: 0,
                isFloodActive: true,
                duration: simulationDuration,
                flowDirection: {
                  x: params.flowDirection === 'east' ? 1 : params.flowDirection === 'west' ? -1 : 0,
                  z: params.flowDirection === 'north' ? 1 : params.flowDirection === 'south' ? -1 : 0
                },
                hasReachedTarget: false,
                startTime: Date.now(),
                floorBaseHeight: floorBaseHeight,
                maxSafeWaterLevel: maxSafeWaterLevel,
                timerEnded: false
              };
              
              setCurrentWaterLevel(0);
              setTargetWaterLevel(targetLevel);
              setSafeWaterLimit(maxSafeWaterLevel);
              setWaterRiseRate(effectiveRiseRate * 60);
              
              // Create water plane
              let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
              sceneRef.current.traverse((object) => {
                if (object.userData.type === 'floor') {
                  const geometry = object.geometry;
                  if (geometry) {
                    const position = object.position;
                    const width = geometry.parameters.width || 50;
                    const depth = geometry.parameters.height || 50;
                    minX = Math.min(minX, position.x - width/2);
                    maxX = Math.max(maxX, position.x + width/2);
                    minZ = Math.min(minZ, position.z - depth/2);
                    maxZ = Math.max(maxZ, position.z + depth/2);
                  }
                }
              });
              
              if (minX !== Infinity) {
                const centerX = (minX + maxX) / 2;
                const centerZ = (minZ + maxZ) / 2;
                const waterWidth = (maxX - minX) * 1.5;
                const waterDepth = (maxZ - minZ) * 1.5;
                
                waterPlaneRef.current = createWaterPlane(
                  sceneRef.current,
                  waterWidth,
                  waterDepth,
                  { x: centerX, y: floorBaseHeight, z: centerZ }
                );
                console.log('✅ Water plane created at height:', floorBaseHeight);
              }
            }
            
            console.log(`✅ Simulation started: ${disasterType}`);
          }
        }, 1000);
      });
      console.log('Start point selection enabled');
    }
  }, 500);
}, []);

  const handleDisasterSimulationStop = useCallback(() => {
  console.log("🛑 Stopping disaster simulation...");
  
  // Hide escape path when simulation stops
  setShowEscapePath(false);
  setEscapePath(null);
  setCurrentPlayerPosition(null);
  setIsSelectingStartPoint(false);
  
  // Clear visualizer's start point
  if (escapeVisualizerRef.current && escapeVisualizerRef.current.clearStartPoint) {
    escapeVisualizerRef.current.clearStartPoint();
  }
  
  // Set immediate stop flag
  shouldStopRef.current = true;
  
  // Cancel animation frame FIRST
  if (animationFrameRef.current) {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    console.log("✅ Animation frame cancelled");
  }
  
  // Reset all objects to original state
  if (sceneRef.current) {
    sceneRef.current.traverse((object) => {
      if (object.isMesh || object.isGroup) {
        resetDisasterEffects(object);
      }
    });
    
    // Remove water plane
    if (waterPlaneRef.current) {
      sceneRef.current.remove(waterPlaneRef.current);
      waterPlaneRef.current = null;
      console.log("✅ Water plane removed");
    }
  }
  
  // Clear stored positions
  originalPositionsRef.current.clear();
  originalRotationsRef.current.clear();
  
  // Reset flood state
  floodProgressRef.current = {
    currentWaterLevel: 0,
    targetWaterLevel: 0,
    waterLevelIncreaseRate: 0.01,
    elapsedTime: 0,
    isFloodActive: false,
    flowDirection: { x: 0, z: 0 },
    hasReachedTarget: false,
    duration: 0,
    startTime: 0,
    floorBaseHeight: 0,
    maxSafeWaterLevel: 0
  };
  
  // Reset React state
  setIsDisasterActive(false);
  setCurrentDisaster(null);
  setDisasterParams({});
  setTimeRemaining(0);
  setFormattedTime("00:00");
  setCurrentWaterLevel(0);
  setTargetWaterLevel(0);
  setSafeWaterLimit(0);
  setWaterRiseRate(0);
  
  // Hide safety guidelines
  setShowSafetyGuidelines(false);
  
  // Reset stop flag after a short delay
  setTimeout(() => {
    shouldStopRef.current = false;
    console.log("✅ Stop flag reset");
  }, 100);
  
  console.log("✅ Disaster simulation stopped completely");
}, []);

  const handleCloseGuidelines = useCallback(() => {
    setShowSafetyGuidelines(false);
  }, []);

  // Test backend connection on startup
  useEffect(() => {
    testBackendConnection();
  }, []);

  const testBackendConnection = async () => {
    try {
      const response = await fetch("http://127.0.0.1:5001/api/health");
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Backend connection successful:", data);
      } else {
        console.warn("⚠ Backend health check failed");
      }
    } catch (error) {
      console.error("❌ Backend connection failed:", error);
    }
  };

  // Animation + Camera Controls
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const controls = cameraControlsRef.current;
    const camera = cameraRef.current;
    const target = controls.target;

    requestAnimationFrame(animate);

    const x =
      target.x + controls.distance * Math.sin(controls.phi) * Math.sin(controls.theta);
    const y = target.y + controls.distance * Math.cos(controls.phi);
    const z =
      target.z + controls.distance * Math.sin(controls.phi) * Math.cos(controls.theta);

    camera.position.set(x, y, z);
    camera.lookAt(target);

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  // Enhanced Zoom Functions
  const zoomIn = () => {
    const controls = cameraControlsRef.current;
    controls.distance = Math.max(5, controls.distance - 5);
  };

  const zoomOut = () => {
    const controls = cameraControlsRef.current;
    controls.distance = Math.min(200, controls.distance + 5);
  };

  // Export as GLB
  const exportGLB = () => {
    if (!currentModelRef.current) {
      alert("No 3D model available to export");
      return;
    }

    const exporter = new GLTFExporter();
    exporter.parse(
      currentModelRef.current,
      (gltf) => {
        const glbData = gltf;
        const blob = new Blob([glbData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'floorplan.glb';
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error('GLB export error:', error);
        alert('Error exporting GLB file');
      },
      { binary: true }
    );
  };

  // Initialize 3D Viewer with proper event listeners
  const initThreeScene = useCallback(
    (container) => {
      try {
        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222222);
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
          60,
          container.clientWidth / container.clientHeight,
          0.1,
          1000
        );
        camera.position.set(0, 15, 25);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        window.__camera = camera;


        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.innerHTML = "";
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Enhanced lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight1.position.set(50, 50, 25);
        directionalLight1.castShadow = true;
        scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight2.position.set(-30, 40, -20);
        directionalLight2.castShadow = true;
        scene.add(directionalLight2);

        // Grid helper
        const gridHelper = new THREE.GridHelper(50, 25, 0x444444, 0x222222);
        scene.add(gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(15);
        scene.add(axesHelper);

        const controls = cameraControlsRef.current;

        // Mouse control handlers
        const handleMouseDown = (e) => {
          controls.mouse.isDown = true;
          controls.mouse.prevX = e.clientX;
          controls.mouse.prevY = e.clientY;
        };

        const handleMouseMoveGeneral = (e) => {
          handleMouseMove(e);
          
          if (!controls.mouse.isDown) return;
          const deltaX = e.clientX - controls.mouse.prevX;
          const deltaY = e.clientY - controls.mouse.prevY;

          controls.theta -= deltaX * controls.sensitivity;
          controls.phi -= deltaY * controls.sensitivity;
          controls.phi = Math.max(0.1, Math.min(Math.PI - 0.1, controls.phi));

          controls.mouse.prevX = e.clientX;
          controls.mouse.prevY = e.clientY;
        };

        const handleMouseUp = () => {
          controls.mouse.isDown = false;
        };

        const handleWheel = (e) => {
          controls.distance += e.deltaY * controls.zoomSpeed * Math.abs(controls.distance);
          controls.distance = Math.max(5, Math.min(100, controls.distance));
        };

        // Event listeners
        container.addEventListener("mousedown", handleMouseDown);
        container.addEventListener("mousemove", handleMouseMoveGeneral);
        container.addEventListener("mouseup", handleMouseUp);
        container.addEventListener("wheel", handleWheel);
        container.addEventListener("click", handleCanvasClick);

        // Store the handlers for cleanup
        container._mouseDownHandler = handleMouseDown;
        container._mouseMoveHandler = handleMouseMoveGeneral;
        container._mouseUpHandler = handleMouseUp;
        container._wheelHandler = handleWheel;
        container._clickHandler = handleCanvasClick;

        // Handle window resize
        const handleResize = () => {
          if (!container || !camera || !renderer) return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener("resize", handleResize);

        setIsViewerInitialized(true);
        animate();

        console.log("✅ Three.js scene initialized successfully with enhanced disaster simulation system");
      } catch (error) {
        console.error("❌ initThreeScene failed:", error);
        setError("Failed to initialize 3D viewer: " + error.message);
      }
    },
    [animate, handleMouseMove, handleCanvasClick]
  );

  // Clean up event listeners
  useEffect(() => {
    return () => {
      const container = viewerRef.current;
      if (container) {
        if (container._mouseDownHandler) container.removeEventListener("mousedown", container._mouseDownHandler);
        if (container._mouseMoveHandler) container.removeEventListener("mousemove", container._mouseMoveHandler);
        if (container._mouseUpHandler) container.removeEventListener("mouseup", container._mouseUpHandler);
        if (container._wheelHandler) container.removeEventListener("wheel", container._wheelHandler);
        if (container._clickHandler) container.removeEventListener("click", container._clickHandler);
      }
      
      // Clean up animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      delete window.__camera;

    };
  }, []);

  // Initialize Scene when container is ready
  useEffect(() => {
    const container = viewerRef.current;
    if (!container) {
      console.warn("3D container not yet mounted");
      return;
    }

    if (!isViewerInitialized) {
      console.log("🟡 Initializing 3D viewer...");
      initThreeScene(container);
    }
  }, [viewerRef.current, isViewerInitialized, initThreeScene]);

  // Generate 3D model when prediction data is available
  useEffect(() => {
    if (predictionData && isViewerInitialized) {
      console.log("🟢 Generating 3D model from prediction data");
      generateEnhanced3DModel(predictionData);
    }
  }, [predictionData, isViewerInitialized]);

  // File Upload / API Handler
  const handleFileProcess = async (file) => {
    if (!file) {
      setError("Please select a floor plan image first");
      return;
    }

    setSelectedFile(file);
    setIsLoading(true);
    setError("");
    setPredictionData(null);
    setShowFurniturePanel(false);
    setShowCustomizePanel(false);
    setShowDisasterPanel(false);
    setPlacementStatus("");
    setSelectedFurniture(null);
    
    // Stop any running disaster simulation
    if (isDisasterActive) {
      handleDisasterSimulationStop();
    }

    // Clear existing model and any preview
    if (currentModelRef.current && sceneRef.current) {
      sceneRef.current.remove(currentModelRef.current);
      currentModelRef.current = null;
    }
    
    // Remove outline
    if (outlineRef.current && sceneRef.current) {
      sceneRef.current.remove(outlineRef.current);
      outlineRef.current = null;
    }
    
    // Reset furniture placement mode
    furniturePlacementModeRef.current = {
      active: false,
      previewMesh: null,
      furnitureType: null,
      dimensions: null,
      color: null
    };

    const formData = new FormData();
    formData.append("image", file);

    try {
      console.log("🟡 Sending request to backend...");
      const response = await fetch("http://127.0.0.1:5001/api/convert", {
        method: "POST",
        body: formData,
        headers: { 
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("🟢 Backend response:", result);

      if (result.success) {
        setPredictionData(result.prediction);
        console.log("✅ Conversion successful");
      } else {
        throw new Error(result.message || "Conversion failed");
      }
    } catch (err) {
      console.error("❌ API Error:", err);
      setError("Error processing image: " + err.message);
      
      // Fallback: Create mock data for testing
      console.log("🟡 Creating mock data for testing...");
      const mockPrediction = createMockPredictionData();
      setPredictionData(mockPrediction);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock data for testing when backend is unavailable
  const createMockPredictionData = () => {
    return {
      width: 800,
      height: 600,
      points: [
        { x1: 100, y1: 100, x2: 700, y2: 150 }, // wall
        { x1: 100, y1: 100, x2: 150, y2: 500 }, // wall
        { x1: 650, y1: 100, x2: 700, y2: 500 }, // wall
        { x1: 100, y1: 450, x2: 700, y2: 500 }, // wall
        { x1: 350, y1: 450, x2: 450, y2: 500 }, // door
        { x1: 200, y1: 200, x2: 300, y2: 250 }, // window
        { x1: 500, y1: 200, x2: 600, y2: 250 }, // window
      ],
      classes: [
        { name: "wall" },
        { name: "wall" },
        { name: "wall" },
        { name: "wall" },
        { name: "door" },
        { name: "window" },
        { name: "window" },
      ]
    };
  };

  // 3D Model Generator
  const generateEnhanced3DModel = useCallback((prediction) => {
    if (!sceneRef.current || !prediction) {
      console.warn("Scene not ready or no prediction data");
      return;
    }

    console.log("🟩 Generating enhanced 3D model...");

    // Clear existing model
    if (currentModelRef.current) {
      sceneRef.current.remove(currentModelRef.current);
      currentModelRef.current = null;
    }

    const group = new THREE.Group();
    const scaleX = 0.03;
    const scaleY = 0.03;
    let objectCount = 0;

    // Create base floor
    createEnhancedFloor(prediction, scaleX, scaleY, group);

    // Create walls, doors, and windows from prediction data
    if (prediction.points && prediction.classes) {
      prediction.points.forEach((point, index) => {
        if (index >= prediction.classes.length) return;
        
        const cls = prediction.classes[index];
        if (!cls) return;

        const x1 = point.x1 * scaleX;
        const y1 = point.y1 * scaleY;
        const x2 = point.x2 * scaleX;
        const y2 = point.y2 * scaleY;
        
        const width = Math.abs(x2 - x1);
        const depth = Math.abs(y2 - y1);
        const centerX = (x1 + x2) / 2;
        const centerZ = (y1 + y2) / 2;

        // Create objects based on class
        switch (cls.name) {
          case "wall":
            const wall = createEnhancedWall(centerX, centerZ, width, depth, group);
            objectCount++;
            break;
          case "door":
            const door = createEnhancedDoor(centerX, centerZ, width, depth, group);
            objectCount++;
            break;
          case "window":
            const window = createEnhancedWindow(centerX, centerZ, width, depth, group);
            objectCount++;
            break;
          default:
            console.warn("Unknown class:", cls.name);
        }
      });
    }

    // Add the group to the scene
    sceneRef.current.add(group);
    currentModelRef.current = group;
    
    console.log(`✅ Added ${objectCount} objects to scene`);
    
    // Center camera on the new model
    setTimeout(() => {
      resetCamera();
    }, 100);
  }, []);

  // Utility Controls
  const resetCamera = () => {
    const controls = cameraControlsRef.current;
    controls.distance = 60;
    controls.phi = Math.PI / 3;
    controls.theta = Math.PI / 3;
    controls.target.set(0, 0, 0);
  };

  const toggleWireframe = () => {
    if (currentModelRef.current) {
      currentModelRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.wireframe = !child.material.wireframe;
        }
      });
    }
  };

  const handleReset = () => {
    // Stop any running disaster simulation
    if (isDisasterActive) {
      handleDisasterSimulationStop();
    }
    
    setPredictionData(null);
    setSelectedFile(null);
    setError("");
    setShowFurniturePanel(false);
    setShowCustomizePanel(false);
    setShowDisasterPanel(false);
    setPlacementStatus("");
    setSelectedFurniture(null);
    if (currentModelRef.current && sceneRef.current) {
      sceneRef.current.remove(currentModelRef.current);
      currentModelRef.current = null;
    }
    
    // Remove outline
    if (outlineRef.current && sceneRef.current) {
      sceneRef.current.remove(outlineRef.current);
      outlineRef.current = null;
    }
    
    // Reset furniture placement mode
    furniturePlacementModeRef.current = {
      active: false,
      previewMesh: null,
      furnitureType: null,
      dimensions: null,
      color: null
    };
  };

  return (
    <div className="App">
      {/* Pass user data to Header */}
      <Header 
        isLoggedIn={isLoggedIn}
        user={user}
        handleLogout={handleLogout}
        isAuthPage={false}
      />
      <main className="main-content">
        <div className="upload-section">
          <ImageUpload onFileProcess={handleFileProcess} />
          
          {error && (
            <div className="error-message">
              <strong>Note:</strong> {error}
            </div>
          )}
          
          {isLoading && <LoadingSpinner message="Processing floor plan..." />}
        </div>

        {predictionData && <PredictionResults prediction={predictionData} />}

        {(predictionData || selectedFile) && (
          <div className="viewer-section">
            <h3>3D Model Viewer (Enhanced Disaster Simulation)</h3>
            
            {/* Enhanced Disaster Status */}
            {isDisasterActive && (
              <div className="disaster-status-bar enhanced">
                <span className="disaster-icon">
                  {currentDisaster === 'earthquake' ? '🌋' : '🌊'}
                </span>
                <span className="disaster-name">
                  {currentDisaster === 'earthquake' ? 
                    `Earthquake Simulation - Magnitude: ${disasterParams.magnitude || 5.0}` : 
                    `Flood Simulation - Water Rising: ${currentWaterLevel.toFixed(2)}m / ${targetWaterLevel.toFixed(2)}m`}
                </span>
                <span className="disaster-timer">⏱️ {formattedTime}</span>
                <button onClick={handleDisasterSimulationStop} className="stop-disaster-btn">
                  ⏹️ Stop Simulation
                </button>
              </div>
            )}
            
            {/* Main Control Buttons */}
            <div className="main-controls">
              <button onClick={resetCamera}>Reset View</button>
              <button onClick={toggleWireframe}>Toggle Wireframe</button>
              <button onClick={exportGLB}>Export GLB</button>
              <button 
                onClick={() => {
                  if (showDisasterPanel) setShowDisasterPanel(false);
                  if (showCustomizePanel) setShowCustomizePanel(false);
                  setShowFurniturePanel(!showFurniturePanel);
                }}
                className={showFurniturePanel ? 'active' : ''}
                disabled={isDisasterActive}
              >
                Add Furniture
              </button>
              <button 
                onClick={() => {
                  if (showDisasterPanel) setShowDisasterPanel(false);
                  if (showFurniturePanel) setShowFurniturePanel(false);
                  setShowCustomizePanel(!showCustomizePanel);
                }}
                className={showCustomizePanel ? 'active' : ''}
                disabled={!selectedFurniture || isDisasterActive}
              >
                Customize
              </button>
              <button 
                onClick={() => {
                  if (showFurniturePanel) setShowFurniturePanel(false);
                  if (showCustomizePanel) setShowCustomizePanel(false);
                  setShowDisasterPanel(!showDisasterPanel);
                }}
                className={showDisasterPanel || isDisasterActive ? 'active' : ''}
                disabled={!predictionData}
              >
                {isDisasterActive ? '🌋 Simulation Active' : '🌍 Enhanced Disaster Sim'}
              </button>
              <div className="zoom-controls">
                <button onClick={zoomIn}>Zoom In</button>
                <button onClick={zoomOut}>Zoom Out</button>
              </div>
              <button onClick={handleReset} className="reset-btn">
                Reset All
              </button>
            </div>

            {/* PANEL AREA */}
            <div className="panel-area">
              {/* Furniture Panel */}
              {showFurniturePanel && (
                <div className="furniture-panel">
                  <h4>Custom Furniture Input:</h4>
                  <div className="furniture-input-form">
                    <label>
                      Furniture Type:
                      <select 
                        value={customFurnitureInput.type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          const defaults = getFurnitureDefaults(newType);
                          setCustomFurnitureInput({
                            type: newType,
                            ...defaults,
                            color: customFurnitureInput.color
                          });
                        }}
                        disabled={isDisasterActive}
                      >
                        <option value="bed">Bed</option>
                        <option value="sofa">Sofa</option>
                        <option value="chair">Chair</option>
                        <option value="table">Table</option>
                        <option value="dining">Dining Table</option>
                      </select>
                    </label>
                    
                    <label>
                      Width:
                      <input
                        type="number"
                        step="0.1"
                        value={customFurnitureInput.width}
                        onChange={(e) => setCustomFurnitureInput({
                          ...customFurnitureInput,
                          width: parseFloat(e.target.value)
                        })}
                        disabled={isDisasterActive}
                      />
                    </label>
                    
                    <label>
                      Depth:
                      <input
                        type="number"
                        step="0.1"
                        value={customFurnitureInput.depth}
                        onChange={(e) => setCustomFurnitureInput({
                          ...customFurnitureInput,
                          depth: parseFloat(e.target.value)
                        })}
                        disabled={isDisasterActive}
                      />
                    </label>
                    
                    <label>
                      Height:
                      <input
                        type="number"
                        step="0.1"
                        value={customFurnitureInput.height}
                        onChange={(e) => setCustomFurnitureInput({
                          ...customFurnitureInput,
                          height: parseFloat(e.target.value)
                        })}
                        disabled={isDisasterActive}
                      />
                    </label>
                    
                    <label>
                      Color:
                      <input
                        type="color"
                        value={customFurnitureInput.color}
                        onChange={(e) => setCustomFurnitureInput({
                          ...customFurnitureInput,
                          color: e.target.value
                        })}
                        disabled={isDisasterActive}
                      />
                    </label>
                    
                    <button 
                      onClick={startFurniturePlacement} 
                      className="add-furniture-btn"
                      disabled={isDisasterActive}
                    >
                      Start Furniture Placement
                    </button>
                  </div>
                </div>
              )}

              {/* Disaster Simulation Panel */}
              {showDisasterPanel && predictionData && (
                <div className="disaster-panel-container">
                  <DisasterControlPanel
                    onSimulationStart={handleDisasterSimulationStart}
                    onSimulationStop={handleDisasterSimulationStop}
                    isSimulationActive={isDisasterActive}
                    timeRemaining={timeRemaining}
                    formattedTime={formattedTime}
                    disasterParams={disasterParams}
                  />
                </div>
              )}
            </div>

            {/* Customize Panel */}
            {showCustomizePanel && selectedFurniture && (
              <div className="customize-panel">
                <h4>Customize {selectedFurniture.userData.furnitureType}</h4>
                
                <div className="customize-controls">
                  <div className="control-group">
                    <h5>Rotation:</h5>
                    <div className="rotation-controls">
                      <button onClick={() => rotateFurniture(-90)} disabled={isDisasterActive}>↺ 90° Left</button>
                      <button onClick={() => rotateFurniture(-45)} disabled={isDisasterActive}>↺ 45° Left</button>
                      <button onClick={() => rotateFurniture(45)} disabled={isDisasterActive}>45° Right ↻</button>
                      <button onClick={() => rotateFurniture(90)} disabled={isDisasterActive}>90° Right ↻</button>
                    </div>
                  </div>

                  <div className="control-group">
                    <h5>Color:</h5>
                    <div className="color-controls">
                      <button onClick={() => changeFurnitureColor(0xff6b6b)} style={{background: '#ff6b6b'}} disabled={isDisasterActive}>Pink</button>
                      <button onClick={() => changeFurnitureColor(0x4ecdc4)} style={{background: '#4ecdc4'}} disabled={isDisasterActive}>Teal</button>
                      <button onClick={() => changeFurnitureColor(0x45b7d1)} style={{background: '#45b7d1'}} disabled={isDisasterActive}>Blue</button>
                      <button onClick={() => changeFurnitureColor(0x8B4513)} style={{background: '#8B4513'}} disabled={isDisasterActive}>Brown</button>
                      <button onClick={() => changeFurnitureColor(0x228B22)} style={{background: '#228B22'}} disabled={isDisasterActive}>Green</button>
                      <button onClick={() => changeFurnitureColor(0xA52A2A)} style={{background: '#A52A2A'}} disabled={isDisasterActive}>Maroon</button>
                    </div>
                  </div>

                  <div className="control-group">
                    <h5>Position:</h5>
                    <div className="position-controls">
                      <button onClick={() => moveFurniture(selectedFurniture.position.x - 1, selectedFurniture.position.z)} disabled={isDisasterActive}>← Move Left</button>
                      <button onClick={() => moveFurniture(selectedFurniture.position.x + 1, selectedFurniture.position.z)} disabled={isDisasterActive}>Move Right →</button>
                      <button onClick={() => moveFurniture(selectedFurniture.position.x, selectedFurniture.position.z - 1)} disabled={isDisasterActive}>↑ Move Forward</button>
                      <button onClick={() => moveFurniture(selectedFurniture.position.x, selectedFurniture.position.z + 1)} disabled={isDisasterActive}>↓ Move Back</button>
                    </div>
                  </div>

                  <button onClick={deleteSelectedFurniture} className="delete-btn" disabled={isDisasterActive}>
                    🗑 Delete Furniture
                  </button>
                </div>
              </div>
            )}

            {/* Placement Status */}
            {placementStatus && (
              <div className={`placement-status ${placementStatus.includes('✅') ? 'success' : 'info'}`}>
                {placementStatus}
              </div>
            )}

            {/* Selection Instructions */}
{showCustomizePanel && !selectedFurniture && (
  <div className="selection-instruction">
    <p>💡 Click on any furniture to select and customize it</p>
  </div>
)}

{/* NEW: Start point selection instruction */}
{isSelectingStartPoint && (
  <div className="selection-overlay">
    <div className="selection-instruction">
      <span className="instruction-icon">👆</span>
      Click on the ground to select starting point for evacuation
    </div>
  </div>
)}

            {/* Selection Instructions */}
            {showCustomizePanel && !selectedFurniture && (
              <div className="selection-instruction">
                <p>💡 Click on any furniture to select and customize it</p>
              </div>
            )}

            {/* NEW: Start point selection instruction */}
            {isSelectingStartPoint && (
              <div className="selection-overlay">
                <div className="selection-instruction">
                  <span className="instruction-icon">👆</span>
                  Click on the ground to select starting point for evacuation
                </div>
              </div>
            )}

            {/* 3D Viewer Container */}
            <div 
              ref={viewerRef} 
              className={`viewer-3d-container ${furniturePlacementModeRef.current.active ? 'furniture-mode' : ''}`}
            />
            
            {/* Escape Path Visualizer - Now with ref */}
            {showEscapePath && sceneRef.current && (
              <EscapePathVisualizer
                ref={escapeVisualizerRef}
                scene={sceneRef.current}
                currentPosition={currentPlayerPosition}
                isActive={showEscapePath}
                onPathCalculated={handlePathCalculated}
                pathColor={currentDisaster === 'earthquake' ? 0xffaa00 : 0x00ff00}
                showArrows={true}
                showDebugWalls={false}
              />
            )}
                        
          </div>
        )}

        {/* Safety Guidelines Overlay */}
        <SafetyGuidelines
          disasterType={currentDisaster}
          isVisible={showSafetyGuidelines}
          onClose={handleCloseGuidelines}
          disasterParams={disasterParams}
        />

        {!selectedFile && !isLoading && (
          <div className="instructions">
            <h3>How to Use the Enhanced Disaster Simulation System:</h3>
            
            <div className="step-by-step-guide">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Upload Your Floor Plan</h4>
                  <p>Start by uploading a 2D floor plan image (PNG, JPG, or JPEG). Our AI will automatically detect walls, doors, and windows to create a 3D model.</p>
                </div>
              </div>

              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>View Your 3D Model</h4>
                  <p>Watch as your 2D floor plan transforms into an interactive 3D model. Use mouse controls to rotate, pan, and zoom around your virtual space.</p>
                  <div className="step-controls">
                    <div className="control-item">
                      <span className="control-text">Drag to rotate view</span>
                    </div>
                    <div className="control-item">
                      <span className="control-text">Scroll to zoom in/out</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>Add Custom Furniture</h4>
                  <p>Click "Add Furniture" to place beds, sofas, tables, chairs, and dining tables in your 3D space. Customize size, color, and position.</p>
                  <div className="furniture-types">
                    <span className="furniture-type">🛏️ Bed</span>
                    <span className="furniture-type">🛋️ Sofa</span>
                    <span className="furniture-type">🪑 Chair</span>
                    <span className="furniture-type">🗃️ Table</span>
                    <span className="furniture-type">🍽️ Dining Table</span>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-number">4</div>
                <div className="step-content">
                  <h4>Run Disaster Simulations</h4>
                  <p>Click "Enhanced Disaster Sim" to test how your space holds up against different disasters:</p>
                  <div className="disaster-types">
                    <div className="disaster-type earthquake">
                      <span className="disaster-icon">🌋</span>
                      <div className="disaster-info">
                        <strong>Earthquake</strong>
                        <p>Adjust magnitude (1-10), duration, and intensity. See realistic shaking effects on walls and furniture.</p>
                      </div>
                    </div>
                    <div className="disaster-type flood">
                      <span className="disaster-icon">🌊</span>
                      <div className="disaster-info">
                        <strong>Flood</strong>
                        <p>Control water level, flow direction, and speed. Water safely rises to 90% of wall height.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-number">5</div>
                <div className="step-content">
                  <h4>Customize & Export</h4>
                  <p>Click on any furniture to select and customize it. Change colors, rotate, move, or delete items. Export your complete 3D model as GLB file for use in other applications.</p>
                  <div className="export-features">
                    <div className="export-item">
                      <span>Custom colors</span>
                    </div>
                    <div className="export-item">
                      <span>360° rotation</span>
                    </div>
                    <div className="export-item">
                      <span>GLB export</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;