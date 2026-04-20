import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import './EscapePathVisualizer.css';

// Import the PathfindingService
import { PathfindingService } from '../services/PathfindingService';

const EscapePathVisualizer = forwardRef(({ 
  scene, 
  currentPosition, 
  onPathCalculated,
  isActive = false,
  pathColor = 0x00ff00,
  showArrows = true,
  showDebugWalls = false,
  getCamera
}, ref) => {
  const [path, setPath] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [showNoPathPopup, setShowNoPathPopup] = useState(false);
  
  // Selection mode states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStartPoint, setSelectedStartPoint] = useState(null);
  
  const pathGroupRef = useRef(null);
  const pathfindingServiceRef = useRef(null);
  const initializedRef = useRef(false);
  const lastFurnitureCountRef = useRef(0);
  const furnitureCheckIntervalRef = useRef(null);
  const popupTimeoutRef = useRef(null);
  
  // Selection refs
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const onStartPointSelectedCallbackRef = useRef(null);
  const startMarkerRef = useRef(null);
  const canvasClickListenerRef = useRef(null);

  // Function to clear path visualization
  const clearPathVisualization = useCallback(() => {
    if (pathGroupRef.current && scene) {
      scene.remove(pathGroupRef.current);
      pathGroupRef.current = null;
    }
    setPath(null);
    setError(null);
  }, [scene]);

  // Show popup message
  const showPopup = useCallback((message) => {
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    setShowNoPathPopup(message);
    popupTimeoutRef.current = setTimeout(() => {
      setShowNoPathPopup(false);
      popupTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Create visual marker for selected start point
  const createStartMarker = useCallback((position) => {
    if (!scene) return;
    if (startMarkerRef.current) {
      scene.remove(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    const markerGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.5, 0.05, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    markerGroup.add(ring);
    const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.3;
    markerGroup.add(sphere);
    const lineGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.y = 0.8;
    markerGroup.add(line);
    const topSphereGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const topSphereMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const topSphere = new THREE.Mesh(topSphereGeo, topSphereMat);
    topSphere.position.y = 1.3;
    markerGroup.add(topSphere);
    const pointLight = new THREE.PointLight(0xffaa00, 1, 5);
    pointLight.position.set(0, 0.8, 0);
    markerGroup.add(pointLight);
    markerGroup.position.copy(position);
    markerGroup.position.y = 0;
    scene.add(markerGroup);
    startMarkerRef.current = markerGroup;
  }, [scene]);

  // Enable start point selection mode
  const enableStartPointSelection = useCallback((callback) => {
    setSelectionMode(true);
    onStartPointSelectedCallbackRef.current = callback;
    clearPathVisualization();
    if (startMarkerRef.current && scene) {
      scene.remove(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    setSelectedStartPoint(null);
    console.log('👆 Start point selection enabled - click on ground');
  }, [scene, clearPathVisualization]);

  // Handle mouse click for start point selection
  const handleCanvasClick = useCallback((event) => {
    if (!selectionMode || !scene) return;
    const rect = event.target.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    let camera = null;
    if (getCamera) {
      camera = getCamera();
    } else {
      camera = window.__camera;
    }
    if (!camera) {
      console.warn('No camera available for raycasting');
      return;
    }
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const targetPoint = new THREE.Vector3();
    const ray = raycasterRef.current.ray;
    if (ray.intersectPlane(planeRef.current, targetPoint)) {
      if (pathfindingServiceRef.current) {
        const gridPos = pathfindingServiceRef.current.worldToGrid(targetPoint);
        if (gridPos) {
          const isWalkable = pathfindingServiceRef.current.isWalkable(gridPos.x, gridPos.z);
          const hasFurniture = pathfindingServiceRef.current.hasFurniture(gridPos.x, gridPos.z);
          const isAdjacentToFurniture = pathfindingServiceRef.current.isAdjacentToFurniture?.(gridPos.x, gridPos.z) || false;
          if (isWalkable && !hasFurniture && !isAdjacentToFurniture) {
            targetPoint.y = 0.1;
            setSelectedStartPoint(targetPoint.clone());
            setSelectionMode(false);
            createStartMarker(targetPoint);
            if (onStartPointSelectedCallbackRef.current) {
              onStartPointSelectedCallbackRef.current(targetPoint.clone(), gridPos);
            }
            console.log('✅ Start point selected:', targetPoint);
          } else {
            console.warn('❌ Cannot select point on obstacle or furniture');
            showPopup('❌ Cannot select point on obstacle or furniture');
          }
        } else {
          console.warn('❌ Point outside grid bounds');
          showPopup('❌ Point outside navigable area');
        }
      }
    }
  }, [selectionMode, scene, createStartMarker, showPopup, getCamera]);

  // Get selected start point
  const getSelectedStartPoint = useCallback(() => selectedStartPoint, [selectedStartPoint]);

  // Clear selected start point
  const clearStartPoint = useCallback(() => {
    setSelectedStartPoint(null);
    if (startMarkerRef.current && scene) {
      scene.remove(startMarkerRef.current);
      startMarkerRef.current = null;
    }
  }, [scene]);

  // Check if in selection mode
  const isSelectionMode = useCallback(() => selectionMode, [selectionMode]);

  // REFRESH PATHFINDING - Auto detect furniture changes
  const refreshPathfinding = useCallback(() => {
    if (!scene || !isActive) return;
    
    console.log('🔄 Auto-refreshing pathfinding service...');
    
    if (pathfindingServiceRef.current) {
      pathfindingServiceRef.current.initializeFromScene(scene);
      
      // Log furniture detection for debugging
      let furnitureCount = 0;
      const findFurniture = (obj) => {
        if (obj.userData && (obj.userData.isFurniture === true || obj.userData.furnitureType)) {
          furnitureCount++;
          console.log(`   Furniture detected: ${obj.userData.furnitureType || 'unknown'} at position (${obj.position.x.toFixed(2)}, ${obj.position.z.toFixed(2)})`);
        }
        if (obj.children) {
          obj.children.forEach(child => findFurniture(child));
        }
      };
      findFurniture(scene);
      console.log(`📦 Total furniture objects detected: ${furnitureCount}`);
      
      // Recalculate path if we have a start point
      if (selectedStartPoint) {
        calculateEscapePath(selectedStartPoint);
      }
    }
  }, [scene, isActive, selectedStartPoint]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    enableStartPointSelection,
    getSelectedStartPoint,
    clearStartPoint,
    isSelectionMode,
    refreshPathfinding
  }));

  // Add click event listener for selection mode
  useEffect(() => {
    if (!scene || !selectionMode) return;
    const clickHandler = (e) => handleCanvasClick(e);
    window.addEventListener('click', clickHandler);
    canvasClickListenerRef.current = clickHandler;
    console.log('Added click listener to window for selection mode');
    return () => {
      if (canvasClickListenerRef.current) {
        window.removeEventListener('click', canvasClickListenerRef.current);
        canvasClickListenerRef.current = null;
      }
    };
  }, [scene, selectionMode, handleCanvasClick]);

  // Force cleanup when component unmounts or isActive becomes false
  useEffect(() => {
    return () => {
      if (pathGroupRef.current && scene) {
        scene.remove(pathGroupRef.current);
        pathGroupRef.current = null;
      }
      if (startMarkerRef.current && scene) {
        scene.remove(startMarkerRef.current);
        startMarkerRef.current = null;
      }
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        popupTimeoutRef.current = null;
      }
      if (canvasClickListenerRef.current) {
        window.removeEventListener('click', canvasClickListenerRef.current);
        canvasClickListenerRef.current = null;
      }
    };
  }, [scene]);

  // Initialize pathfinding service
  useEffect(() => {
    if (!scene) return;
    if (initializedRef.current) return;
    try {
      pathfindingServiceRef.current = new PathfindingService(0.3);
      pathfindingServiceRef.current.initializeFromScene(scene);
      
      // Count initial furniture
      let furnitureCount = 0;
      const countFurniture = (obj) => {
        if (obj.userData && (obj.userData.isFurniture === true || obj.userData.furnitureType)) {
          furnitureCount++;
        }
        if (obj.children) {
          obj.children.forEach(child => countFurniture(child));
        }
      };
      countFurniture(scene);
      lastFurnitureCountRef.current = furnitureCount;
      
      initializedRef.current = true;
      console.log('✅ Pathfinding service initialized');
      console.log(`🚪 Found ${pathfindingServiceRef.current.exteriorDoors?.length || 0} exterior doors`);
      console.log(`📦 Initial furniture count: ${furnitureCount}`);
    } catch (err) {
      setError("Failed to initialize pathfinding: " + err.message);
    }
    return () => {
      clearPathVisualization();
    };
  }, [scene, clearPathVisualization]);

  // AUTO-DETECT FURNITURE CHANGES - Poll every 500ms
  const checkFurnitureChanges = useCallback(() => {
    if (!scene || !pathfindingServiceRef.current || !isActive) return false;
    
    let currentFurnitureCount = 0;
    const countFurniture = (obj) => {
      if (obj.userData && (obj.userData.isFurniture === true || obj.userData.furnitureType)) {
        currentFurnitureCount++;
      }
      if (obj.children) {
        obj.children.forEach(child => countFurniture(child));
      }
    };
    countFurniture(scene);
    
    if (lastFurnitureCountRef.current !== currentFurnitureCount) {
      console.log(`🪑 Furniture changed! Old count: ${lastFurnitureCountRef.current}, New count: ${currentFurnitureCount}`);
      lastFurnitureCountRef.current = currentFurnitureCount;
      return true;
    }
    return false;
  }, [scene, isActive]);

  // Set up interval to monitor furniture changes
  useEffect(() => {
    if (!isActive || !pathfindingServiceRef.current || !scene) return;
    
    if (furnitureCheckIntervalRef.current) {
      clearInterval(furnitureCheckIntervalRef.current);
    }
    
    furnitureCheckIntervalRef.current = setInterval(() => {
      if (checkFurnitureChanges()) {
        refreshPathfinding();
      }
    }, 500);
    
    return () => {
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }
    };
  }, [isActive, scene, checkFurnitureChanges, refreshPathfinding]);

  // When isActive becomes false, clear everything
  useEffect(() => {
    if (!isActive) {
      clearPathVisualization();
      clearStartPoint();
      setSelectionMode(false);
      if (scene) {
        scene.traverse((object) => {
          if (object.name === "EscapePath" || object.userData?.isPathVisualization) {
            scene.remove(object);
          }
        });
      }
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }
      setShowNoPathPopup(false);
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        popupTimeoutRef.current = null;
      }
      if (canvasClickListenerRef.current) {
        window.removeEventListener('click', canvasClickListenerRef.current);
        canvasClickListenerRef.current = null;
      }
    }
  }, [isActive, clearPathVisualization, clearStartPoint, scene]);

  // Calculate escape path when position changes or start point selected
  useEffect(() => {
    if (!isActive) return;
    if (!scene) return;
    if (!pathfindingServiceRef.current) return;
    const startPoint = selectedStartPoint || currentPosition;
    if (!startPoint) {
      console.log('⏳ No start point selected yet');
      return;
    }
    calculateEscapePath(startPoint);
  }, [isActive, currentPosition, scene, selectedStartPoint]);

  const calculateEscapePath = async (position) => {
    setIsCalculating(true);
    setError(null);
    try {
      const escapePath = pathfindingServiceRef.current.findEscapePath(position);
      if (escapePath && escapePath.length > 0) {
        setPath(escapePath);
        clearPathVisualization();
        visualizePath(escapePath);
        if (onPathCalculated) {
          onPathCalculated(escapePath);
        }
        console.log(`✅ Path found with ${escapePath.length} waypoints`);
      } else {
        showPopup("❌ No escape path found! All exits are blocked.");
        setError("No safe escape path found - check if exits are accessible");
        setPath(null);
      }
    } catch (err) {
      setError(err.message);
      showPopup("⚠️ Error calculating escape path");
    } finally {
      setIsCalculating(false);
    }
  };

  const visualizePath = (path) => {
    if (!scene) return;
    const group = new THREE.Group();
    group.name = "EscapePath";
    group.userData = { isPathVisualization: true };
    
    if (showDebugWalls && pathfindingServiceRef.current && pathfindingServiceRef.current.grid) {
      const grid = pathfindingServiceRef.current.grid;
      const bounds = pathfindingServiceRef.current.bounds;
      const gridSize = pathfindingServiceRef.current.gridSize;
      for (let x = 0; x < grid.length; x++) {
        for (let z = 0; z < grid[0].length; z++) {
          if (grid[x][z].type === 'wall') {
            const worldX = bounds.minX + x * gridSize + gridSize/2;
            const worldZ = bounds.minZ + z * gridSize + gridSize/2;
            const wallBox = new THREE.BoxGeometry(0.2, 0.1, 0.2);
            const wallMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
            const wallMarker = new THREE.Mesh(wallBox, wallMat);
            wallMarker.position.set(worldX, 0.05, worldZ);
            group.add(wallMarker);
          }
        }
      }
    }
    
    const points = path.map(p => new THREE.Vector3(p.x, p.y + 1.0, p.z));
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ color: pathColor, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    points.forEach((point, index) => {
      const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color: index === 0 ? 0xffaa00 : (index === points.length - 1 ? getExitColor(path.exitType) : pathColor),
        emissive: index === 0 ? 0x442200 : (index === points.length - 1 ? 0x440000 : 0x224422),
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.copy(point);
      sphere.position.y += 0.4;
      group.add(sphere);
    });

    if (showArrows) {
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const segmentLength = start.distanceTo(end);
        const numArrows = Math.max(1, Math.floor(segmentLength / 1.5));
        for (let j = 0; j < numArrows; j++) {
          const t = (j + 0.5) / numArrows;
          const midPoint = new THREE.Vector3().lerpVectors(start, end, t);
          midPoint.y += 0.6;
          const arrowHelper = new THREE.ArrowHelper(direction, midPoint, 0.8, pathColor, 0.3, 0.2);
          group.add(arrowHelper);
        }
      }
    }

    const startPos = points[0].clone();
    startPos.y += 1.0;
    const personGroup = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3366ff, emissive: 0x112244 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    personGroup.add(body);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffaa66, emissive: 0x442200 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    personGroup.add(head);
    if (points.length > 1) {
      const dirToFirst = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
      const dirArrow = new THREE.ArrowHelper(dirToFirst, new THREE.Vector3(0, 2.2, 0), 0.8, 0xffaa00);
      personGroup.add(dirArrow);
    }
    personGroup.position.copy(startPos);
    group.add(personGroup);

    const endPos = points[points.length - 1].clone();
    endPos.y += 1.2;
    const exitGroup = new THREE.Group();
    let exitColor = 0xff0000;
    let exitEmissive = 0x440000;
    if (path.exitType === 'exterior_door') {
      exitColor = 0x00ff00;
      exitEmissive = 0x004400;
    } else if (path.exitType === 'exterior_window') {
      exitColor = 0x00ffff;
      exitEmissive = 0x004444;
    } else if (path.exitType && path.exitType.includes('edge')) {
      exitColor = 0xffaa00;
      exitEmissive = 0x442200;
    } else if (path.exitType === 'fallback_exit') {
      exitColor = 0xff6600;
      exitEmissive = 0x442200;
    }
    const exitSignGeo = new THREE.BoxGeometry(1.5, 0.8, 0.3);
    const exitSignMat = new THREE.MeshStandardMaterial({ color: exitColor, emissive: exitEmissive, emissiveIntensity: 1.0 });
    const exitSign = new THREE.Mesh(exitSignGeo, exitSignMat);
    exitGroup.add(exitSign);
    const exitLight = new THREE.PointLight(exitColor, 1, 5);
    exitLight.position.set(0, 1, 0);
    exitGroup.add(exitLight);
    exitGroup.position.copy(endPos);
    group.add(exitGroup);

    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.needsUpdate = true);
          } else {
            child.material.needsUpdate = true;
          }
        }
      }
    });

    scene.add(group);
    pathGroupRef.current = group;
  };

  const getExitColor = (exitType) => {
    switch(exitType) {
      case 'exterior_door': return 0x00ff00;
      case 'exterior_window': return 0x00ffff;
      case 'north_edge':
      case 'south_edge':
      case 'east_edge':
      case 'west_edge':
        return 0xffaa00;
      case 'fallback_exit': return 0xff6600;
      default: return 0xff0000;
    }
  };

  if (!isActive) return null;

  return (
    <div className="escape-path-visualizer">
      <div className="escape-path-controls">
        {selectionMode && (
          <div className="path-status selection-mode">
            <span className="instruction-icon">👆</span>
            Click on ground to select starting point
          </div>
        )}
        {isCalculating && (
          <div className="path-status calculating">
            <span className="spinner-small"></span>
            Calculating escape route...
          </div>
        )}
        {error && (
          <div className="path-status error">
            <span>⚠️ {error}</span>
            {selectedStartPoint && (
              <button onClick={() => calculateEscapePath(selectedStartPoint)} className="retry-btn" title="Retry pathfinding">↻</button>
            )}
          </div>
        )}
        {path && !isCalculating && !error && !selectionMode && (
          <div className="path-status success">
            <span>✅ Safe escape route found</span>
            <button onClick={clearPathVisualization} className="clear-btn" title="Clear path">✕</button>
          </div>
        )}
      </div>
      {showNoPathPopup && (
        <div className="path-not-found-popup">{showNoPathPopup}</div>
      )}
    </div>
  );
});

export default EscapePathVisualizer;