// src/components/EscapePathVisualizer.jsx
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import './EscapePathVisualizer.css';

// Import the PathfindingService
import { PathfindingService } from '../services/PathfindingService';
import { AIPathfindingService } from '../services/AIPathfindingService';

const EscapePathVisualizer = forwardRef(({ 
  scene, 
  currentPosition, 
  onPathCalculated,
  isActive = false,
  pathColor = 0x00ff00,
  showArrows = true,
  useAI = true, // Use AI pathfinding by default
  showDebugWalls = false, // Set to true to see wall grid cells
  getCamera // Optional: function to get camera from parent
}, ref) => {
  const [path, setPath] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [showNoPathPopup, setShowNoPathPopup] = useState(false);
  const [furnitureVersion, setFurnitureVersion] = useState(0);
  
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
    // Clear any existing timeout
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }

    setShowNoPathPopup(message);
    
    // Auto-hide after 3 seconds
    popupTimeoutRef.current = setTimeout(() => {
      setShowNoPathPopup(false);
      popupTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Create visual marker for selected start point
  const createStartMarker = useCallback((position) => {
    if (!scene) return;
    
    // Remove existing marker
    if (startMarkerRef.current) {
      scene.remove(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    
    const markerGroup = new THREE.Group();
    
    // Base ring
    const ringGeo = new THREE.TorusGeometry(0.5, 0.05, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    markerGroup.add(ring);
    
    // Center sphere
    const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.3;
    markerGroup.add(sphere);
    
    // Vertical line
    const lineGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.y = 0.8;
    markerGroup.add(line);
    
    // Top sphere
    const topSphereGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const topSphereMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const topSphere = new THREE.Mesh(topSphereGeo, topSphereMat);
    topSphere.position.y = 1.3;
    markerGroup.add(topSphere);
    
    // Add pulsing light
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
    
    // Clear any existing path and marker
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
    
    // Calculate mouse position
    const rect = event.target.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Get camera - try prop first, then global fallback
    let camera = null;
    if (getCamera) {
      camera = getCamera();
    } else {
      // Fallback to global camera (set by App.jsx)
      camera = window.__camera;
    }
    
    if (!camera) {
      console.warn('No camera available for raycasting');
      return;
    }
    
    // Cast ray
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Find intersection with ground plane
    const targetPoint = new THREE.Vector3();
    const ray = raycasterRef.current.ray;
    
    if (ray.intersectPlane(planeRef.current, targetPoint)) {
      // Check if point is valid using pathfinding service
      if (pathfindingServiceRef.current) {
        const gridPos = pathfindingServiceRef.current.worldToGrid(targetPoint);
        
        if (gridPos) {
          const isWalkable = pathfindingServiceRef.current.isWalkable(gridPos.x, gridPos.z);
          const hasFurniture = pathfindingServiceRef.current.hasFurniture(gridPos.x, gridPos.z);
          const isAdjacentToFurniture = pathfindingServiceRef.current.isAdjacentToFurniture?.(gridPos.x, gridPos.z) || false;
          
          if (isWalkable && !hasFurniture && !isAdjacentToFurniture) {
            // Valid point selected
            targetPoint.y = 0.1; // Slightly above ground
            setSelectedStartPoint(targetPoint.clone());
            setSelectionMode(false);
            
            // Create visual marker
            createStartMarker(targetPoint);
            
            // Call callback
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
  const getSelectedStartPoint = useCallback(() => {
    return selectedStartPoint;
  }, [selectedStartPoint]);

  // Clear selected start point
  const clearStartPoint = useCallback(() => {
    setSelectedStartPoint(null);
    if (startMarkerRef.current && scene) {
      scene.remove(startMarkerRef.current);
      startMarkerRef.current = null;
    }
  }, [scene]);

  // Check if in selection mode
  const isSelectionMode = useCallback(() => {
    return selectionMode;
  }, [selectionMode]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    enableStartPointSelection,
    getSelectedStartPoint,
    clearStartPoint,
    isSelectionMode
  }));

  // Add click event listener for selection mode - ALWAYS use window listener for reliability
  useEffect(() => {
    if (!scene || !selectionMode) return;
    
    // Use window click listener (most reliable across different setups)
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
      
      // Clear interval
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }

      // Clear popup timeout
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        popupTimeoutRef.current = null;
      }

      // Remove click listener
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
      // Choose between regular and AI pathfinding
      if (useAI) {
        pathfindingServiceRef.current = new AIPathfindingService(0.3); // 30cm grid cells
      } else {
        pathfindingServiceRef.current = new PathfindingService(0.3); // 30cm grid cells
      }
      
      // Initialize grid from scene
      const grid = pathfindingServiceRef.current.initializeFromScene(scene);
      
      // If using AI, update furniture hazard zones
      if (useAI && pathfindingServiceRef.current.updateFurnitureHazardZones) {
        pathfindingServiceRef.current.updateFurnitureHazardZones(scene);
      }
      
      // Count initial furniture
      let furnitureCount = 0;
      scene.traverse((object) => {
        if (object.userData.isFurniture || object.userData.furnitureType) {
          furnitureCount++;
        }
      });
      lastFurnitureCountRef.current = furnitureCount;
      
      initializedRef.current = true;
      
      console.log('✅ Pathfinding service initialized');
      console.log(`🚪 Found ${pathfindingServiceRef.current.exteriorDoors?.length || 0} exterior doors`);
      console.log(`🪟 Found ${pathfindingServiceRef.current.exteriorWindows?.length || 0} exterior windows`);
    } catch (err) {
      setError("Failed to initialize pathfinding: " + err.message);
    }

    return () => {
      clearPathVisualization();
    };
  }, [scene, clearPathVisualization, useAI]);

  // Function to check for furniture changes
  const checkFurnitureChanges = useCallback(() => {
    if (!scene || !pathfindingServiceRef.current || !isActive) return false;
    
    let furnitureCount = 0;
    scene.traverse((object) => {
      if (object.userData.isFurniture || object.userData.furnitureType) {
        furnitureCount++;
      }
    });
    
    if (lastFurnitureCountRef.current !== furnitureCount) {
      lastFurnitureCountRef.current = furnitureCount;
      return true;
    }
    
    return false;
  }, [scene, isActive]);

  // Set up interval to monitor furniture changes
  useEffect(() => {
    if (!isActive || !pathfindingServiceRef.current || !scene) return;
    
    // Clear existing interval
    if (furnitureCheckIntervalRef.current) {
      clearInterval(furnitureCheckIntervalRef.current);
    }
    
    // Set up new interval to check for furniture changes
    furnitureCheckIntervalRef.current = setInterval(() => {
      if (checkFurnitureChanges()) {
        // Reinitialize grid with new furniture
        pathfindingServiceRef.current.initializeFromScene(scene);
        
        // If using AI, update furniture hazard zones
        if (useAI && pathfindingServiceRef.current.updateFurnitureHazardZones) {
          pathfindingServiceRef.current.updateFurnitureHazardZones(scene);
        }
        
        // Force a recalculation by updating furnitureVersion
        setFurnitureVersion(prev => prev + 1);
      }
    }, 500); // Check every 500ms for faster response
    
    return () => {
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }
    };
  }, [isActive, scene, checkFurnitureChanges, useAI]);

  // When isActive becomes false, clear everything
  useEffect(() => {
    if (!isActive) {
      clearPathVisualization();
      clearStartPoint();
      setSelectionMode(false);
      
      // Also try to find and remove any path groups directly from scene
      if (scene) {
        scene.traverse((object) => {
          if (object.name === "EscapePath" || object.userData?.isPathVisualization) {
            scene.remove(object);
          }
        });
      }
      
      // Clear interval
      if (furnitureCheckIntervalRef.current) {
        clearInterval(furnitureCheckIntervalRef.current);
        furnitureCheckIntervalRef.current = null;
      }

      // Clear popup
      setShowNoPathPopup(false);
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
        popupTimeoutRef.current = null;
      }

      // Remove click listener
      if (canvasClickListenerRef.current) {
        window.removeEventListener('click', canvasClickListenerRef.current);
        canvasClickListenerRef.current = null;
      }
    }
  }, [isActive, clearPathVisualization, clearStartPoint, scene]);

  // Calculate escape path when position changes OR when start point is selected
  useEffect(() => {
    if (!isActive) return;
    if (!scene) return;
    if (!pathfindingServiceRef.current) return;

    // Use selected start point OR currentPosition
    const startPoint = selectedStartPoint || currentPosition;
    
    if (!startPoint) {
      console.log('⏳ No start point selected yet');
      return;
    }

    calculateEscapePath(startPoint);
  }, [isActive, currentPosition, scene, furnitureVersion, selectedStartPoint]);

  const calculateEscapePath = async (position) => {
    setIsCalculating(true);
    setError(null);

    try {
      // Find escape path
      let escapePath;
      
      if (useAI && pathfindingServiceRef.current.findAIPath) {
        // Use AI pathfinding with furniture awareness
        escapePath = pathfindingServiceRef.current.findEscapePath(position, scene);
      } else {
        // Use regular pathfinding
        escapePath = pathfindingServiceRef.current.findEscapePath(position);
      }

      if (escapePath && escapePath.length > 0) {
        // CRITICAL: Double-check path doesn't go through walls
        const goesThroughWall = checkPathForWalls(escapePath);
        if (goesThroughWall) {
          setError("Path would go through wall - this shouldn't happen");
          setPath(null);
          showPopup("❌ Path blocked by walls!");
          return;
        }
        
        // Check if path goes through furniture (shouldn't, but verify)
        const goesThroughFurniture = checkPathForFurniture(escapePath, scene);
        if (goesThroughFurniture) {
          // Increase hazard penalties and recalculate
          if (useAI && pathfindingServiceRef.current.updateFurnitureHazardZones) {
            pathfindingServiceRef.current.updateFurnitureHazardZones(scene);
          }
          
          // Try again with same position
          escapePath = pathfindingServiceRef.current.findEscapePath(position);
          
          if (!escapePath || escapePath.length === 0) {
            showPopup("❌ No safe path around furniture!");
            setError("No safe path around furniture");
            setPath(null);
            return;
          }
        }
        
        setPath(escapePath);
        
        // Clear any existing path first
        clearPathVisualization();
        
        // Visualize the path
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

  // Helper function to check if path goes through walls
  const checkPathForWalls = (path) => {
    if (!path || path.length === 0 || !pathfindingServiceRef.current) return false;
    
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const gridPos = pathfindingServiceRef.current.worldToGrid(point);
      if (gridPos) {
        const grid = pathfindingServiceRef.current.grid;
        if (grid[gridPos.x][gridPos.z].type === 'wall') {
          return true;
        }
      }
    }
    return false;
  };

  // Helper function to check if path goes through furniture
  const checkPathForFurniture = (path, scene) => {
    if (!path || path.length === 0 || !scene) return false;
    
    // Simple check - see if any path point is inside furniture
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      
      let insideFurniture = false;
      scene.traverse((object) => {
        if (object.userData.isFurniture || object.userData.furnitureType) {
          // Approximate check using distance
          const distance = Math.sqrt(
            Math.pow(point.x - object.position.x, 2) + 
            Math.pow(point.z - object.position.z, 2)
          );
          
          // If very close to furniture center, might be inside
          if (distance < 1.0) {
            insideFurniture = true;
          }
        }
      });
      
      if (insideFurniture) {
        return true;
      }
    }
    
    return false;
  };

  const visualizePath = (path) => {
    if (!scene) return;

    const group = new THREE.Group();
    group.name = "EscapePath";
    group.userData = { isPathVisualization: true };
    
    // DEBUG: Show wall grid cells if requested
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
            const wallMat = new THREE.MeshBasicMaterial({ 
              color: 0xff0000, 
              transparent: true, 
              opacity: 0.3 
            });
            const wallMarker = new THREE.Mesh(wallBox, wallMat);
            wallMarker.position.set(worldX, 0.05, worldZ);
            group.add(wallMarker);
          }
        }
      }
    }
    
    // Create path line - higher to be more visible
    const points = path.map(p => new THREE.Vector3(p.x, p.y + 1.0, p.z));
    
    // Line geometry - make it thicker and more visible
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ color: pathColor, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    // Add spheres at waypoints
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

    // Add directional arrows along the path
    if (showArrows) {
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        
        // Place arrows at multiple points along long segments
        const segmentLength = start.distanceTo(end);
        const numArrows = Math.max(1, Math.floor(segmentLength / 1.5));
        
        for (let j = 0; j < numArrows; j++) {
          const t = (j + 0.5) / numArrows;
          const midPoint = new THREE.Vector3().lerpVectors(start, end, t);
          midPoint.y += 0.6; // Raise arrows higher
          
          const arrowHelper = new THREE.ArrowHelper(
            direction,
            midPoint,
            0.8, // Longer arrows
            pathColor,
            0.3, // Larger head length
            0.2  // Larger head width
          );
          group.add(arrowHelper);
        }
      }
    }

    // Add start marker (person icon) - more visible
    const startPos = points[0].clone();
    startPos.y += 1.0;
    
    const personGroup = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3366ff, emissive: 0x112244 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    personGroup.add(body);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffaa66, emissive: 0x442200 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    personGroup.add(head);
    
    // Add direction indicator (arrow above head)
    if (points.length > 1) {
      const dirToFirst = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
      const dirArrow = new THREE.ArrowHelper(dirToFirst, new THREE.Vector3(0, 2.2, 0), 0.8, 0xffaa00);
      personGroup.add(dirArrow);
    }
    
    personGroup.position.copy(startPos);
    group.add(personGroup);

    // Add exit marker with color based on exit type
    const endPos = points[points.length - 1].clone();
    endPos.y += 1.2;
    
    const exitGroup = new THREE.Group();
    
    // Determine exit color based on type
    let exitColor = 0xff0000; // Default red
    let exitEmissive = 0x440000;
    
    if (path.exitType === 'exterior_door') {
      exitColor = 0x00ff00; // Green for exterior doors
      exitEmissive = 0x004400;
    } else if (path.exitType === 'exterior_window') {
      exitColor = 0x00ffff; // Cyan for windows
      exitEmissive = 0x004444;
    } else if (path.exitType && path.exitType.includes('edge')) {
      exitColor = 0xffaa00; // Orange for edge exits
      exitEmissive = 0x442200;
    } else if (path.exitType === 'fallback_exit') {
      exitColor = 0xff6600; // Orange-red for fallback
      exitEmissive = 0x442200;
    }
    
    // Exit sign - bigger and more visible
    const exitSignGeo = new THREE.BoxGeometry(1.5, 0.8, 0.3);
    const exitSignMat = new THREE.MeshStandardMaterial({ 
      color: exitColor, 
      emissive: exitEmissive,
      emissiveIntensity: 1.0
    });
    const exitSign = new THREE.Mesh(exitSignGeo, exitSignMat);
    exitGroup.add(exitSign);
    
    // Add glowing effect with point light at exit
    const exitLight = new THREE.PointLight(exitColor, 1, 5);
    exitLight.position.set(0, 1, 0);
    exitGroup.add(exitLight);
    
    exitGroup.position.copy(endPos);
    group.add(exitGroup);

    // Make sure all parts cast shadows and are visible
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Ensure materials are visible
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

  // Helper function to get color based on exit type
  const getExitColor = (exitType) => {
    switch(exitType) {
      case 'exterior_door': return 0x00ff00; // Green
      case 'exterior_window': return 0x00ffff; // Cyan
      case 'north_edge':
      case 'south_edge':
      case 'east_edge':
      case 'west_edge':
        return 0xffaa00; // Orange
      case 'fallback_exit': return 0xff6600; // Orange-red
      default: return 0xff0000; // Red
    }
  };

  // Don't render anything if not active
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
              <button 
                onClick={() => calculateEscapePath(selectedStartPoint)} 
                className="retry-btn" 
                title="Retry pathfinding"
              >
                ↻
              </button>
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

      {/* Popup message */}
      {showNoPathPopup && (
        <div className="path-not-found-popup">
          {showNoPathPopup}
        </div>
      )}
    </div>
  );
});

export default EscapePathVisualizer;