import * as THREE from 'three';

// Min-Heap Priority Queue for A* 
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
    this.targetCells = new Set(); // Stores 'x,z' keys of valid exits (doors only)
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
    this.markWallsAsBarriers();      // Walls override floor (non-walkable, impassable)
    this.markWindowsAsBarriers();    // Windows override floor (non-walkable, impassable)
    this.markFurnitureAsSolid();     // Furniture overrides everything (non-walkable, impassable)
    
    this.buildFurnitureMap();        // Build quick lookup for furniture positions
    this.classifyExteriorOpenings(); // Classify doors/windows as exterior/interior
    this.markExteriorDoorsAsTargets(); // Mark ONLY exterior doors as walkable targets
    
    // Log grid statistics for debugging
    this.logGridStatistics();
    
    return this.grid;
  }

  logGridStatistics() {
    let walkableCount = 0;
    let wallCount = 0;
    let windowCount = 0;
    let furnitureCount = 0;
    let exitCount = 0;
    let voidCount = 0;
    
    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridDepth; z++) {
        const cell = this.grid[x][z];
        if (cell.walkable) {
          walkableCount++;
          if (cell.type === 'exit') exitCount++;
        } else {
          if (cell.type === 'wall') wallCount++;
          else if (cell.type === 'window') windowCount++;
          else if (cell.type === 'furniture') furnitureCount++;
          else if (cell.type === 'void') voidCount++;
        }
      }
    }
    
    console.log(`📊 Grid Statistics:`);
    console.log(`   - Total cells: ${this.gridWidth * this.gridDepth}`);
    console.log(`   - Walkable cells: ${walkableCount} (${exitCount} exits)`);
    console.log(`   - Obstacles: Walls: ${wallCount}, Windows: ${windowCount}, Furniture: ${furnitureCount}, Void: ${voidCount}`);
  }

  // UPDATED: Recursive traversal to find furniture in nested groups
  collectAllObjects(scene) {
    this.walls = [];
    this.windows = [];
    this.doors = [];
    this.furniture = [];
    
    // Helper function for recursive traversal
    const traverseObject = (obj) => {
      if (!obj) return;
      
      const ud = obj.userData || {};
      const name = (obj.name || '').toLowerCase();
      
      // Check for furniture FIRST (including groups)
      if (ud.isFurniture === true || ud.furnitureType) {
        this.furniture.push(obj);
        console.log(`🪑 Found furniture: ${ud.furnitureType || 'unknown'} at position (${obj.position.x.toFixed(2)}, ${obj.position.z.toFixed(2)})`);
      }
      // Check for walls
      else if (ud.isWall || ud.type === 'wall' || name.includes('wall')) {
        this.walls.push(obj);
      }
      // Check for windows
      else if (ud.isWindow || ud.type === 'window' || name.includes('window')) {
        this.windows.push(obj);
      }
      // Check for doors
      else if (ud.isDoor || ud.type === 'door' || name.includes('door')) {
        this.doors.push(obj);
      }
      // Check for furniture by name patterns
      else if (ud.type === 'furniture' || 
               name.includes('furniture') || 
               name.includes('bed') || 
               name.includes('sofa') || 
               name.includes('chair') || 
               name.includes('table') || 
               name.includes('desk') ||
               name.includes('cabinet') || 
               name.includes('shelf')) {
        this.furniture.push(obj);
        console.log(`🪑 Found furniture by name: ${obj.name} at position (${obj.position.x.toFixed(2)}, ${obj.position.z.toFixed(2)})`);
      }
      
      // Recursively traverse children (CRITICAL for furniture in groups)
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => traverseObject(child));
      }
    };
    
    // Start traversal from scene
    traverseObject(scene);
    
    console.log(`📦 Collected objects: Walls: ${this.walls.length}, Windows: ${this.windows.length}, Doors: ${this.doors.length}, Furniture: ${this.furniture.length}`);
  }

  buildFurnitureMap() {
    this.furniturePositions.clear();
    
    this.furniture.forEach(item => {
      // Get world bounds for the furniture (handles groups properly)
      let worldBounds;
      try {
        const box = new THREE.Box3().setFromObject(item);
        if (box.isEmpty()) return;
        worldBounds = box;
      } catch (e) {
        console.warn('Could not compute bounds for furniture:', e);
        return;
      }
      
      // Convert world bounds to grid range
      const r = {
        sx: Math.max(0, Math.floor((worldBounds.min.x - this.bounds.minX) / this.gridSize)),
        ex: Math.min(this.gridWidth - 1, Math.floor((worldBounds.max.x - this.bounds.minX) / this.gridSize)),
        sz: Math.max(0, Math.floor((worldBounds.min.z - this.bounds.minZ) / this.gridSize)),
        ez: Math.min(this.gridDepth - 1, Math.floor((worldBounds.max.z - this.bounds.minZ) / this.gridSize))
      };
      
      // Mark furniture cells as impassable
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          const key = `${x},${z}`;
          this.furniturePositions.set(key, true);
        }
      }
      
      // Mark adjacent cells (for avoidance - can walk but with caution)
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
    
    console.log(`🪑 Furniture map built: ${this.furniturePositions.size} cells marked (furniture + adjacent)`);
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
      
      // Exterior if only one side has obstacles (the interior side)
      const isExterior = (hasForwardHit && !hasBackwardHit) || (!hasForwardHit && hasBackwardHit);
      
      if (isExterior) {
        this.exteriorDoors.push(door);
        door.userData.isExterior = true;
      } else {
        this.interiorDoors.push(door);
        door.userData.isExterior = false;
      }
    });

    // Classify windows (for reference only - not used in pathfinding)
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
      
      const isExterior = (hasForwardHit && !hasBackwardHit) || (!hasForwardHit && hasBackwardHit);
      
      if (isExterior) {
        this.exteriorWindows.push(window);
        window.userData.isExterior = true;
      } else {
        this.interiorWindows.push(window);
        window.userData.isExterior = false;
      }
    });
    
    console.log(`🚪 Exterior doors: ${this.exteriorDoors.length}, Interior doors: ${this.interiorDoors.length}`);
    console.log(`🪟 Exterior windows: ${this.exteriorWindows.length} (excluded from escape paths, treated as barriers)`);
  }
  
  // =====================================================
  // TARGET REGISTRATION - Mark ONLY exterior doors as walkable
  // =====================================================
  markExteriorDoorsAsTargets() {
    this.targetCells.clear();
    
    const processDoor = (door) => {
      // Use small padding to ensure we catch the grid cell containing the door
      const r = this.objectToGridRange(door, 0.1);
      if (!r) return;

      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (x >= 0 && x < this.gridWidth && z >= 0 && z < this.gridDepth) {
            // Override previous marks (like walls/windows) to make it walkable
            this.grid[x][z].walkable = true;
            this.grid[x][z].type = 'exit';
            this.grid[x][z].exitType = 'door';
            this.grid[x][z].cost = 1;
            this.grid[x][z].isObstacle = false;
            
            // Add to fast-lookup set
            this.targetCells.add(`${x},${z}`);
          }
        }
      }
    };

    // Mark exterior doors ONLY (windows are NOT marked as exits)
    this.exteriorDoors.forEach(door => processDoor(door));

    console.log(`🎯 Marked ${this.targetCells.size} grid cells as exterior door exits.`);
    console.log(`   - Doors: ${this.exteriorDoors.length} (windows excluded from escape paths)`);
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

  // Check if cell contains furniture (impassable)
  hasFurniture(x, z) {
    const key = `${x},${z}`;
    return this.furniturePositions.get(key) === true;
  }

  // Check if cell is adjacent to furniture (passable but with caution)
  isAdjacentToFurniture(x, z) {
    const key = `${x},${z}`;
    return this.furniturePositions.get(key) === 'adjacent';
  }

  // =====================================================
  // STRICT OBSTACLE CHECK - Returns true if cell is an obstacle
  // =====================================================
  isObstacle(x, z) {
    if (x < 0 || x >= this.gridWidth || z < 0 || z >= this.gridDepth) return true;
    
    const cell = this.grid[x][z];
    
    // Check if cell is marked as an obstacle type
    if (cell.type === 'wall' || cell.type === 'window' || cell.type === 'furniture') {
      return true;
    }
    
    // Check if cell has furniture (redundant but safe)
    if (this.hasFurniture(x, z)) {
      return true;
    }
    
    // Check if cell is not walkable
    if (!cell.walkable) {
      return true;
    }
    
    return false;
  }

  // =====================================================
  // HEURISTIC FUNCTION FOR A*
  // =====================================================
  heuristic(a, b) {
    // Manhattan distance (good for grid-based movement)
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  }

  // =====================================================
  // A* ALGORITHM for single target with strict obstacle avoidance
  // =====================================================
  findPathAStar(start, goal) {
    const openSet = new MinHeap();
    const cameFrom = new Map();
    const gScore = new Map(); // Cost from start
    const fScore = new Map(); // g + heuristic
    
    const startKey = `${start.x},${start.z}`;
    const goalKey = `${goal.x},${goal.z}`;
    
    // Verify start and goal are not obstacles
    if (this.isObstacle(start.x, start.z)) {
      console.warn('Start position is an obstacle!');
      return null;
    }
    
    if (this.isObstacle(goal.x, goal.z)) {
      console.warn('Goal position is an obstacle!');
      return null;
    }
    
    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(start, goal));
    openSet.push({ x: start.x, z: start.z, f: fScore.get(startKey) });
    
    const visited = new Set();
    let iterations = 0;
    const maxIterations = this.gridWidth * this.gridDepth * 4; // Safety limit
    
    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;
      const current = openSet.pop();
      const currentKey = `${current.x},${current.z}`;
      
      // Goal reached
      if (currentKey === goalKey) {
        console.log(`✅ Path found in ${iterations} iterations`);
        return this.reconstructPath(cameFrom, currentKey, startKey);
      }
      
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      
      const currentG = gScore.get(currentKey);
      
      for (const neighbor of this.getValidNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.z}`;
        
        if (visited.has(neighborKey)) continue;
        
        // Calculate movement cost (higher cost for cells adjacent to furniture)
        let moveCost = 1; // Base cost
        
        if (this.grid[neighbor.x] && this.grid[neighbor.x][neighbor.z]) {
          moveCost += this.grid[neighbor.x][neighbor.z].safetyCost || 0;
        }
        
        // Add penalty for cells adjacent to furniture (stay away from obstacles)
        if (this.isAdjacentToFurniture(neighbor.x, neighbor.z)) {
          moveCost += 0.5;
        }
        
        const tentativeG = currentG + moveCost;
        
        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, goal));
          openSet.push({ x: neighbor.x, z: neighbor.z, f: fScore.get(neighborKey) });
        }
      }
    }
    
    console.warn(`No path found after ${iterations} iterations`);
    return null; // No path found
  }

  // =====================================================
  // MAIN ENTRY POINT - Find shortest path to ANY exterior DOOR
  // =====================================================
  findEscapePath(currentPosition) {
    if (!this.grid) {
      console.warn('Grid not initialized');
      return null;
    }
    
    console.log(`🔍 Pathfinding: Found ${this.exteriorDoors.length} exterior doors (windows excluded from escape path)`);
    
    // Check if we have any escape routes
    if (this.exteriorDoors.length === 0) {
      console.warn('No exterior doors found for escape');
      return null;
    }

    // Convert start position to grid coordinates
    let start = this.worldToGrid(currentPosition);
    if (!start) {
      console.warn('Start position outside grid bounds');
      return null;
    }
    
    console.log(`📍 Start position at grid (${start.x}, ${start.z})`);
    
    // Adjust start position if it's in an obstacle
    if (this.isObstacle(start.x, start.z)) {
      console.log('Start position is in obstacle, finding nearest walkable cell...');
      const nearestWalkable = this.findNearestWalkable(start.x, start.z);
      if (!nearestWalkable) {
        console.warn('No walkable start position found');
        return null;
      }
      start = nearestWalkable;
      console.log(`   Moved to (${start.x}, ${start.z})`);
    }

    // Find path using A* to the closest exterior door
    const path = this.findClosestExitWithAStar(start);
    
    if (path && path.length > 0) {
      console.log(`✅ Path found to nearest exterior door (path length: ${path.length} points)`);
      const smoothedPath = this.smoothPath(path);
      console.log(`   Smoothed path length: ${smoothedPath.length} points`);
      return smoothedPath;
    }

    console.warn('No path found to any exterior door');
    return null;
  }

  // =====================================================
  // Find closest exterior door using A* (run A* for each door, pick shortest)
  // =====================================================
  findClosestExitWithAStar(start) {
    let bestPath = null;
    let bestLength = Infinity;
    
    // Track all reachable doors
    const reachableDoors = [];
    
    // Helper function to process each exterior door
    const processDoor = (door) => {
      const doorGrid = this.worldToGrid(door.position);
      if (!doorGrid) return;
      
      // Verify door cell is not an obstacle
      if (this.isObstacle(doorGrid.x, doorGrid.z)) {
        console.log(`Door at (${doorGrid.x}, ${doorGrid.z}) is blocked by obstacle`);
        return;
      }
      
      console.log(`  Trying door at (${doorGrid.x}, ${doorGrid.z})...`);
      const path = this.findPathAStar(start, doorGrid);
      
      if (path) {
        const pathLength = path.length;
        reachableDoors.push({
          type: 'exterior_door',
          path: path,
          length: pathLength,
          doorGrid: doorGrid,
          doorObject: door
        });
        
        if (pathLength < bestLength) {
          bestLength = pathLength;
          bestPath = path;
        }
      } else {
        console.log(`  No path to door at (${doorGrid.x}, ${doorGrid.z})`);
      }
    };
    
    // Process all exterior doors ONLY (exclude windows)
    console.log(`🎯 Checking ${this.exteriorDoors.length} exterior doors...`);
    this.exteriorDoors.forEach((door, index) => {
      console.log(`Door ${index + 1}/${this.exteriorDoors.length}:`);
      processDoor(door);
    });
    
    if (reachableDoors.length > 0) {
      console.log(`✅ Found ${reachableDoors.length} reachable exterior doors:`);
      reachableDoors.sort((a, b) => a.length - b.length).forEach((door, index) => {
        console.log(`   ${index+1}. Door at distance ${door.length} steps`);
      });
      
      // Add exit info to path for visualization
      if (bestPath) {
        bestPath.exitType = 'exterior_door';
        bestPath.exitDistance = bestLength;
      }
      
      return bestPath;
    }
    
    console.log('❌ No reachable exterior doors found');
    return null;
  }

  // Helper method to get exit type (doors only)
  getExitType(x, z) {
    // Check exterior doors
    for (const door of this.exteriorDoors) {
      const doorCell = this.worldToGrid(door.position);
      if (doorCell && doorCell.x === x && doorCell.z === z) {
        return 'exterior_door';
      }
    }
    return 'exit';
  }

  // Check if a grid cell contains an exterior door (not window)
  isExteriorOpening(x, z) {
    // Check only doors, not windows
    for (const door of this.exteriorDoors) {
      const doorCell = this.worldToGrid(door.position);
      if (doorCell && doorCell.x === x && doorCell.z === z) {
        return true;
      }
    }
    return false;
  }

  // Get valid neighbors with strict obstacle avoidance - NEVER return obstacle cells
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
      
      // STRICT AVOIDANCE: Skip if cell is an obstacle
      if (this.isObstacle(nx, nz)) {
        continue;
      }
      
      // Skip if cell has furniture (already covered by isObstacle, but double-check)
      if (this.hasFurniture(nx, nz)) {
        continue;
      }
      
      // For diagonal moves, ensure we're not cutting corners through obstacles
      if (Math.abs(dx) === 1 && Math.abs(dz) === 1) {
        // Check both cardinal neighbors to prevent corner cutting
        const neighbor1IsObstacle = this.isObstacle(node.x + dx, node.z);
        const neighbor2IsObstacle = this.isObstacle(node.x, node.z + dz);
        
        // If either cardinal neighbor is an obstacle, skip diagonal
        if (neighbor1IsObstacle || neighbor2IsObstacle) {
          continue;
        }
      }
      
      neighbors.push({ x: nx, z: nz });
    }
    
    return neighbors;
  }

  // Reconstruct path from goal back to start
  reconstructPath(cameFrom, currentKey, startKey) {
    const path = [];
    
    // Build path from goal back to start
    while (currentKey && currentKey !== startKey) {
      const [x, z] = currentKey.split(',').map(Number);
      path.unshift(this.gridToWorld(x, z));
      currentKey = cameFrom.get(currentKey);
    }
    
    // Add start position
    const [sx, sz] = startKey.split(',').map(Number);
    path.unshift(this.gridToWorld(sx, sz));
    
    return path;
  }

  // =====================================================
  // GRID MARKING METHODS - All obstacles marked as NOT walkable
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
            this.grid[x][z].isObstacle = false;
          }
        }
      }
    });
    console.log(`✅ Marked floor as walkable`);
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
            this.grid[x][z].isObstacle = true;
          }
        }
      }
    });
    console.log(`🧱 Marked ${this.walls.length} walls as impassable barriers`);
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
            this.grid[x][z].isObstacle = true;
          }
        }
      }
    });
    console.log(`🪟 Marked ${this.windows.length} windows as impassable barriers`);
  }

  // UPDATED: Use world bounds for furniture to handle groups properly
  markFurnitureAsSolid() {
    this.furniture.forEach(item => {
      // Get world bounds for the furniture (handles groups properly)
      let worldBounds;
      try {
        const box = new THREE.Box3().setFromObject(item);
        if (box.isEmpty()) return;
        worldBounds = box;
      } catch (e) {
        console.warn('Could not compute bounds for furniture:', e);
        return;
      }
      
      // Convert world bounds to grid range
      const r = {
        sx: Math.max(0, Math.floor((worldBounds.min.x - this.bounds.minX) / this.gridSize)),
        ex: Math.min(this.gridWidth - 1, Math.floor((worldBounds.max.x - this.bounds.minX) / this.gridSize)),
        sz: Math.max(0, Math.floor((worldBounds.min.z - this.bounds.minZ) / this.gridSize)),
        ez: Math.min(this.gridDepth - 1, Math.floor((worldBounds.max.z - this.bounds.minZ) / this.gridSize))
      };
      
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z]) {
            // Force mark as non-walkable
            this.grid[x][z].walkable = false;
            this.grid[x][z].type = 'furniture';
            this.grid[x][z].cost = Infinity;
            this.grid[x][z].isObstacle = true;
            this.grid[x][z].furnitureId = item.uuid;
          }
        }
      }
    });
    console.log(`🪑 Marked ${this.furniture.length} furniture items as impassable obstacles`);
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  isWalkable(x, z) {
    if (x < 0 || x >= this.gridWidth || z < 0 || z >= this.gridDepth) return false;
    const cell = this.grid[x][z];
    // Walkable if marked as walkable AND not an obstacle AND is floor, door, or exit
    return cell.walkable === true && 
           cell.isObstacle !== true && 
           ['floor', 'door', 'exit'].includes(cell.type);
  }

  findNearestWalkable(x, z, maxRadius = 25) {
    // Check if current is walkable
    if (this.isWalkable(x, z) && !this.hasFurniture(x, z)) {
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
            if (this.isWalkable(nx, nz) && !this.hasFurniture(nx, nz)) {
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
        exitType: null,
        isObstacle: true // Default to obstacle
      }))
    );
  }

  // =====================================================
  // PATH SMOOTHING with obstacle checking
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
      // Check if current cell is an obstacle
      if (this.isObstacle(x0, z0)) return false;
      
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
    
    // Helper function for recursive traversal to find floors
    const traverseForFloors = (obj) => {
      if (!obj) return;
      
      const ud = obj.userData || {};
      if (ud.type === 'floor' || ud.isFloor || /floor|ground|terrain/i.test(obj.name || '')) {
        this.floorObjects.push(obj);
      }
      
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => traverseForFloors(child));
      }
    };
    
    traverseForFloors(scene);
    console.log(`🌍 Found ${this.floorObjects.length} floor objects`);
  }

  // Helper to get nearest escape point (for debugging) - doors only
  getNearestEscapePoint(position) {
    if (!position) return null;
    
    let nearest = null;
    let nearestDist = Infinity;
    
    // Check exterior doors ONLY
    this.exteriorDoors.forEach(door => {
      const dist = position.distanceTo(door.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { type: 'door', object: door, position: door.position.clone() };
      }
    });
    
    return nearest;
  }
  
  // Debug method to visualize obstacles (call this for testing)
  getObstacleMap() {
    const obstacleMap = [];
    for (let x = 0; x < this.gridWidth; x++) {
      obstacleMap[x] = [];
      for (let z = 0; z < this.gridDepth; z++) {
        obstacleMap[x][z] = {
          isObstacle: this.isObstacle(x, z),
          type: this.grid[x][z].type,
          walkable: this.grid[x][z].walkable
        };
      }
    }
    return obstacleMap;
  }
  
  // Debug method to list all detected furniture
  debugFurnitureDetection() {
    console.log('=== FURNITURE DETECTION DEBUG ===');
    console.log(`Total furniture objects in service: ${this.furniture.length}`);
    
    this.furniture.forEach((furniture, index) => {
      console.log(`Furniture ${index + 1}:`);
      console.log(`  - Type: ${furniture.userData.furnitureType || 'unknown'}`);
      console.log(`  - Position: (${furniture.position.x.toFixed(2)}, ${furniture.position.z.toFixed(2)})`);
      console.log(`  - UUID: ${furniture.uuid}`);
    });
    
    console.log(`Furniture positions map size: ${this.furniturePositions.size}`);
    console.log(`Target cells (exits): ${this.targetCells.size}`);
    console.log('================================');
  }
}