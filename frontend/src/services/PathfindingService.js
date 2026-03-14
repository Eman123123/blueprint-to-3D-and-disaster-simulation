import * as THREE from 'three';

// Min-Heap Priority Queue for A*/Dijkstra
class MinHeap {
  constructor() { this.heap = []; }
  push(node) { this.heap.push(node); this._up(this.heap.length - 1); }
  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.heap.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].f <= this.heap[i].f) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this.heap.length;
    while (true) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.heap[l].f < this.heap[s].f) s = l;
      if (r < n && this.heap[r].f < this.heap[s].f) s = r;
      if (s === i) break;
      [this.heap[s], this.heap[i]] = [this.heap[i], this.heap[s]];
      i = s;
    }
  }
}

export class PathfindingService {
  constructor(gridSize = 0.5) {
    this.gridSize = gridSize;
    this.grid = null;
    this.walls = [];
    this.windows = [];
    this.doors = [];
    this.furniture = [];
    this.floorObjects = [];
    this.bounds = null;
    this.gridWidth = 0;
    this.gridDepth = 0;
    this.allowDiagonal = true;
    this.exteriorDoors = [];
    this.interiorDoors = [];
    this.exteriorWindows = [];
    this.interiorWindows = [];
    this.furniturePositions = new Map(); // true = furniture, 'adjacent' = adjacent cell
    this.targetCells = new Set(); // Stores 'x,z' keys of valid exits
  }

  initializeFromScene(scene, bounds) {
    this.collectFloorObjects(scene);
    this.collectAllObjects(scene);
    this.bounds = bounds || this.calculateBounds(scene);

    this.gridWidth = Math.ceil((this.bounds.maxX - this.bounds.minX) / this.gridSize);
    this.gridDepth = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / this.gridSize);

    this.initializeEmptyGrid();
    
    // CRITICAL: Mark in correct order (later marks override previous)
    this.markFloorAsWalkable();      // First: floor is walkable
    this.markWallsAsBarriers();      // Walls override floor (non-walkable)
    this.markWindowsAsBarriers();    // Windows override floor (non-walkable)
    this.markFurnitureAsSolid();     // Furniture overrides everything (non-walkable)
    
    this.buildFurnitureMap();        // Build quick lookup for furniture positions
    this.classifyExteriorOpenings(); // Classify doors/windows as exterior/interior
    this.markExteriorOpeningsAsTargets(); // Mark exits as walkable targets
    
    return this.grid;
  }

  collectAllObjects(scene) {
    this.walls = [];
    this.windows = [];
    this.doors = [];
    this.furniture = [];
    
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      
      const ud = obj.userData || {};
      const name = (obj.name || '').toLowerCase();
      
      if (ud.isWall || ud.type === 'wall' || name.includes('wall')) {
        this.walls.push(obj);
      }
      else if (ud.isWindow || ud.type === 'window' || name.includes('window')) {
        this.windows.push(obj);
      }
      else if (ud.isDoor || ud.type === 'door' || name.includes('door')) {
        this.doors.push(obj);
      }
      else if (ud.isFurniture || ud.type === 'furniture' || ud.furnitureType || 
               name.includes('furniture') || name.includes('bed') || name.includes('sofa') || 
               name.includes('chair') || name.includes('table') || name.includes('desk') ||
               name.includes('cabinet') || name.includes('shelf')) {
        this.furniture.push(obj);
      }
    });
  }

  buildFurnitureMap() {
    this.furniturePositions.clear();
    
    this.furniture.forEach(item => {
      const r = this.objectToGridRange(item, 0.25); // 0.25m padding
      if (!r) return;
      
      // Mark furniture cells
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          const key = `${x},${z}`;
          this.furniturePositions.set(key, true);
        }
      }
      
      // Mark adjacent cells (after marking all furniture cells)
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          const adjacentCells = [
            [x + 1, z], [x - 1, z],
            [x, z + 1], [x, z - 1]
          ];
          
          adjacentCells.forEach(([ax, az]) => {
            if (ax >= 0 && ax < this.gridWidth && az >= 0 && az < this.gridDepth) {
              const adjKey = `${ax},${az}`;
              // Only mark as adjacent if it's not already a furniture cell
              if (!this.furniturePositions.has(adjKey)) {
                this.furniturePositions.set(adjKey, 'adjacent');
              }
            }
          });
        }
      }
    });
  }

  classifyExteriorOpenings() {
    this.exteriorDoors = [];
    this.interiorDoors = [];
    this.exteriorWindows = [];
    this.interiorWindows = [];

    const allObstacles = [...this.walls, ...this.windows, ...this.doors, ...this.furniture];
    const rayLength = 50;
    const threshold = 0.5;

    // Classify doors
    this.doors.forEach(door => {
      const doorPos = door.position.clone();
      doorPos.y = 1.5; // Raise ray to avoid floor hits
      
      const doorNormal = this._getObjectNormal(door) || new THREE.Vector3(1, 0, 0);
      
      const rayForward = new THREE.Raycaster(doorPos, doorNormal);
      rayForward.far = rayLength;
      const forwardHits = rayForward.intersectObjects(allObstacles);
      
      const rayBackward = new THREE.Raycaster(doorPos, doorNormal.clone().negate());
      rayBackward.far = rayLength;
      const backwardHits = rayBackward.intersectObjects(allObstacles);
      
      const hasForwardHit = forwardHits.some(hit => hit.distance > threshold);
      const hasBackwardHit = backwardHits.some(hit => hit.distance > threshold);
      
      // Exterior if only one side has obstacles (or none)
      const isExterior = !hasForwardHit || !hasBackwardHit;
      
      if (isExterior) {
        this.exteriorDoors.push(door);
        door.userData.isExterior = true;
      } else {
        this.interiorDoors.push(door);
        door.userData.isExterior = false;
      }
    });

    // Classify windows (similar logic)
    this.windows.forEach(window => {
      const windowPos = window.position.clone();
      windowPos.y = 1.5;
      
      const windowNormal = this._getObjectNormal(window) || new THREE.Vector3(1, 0, 0);
      
      const rayForward = new THREE.Raycaster(windowPos, windowNormal);
      rayForward.far = rayLength;
      const forwardHits = rayForward.intersectObjects(allObstacles);
      
      const rayBackward = new THREE.Raycaster(windowPos, windowNormal.clone().negate());
      rayBackward.far = rayLength;
      const backwardHits = rayBackward.intersectObjects(allObstacles);
      
      const hasForwardHit = forwardHits.some(hit => hit.distance > threshold);
      const hasBackwardHit = backwardHits.some(hit => hit.distance > threshold);
      
      const isExterior = !hasForwardHit || !hasBackwardHit;
      
      if (isExterior) {
        this.exteriorWindows.push(window);
        window.userData.isExterior = true;
      } else {
        this.interiorWindows.push(window);
        window.userData.isExterior = false;
      }
    });
  }
  // =====================================================
  // TARGET REGISTRATION - Mark exits as walkable
  // =====================================================
  markExteriorOpeningsAsTargets() {
    this.targetCells.clear();
    
    const processOpening = (opening, type) => {
      // Use small padding to ensure we catch the grid cell containing the opening
      const r = this.objectToGridRange(opening, 0.1);
      if (!r) return;

      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (x >= 0 && x < this.gridWidth && z >= 0 && z < this.gridDepth) {
            // Override previous marks (like walls/windows) to make it walkable
            this.grid[x][z].walkable = true;
            this.grid[x][z].type = 'exit';
            this.grid[x][z].exitType = type; // Store whether it's door or window
            this.grid[x][z].cost = 1;
            
            // Add to fast-lookup set
            this.targetCells.add(`${x},${z}`);
          }
        }
      }
    };

    // Mark exterior doors
    this.exteriorDoors.forEach(door => processOpening(door, 'door'));
    
    // Mark exterior windows
    this.exteriorWindows.forEach(window => processOpening(window, 'window'));

    console.log(`🎯 Marked ${this.targetCells.size} grid cells as exterior exits.`);
    console.log(`   - Doors: ${this.exteriorDoors.length}, Windows: ${this.exteriorWindows.length}`);
  }

  _getObjectNormal(obj) {
    try {
      // Try to determine normal from object orientation
      if (obj.geometry) {
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        
        // Determine which dimension is smallest (the thickness)
        if (size.x < size.z && size.x < size.y) {
          return new THREE.Vector3(1, 0, 0); // Facing X direction
        } else if (size.z < size.x && size.z < size.y) {
          return new THREE.Vector3(0, 0, 1); // Facing Z direction
        }
      }
      
      // Fallback to object's rotation
      const dir = new THREE.Vector3(0, 0, 1);
      dir.applyQuaternion(obj.quaternion);
      dir.y = 0;
      return dir.normalize();
    } catch (e) {
      return new THREE.Vector3(1, 0, 0);
    }
  }

  hasFurniture(x, z) {
    const key = `${x},${z}`;
    return this.furniturePositions.get(key) === true;
  }

  isAdjacentToFurniture(x, z) {
    const key = `${x},${z}`;
    return this.furniturePositions.get(key) === 'adjacent';
  }

  // =====================================================
  // MAIN ENTRY POINT - Find shortest path to any exterior opening
  // =====================================================
  findEscapePath(currentPosition) {
    if (!this.grid) {
      console.warn('Grid not initialized');
      return null;
    }
    
    // Print number of exterior doors and windows
    console.log(`🔍 Pathfinding: Found ${this.exteriorDoors.length} exterior doors and ${this.exteriorWindows.length} exterior windows`);
    
    // Check if we have any escape routes
    if (this.exteriorDoors.length === 0 && this.exteriorWindows.length === 0) {
      console.warn('No exterior doors or windows found');
      return null;
    }

    // Convert start position to grid coordinates
    let start = this.worldToGrid(currentPosition);
    if (!start) {
      console.warn('Start position outside grid bounds');
      return null;
    }
    
    // Adjust start position if it's in an obstacle
    if (!this.isWalkable(start.x, start.z)) {
      const nearestWalkable = this.findNearestWalkable(start.x, start.z);
      if (!nearestWalkable) {
        console.warn('No walkable start position found');
        return null;
      }
      start = nearestWalkable;
    }

    // Find path using Dijkstra's algorithm
    const path = this.findShortestPathToExterior(start);
    
    if (path && path.length > 0) {
      console.log(`✅ Path found to nearest exterior opening (path length: ${path.length} points)`);
      return this.smoothPath(path);
    }

    console.warn('No path found to any exterior door or window');
    return null;
  }

  // =====================================================
  // Dijkstra's Algorithm for shortest path to ANY exterior opening
  // =====================================================
  findShortestPathToExterior(start) {
    const dist = new Map(); // Distance from start
    const prev = new Map(); // Previous node in path
    const heap = new MinHeap();
    const visited = new Set();

    // Initialize start node
    const startKey = `${start.x},${start.z}`;
    dist.set(startKey, 0);
    heap.push({ x: start.x, z: start.z, f: 0 });

    // Track ALL exterior openings found with their distances
    const foundExits = []; // Use array to store multiple exits

    while (heap.size > 0) {
      const current = heap.pop();
      const currentKey = `${current.x},${current.z}`;
      
      // Skip if already visited
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      
      const currentDist = dist.get(currentKey) || 0;

      // Check if current cell is an exterior door or window using targetCells
      if (this.targetCells.has(currentKey)) {
        
        foundExits.push({
          key: currentKey,
          dist: currentDist,
          x: current.x,
          z: current.z
        });
        
        // DON'T continue - let the algorithm explore all paths to find ALL exits
      }

      // Explore ALL neighbors - NO PRUNING
      for (const neighbor of this.getValidNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.z}`;
        
        // Skip if already visited
        if (visited.has(neighborKey)) continue;
        
        const newDist = currentDist + 1; // Uniform cost for all moves
        
        // Always update if we found a shorter path
        if (!dist.has(neighborKey) || newDist < dist.get(neighborKey)) {
          dist.set(neighborKey, newDist);
          prev.set(neighborKey, currentKey);
          heap.push({ x: neighbor.x, z: neighbor.z, f: newDist });
        }
      }
    }

    // After exploring everything, find the shortest exit
    if (foundExits.length > 0) 
      {
      // Sort exits by distance (shortest first)
      foundExits.sort((a, b) => a.dist - b.dist);
      
      console.log(`✅ Found ${foundExits.length} reachable exterior openings:`);
            
      // Reconstruct path to the SHORTEST exit
      const bestExit = foundExits[0];
      console.log(`📏 Shortest path length: ${bestExit.dist} steps`);
      
      const path = this.reconstructPath(prev, startKey, bestExit.key);
      // Add exit info to path for visualization
      path.exitType = this.getExitType(bestExit.x, bestExit.z);
      path.exitDistance = bestExit.dist;
      
      return path;
    }

    console.log('❌ No reachable exterior openings found');
    return null;
  }

  // Helper method to get exit type
  getExitType(x, z) {
    // Check exterior doors
    for (const door of this.exteriorDoors) {
      const doorCell = this.worldToGrid(door.position);
      if (doorCell && doorCell.x === x && doorCell.z === z) {
        return 'exterior_door';
      }
    }
    
    // Check exterior windows
    for (const window of this.exteriorWindows) {
      const windowCell = this.worldToGrid(window.position);
      if (windowCell && windowCell.x === x && windowCell.z === z) {
        return 'exterior_window';
      }
    }
    
    return 'exit';
  }

  // Check if a grid cell contains an exterior door or window
  isExteriorOpening(x, z) {
    // Simple O(1) lookup using targetCells
    return this.targetCells.has(`${x},${z}`);
  }

  // Get valid neighbors with strict obstacle avoidance
  getValidNeighbors(node) {
    const neighbors = [];
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1] // Cardinal directions
    ];
    
    if (this.allowDiagonal) {
      dirs.push(
        [1, 1], [1, -1], [-1, 1], [-1, -1] // Diagonal directions
      );
    }

    for (const [dx, dz] of dirs) {
      const nx = node.x + dx;
      const nz = node.z + dz;
      
      // Check bounds
      if (nx < 0 || nx >= this.gridWidth || nz < 0 || nz >= this.gridDepth) {
        continue;
      }
      
      // STRICT AVOIDANCE: Check walkability and furniture
      if (!this.isWalkable(nx, nz)) continue;
      if (this.hasFurniture(nx, nz)) continue;
      if (this.isAdjacentToFurniture(nx, nz)) continue;
      
      // For diagonal moves, ensure we're not cutting corners through obstacles
      if (Math.abs(dx) === 1 && Math.abs(dz) === 1) {
        // Check both cardinal neighbors to prevent corner cutting
        const neighbor1Walkable = this.isWalkable(node.x + dx, node.z) && 
                                  !this.hasFurniture(node.x + dx, node.z) &&
                                  !this.isAdjacentToFurniture(node.x + dx, node.z);
        const neighbor2Walkable = this.isWalkable(node.x, node.z + dz) &&
                                  !this.hasFurniture(node.x, node.z + dz) &&
                                  !this.isAdjacentToFurniture(node.x, node.z + dz);
        
        if (!neighbor1Walkable || !neighbor2Walkable) {
          continue; // Skip diagonal if either cardinal neighbor is blocked
        }
      }
      
      neighbors.push({ x: nx, z: nz });
    }
    
    return neighbors;
  }

  // Reconstruct path from start to exit
  reconstructPath(prev, startKey, exitKey) {
    const path = [];
    let currentKey = exitKey;
    
    // Build path from exit back to start
    while (currentKey && currentKey !== startKey) {
      const [x, z] = currentKey.split(',').map(Number);
      path.unshift(this.gridToWorld(x, z));
      currentKey = prev.get(currentKey);
    }
    
    // Add start position
    const [sx, sz] = startKey.split(',').map(Number);
    path.unshift(this.gridToWorld(sx, sz));
    
    return path;
  }

  // =====================================================
  // GRID MARKING METHODS
  // =====================================================
  
  markFloorAsWalkable() {
    this.floorObjects.forEach(floor => {
      const r = this.objectToGridRange(floor, 0);
      if (!r) return;
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z]) {
            this.grid[x][z].walkable = true;
            this.grid[x][z].type = 'floor';
            this.grid[x][z].cost = 1;
          }
        }
      }
    });
  }

  markWallsAsBarriers() {
    this.walls.forEach(wall => {
      const r = this.objectToGridRange(wall, 0);
      if (!r) return;
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z]) {
            this.grid[x][z].walkable = false;
            this.grid[x][z].type = 'wall';
            this.grid[x][z].cost = Infinity;
          }
        }
      }
    });
  }

  markWindowsAsBarriers() {
    this.windows.forEach(window => {
      const r = this.objectToGridRange(window, 0);
      if (!r) return;
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z] && this.grid[x][z].type !== 'wall') {
            this.grid[x][z].walkable = false;
            this.grid[x][z].type = 'window';
            this.grid[x][z].cost = Infinity;
          }
        }
      }
    });
  }

  markFurnitureAsSolid() {
    this.furniture.forEach(item => {
      const r = this.objectToGridRange(item, 0.25);
      if (!r) return;
      
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z]) {
            // Force mark as non-walkable
            this.grid[x][z].walkable = false;
            this.grid[x][z].type = 'furniture';
            this.grid[x][z].furnitureId = item.uuid;
          }
        }
      }
    });
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  isWalkable(x, z) {
    if (x < 0 || x >= this.gridWidth || z < 0 || z >= this.gridDepth) return false;
    const cell = this.grid[x][z];
    // Walkable if marked as walkable AND it's floor, door, or exit
    return cell.walkable === true && ['floor', 'door', 'exit'].includes(cell.type);
  }

  findNearestWalkable(x, z, maxRadius = 25) {
    // Check if current is walkable
    if (this.isWalkable(x, z) && !this.hasFurniture(x, z) && !this.isAdjacentToFurniture(x, z)) {
      return {x, z};
    }
    
    // Search in expanding squares
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check perimeter of square
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          
          const nx = x + dx;
          const nz = z + dz;
          
          if (nx >= 0 && nx < this.gridWidth && nz >= 0 && nz < this.gridDepth) {
            if (this.isWalkable(nx, nz) && !this.hasFurniture(nx, nz) && !this.isAdjacentToFurniture(nx, nz)) {
              return {x: nx, z: nz};
            }
          }
        }
      }
    }
    return null;
  }

  worldToGrid(pos) {
    if (!pos || !this.bounds) return null;
    const x = Math.floor((pos.x - this.bounds.minX) / this.gridSize);
    const z = Math.floor((pos.z - this.bounds.minZ) / this.gridSize);
    if (x < 0 || x >= this.gridWidth || z < 0 || z >= this.gridDepth) return null;
    return {x, z};
  }

  gridToWorld(x, z) {
    return new THREE.Vector3(
      this.bounds.minX + x * this.gridSize + this.gridSize/2,
      0.1, // Slightly above ground
      this.bounds.minZ + z * this.gridSize + this.gridSize/2
    );
  }

  objectToGridRange(object, padding = 0) {
    try {
      let bb;
      if (object.geometry) {
        object.geometry.computeBoundingBox();
        bb = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      } else {
        bb = new THREE.Box3().setFromObject(object);
      }
      if (!bb || bb.isEmpty()) return null;
      
      return {
        sx: Math.max(0, Math.floor((bb.min.x - padding - this.bounds.minX) / this.gridSize)),
        ex: Math.min(this.gridWidth - 1, Math.floor((bb.max.x + padding - this.bounds.minX) / this.gridSize)),
        sz: Math.max(0, Math.floor((bb.min.z - padding - this.bounds.minZ) / this.gridSize)),
        ez: Math.min(this.gridDepth - 1, Math.floor((bb.max.z + padding - this.bounds.minZ) / this.gridSize))
      };
    } catch (e) {
      return null;
    }
  }

  calculateBounds(scene) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    scene.traverse(obj => {
      if (obj.isMesh) {
        try {
          const bb = new THREE.Box3().setFromObject(obj);
          if (!bb.isEmpty()) {
            minX = Math.min(minX, bb.min.x);
            maxX = Math.max(maxX, bb.max.x);
            minZ = Math.min(minZ, bb.min.z);
            maxZ = Math.max(maxZ, bb.max.z);
          }
        } catch (e) { /* skip problematic objects */ }
      }
    });
    
    // Default bounds if scene is empty
    if (minX === Infinity) {
      minX = -20; maxX = 20; minZ = -20; maxZ = 20;
    }
    
    // Add padding
    const pad = 10;
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad
    };
  }

  initializeEmptyGrid() {
    this.grid = Array.from({length: this.gridWidth}, () =>
      Array.from({length: this.gridDepth}, () => ({
        walkable: false,
        type: 'void',
        cost: Infinity,
        safetyCost: 0,
        furnitureId: null,
        exitType: null // Add exitType field
      }))
    );
  }

  // =====================================================
  // PATH SMOOTHING
  // =====================================================
  hasLineOfSight(a, b) {
    const ga = this.worldToGrid(a);
    const gb = this.worldToGrid(b);
    if (!ga || !gb) return false;
    
    let x0 = ga.x, z0 = ga.z;
    const x1 = gb.x, z1 = gb.z;
    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      // Check if current cell is valid
      if (!this.isWalkable(x0, z0)) return false;
      if (this.hasFurniture(x0, z0) || this.isAdjacentToFurniture(x0, z0)) return false;

      if (x0 === x1 && z0 === z1) return true;
      
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }

  smoothPath(path) {
    if (!path || path.length <= 2) return path;
    
    const smoothed = [path[0]];
    let currentIndex = 0;
    
    for (let i = 2; i < path.length; i++) {
      if (!this.hasLineOfSight(path[currentIndex], path[i])) {
        // Can't go directly, add intermediate point
        smoothed.push(path[i - 1]);
        currentIndex = i - 1;
      }
    }
    
    // Add the final point
    smoothed.push(path[path.length - 1]);
    
    return smoothed;
  }

  collectFloorObjects(scene) {
    this.floorObjects = [];
    scene.traverse(obj => {
      const ud = obj.userData || {};
      if (ud.type === 'floor' || ud.isFloor || /floor|ground|terrain/i.test(obj.name || '')) {
        this.floorObjects.push(obj);
      }
    });
  }

  // Helper to get nearest escape point (for debugging)
  getNearestEscapePoint(position) {
    if (!position) return null;
    
    let nearest = null;
    let nearestDist = Infinity;
    
    // Check exterior doors
    this.exteriorDoors.forEach(door => {
      const dist = position.distanceTo(door.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { type: 'door', object: door, position: door.position.clone() };
      }
    });
    
    // Check exterior windows
    this.exteriorWindows.forEach(window => {
      const dist = position.distanceTo(window.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { type: 'window', object: window, position: window.position.clone() };
      }
    });
    
    return nearest;
  }
}