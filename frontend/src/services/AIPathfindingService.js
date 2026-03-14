import * as THREE from 'three';
import { PathfindingService } from './PathfindingService';

export class AIPathfindingService extends PathfindingService {
  constructor(gridSize = 0.5) {
    super(gridSize);
    this.learningData = new Map(); // Store successful paths
    this.hazardZones = new Map(); // Store areas affected by disasters
    this.safetyScores = new Map(); // Store safety ratings for cells
    this.furnitureHazards = new Map(); // Store furniture hazard zones
    this.allowDiagonal = true; // Enable diagonal movement for smoother paths
  }

  // Update hazard zones based on disaster simulation
  updateHazardZones(disasterType, disasterParams, scene) {
    const hazardKey = `${disasterType}_${Date.now()}`;
    
    scene.traverse((object) => {
      if (object.isMesh) {
        const pos = object.position;
        const gridPos = this.worldToGrid(pos);
        
        if (!gridPos) return;
        
        // Calculate hazard level based on disaster type
        let hazardLevel = 0;
        
        if (disasterType === 'earthquake') {
          // Areas near walls have higher hazard
          if (object.userData.isWall) {
            hazardLevel = disasterParams.magnitude * 2;
          }
          // Furniture can topple
          else if (object.userData.isFurniture || object.userData.furnitureType) {
            hazardLevel = disasterParams.magnitude * 1.5;
          }
        } else if (disasterType === 'flood') {
          // Lower areas have higher flood hazard
          const waterLevel = disasterParams.waterLevel || 1.5;
          const objectHeight = object.userData.dimensions?.height || 1;
          
          if (pos.y < waterLevel) {
            hazardLevel = 10 * (waterLevel - pos.y);
          }
        }
        
        if (hazardLevel > 0) {
          const key = `${gridPos.x},${gridPos.z}`;
          if (!this.hazardZones.has(key)) {
            this.hazardZones.set(key, []);
          }
          this.hazardZones.get(key).push({
            hazardLevel,
            timestamp: Date.now(),
            disasterType
          });
        }
      }
    });
    
    // Update safety scores based on hazard history
    this.updateSafetyScores();
  }

  // =====================================================
  // Update hazard zones based on furniture positions
  // =====================================================
  updateFurnitureHazardZones(scene) {
    // Clear existing data
    this.furnitureHazards.clear();
    
    // Clear and rebuild base class furniture array
    this.furniture = [];
    
    scene.traverse((object) => {
      // Check if object is furniture (using multiple detection methods)
      const isFurniture = object.userData?.isFurniture || 
                          object.userData?.furnitureType || 
                          object.userData?.type === 'furniture' ||
                          object.name?.toLowerCase().includes('bed') ||
                          object.name?.toLowerCase().includes('sofa') ||
                          object.name?.toLowerCase().includes('chair') ||
                          object.name?.toLowerCase().includes('table') ||
                          object.name?.toLowerCase().includes('dining');
      
      if (isFurniture) {
        // Add to base class furniture array
        this.furniture.push(object);
        
        const pos = object.position;
        const gridPos = this.worldToGrid(pos);
        
        if (!gridPos) return;
        
        // Calculate hazard level based on furniture type
        let hazardLevel = 2.0; // Base furniture hazard
        
        // Increase hazard based on furniture type (some furniture more dangerous)
        if (object.userData?.furnitureType === 'table' || 
            object.userData?.furnitureType === 'dining') {
          hazardLevel = 3.0; // Tables have legs to trip over
        } else if (object.userData?.furnitureType === 'chair') {
          hazardLevel = 2.5; // Chairs can be moved around
        } else if (object.userData?.furnitureType === 'bed') {
          hazardLevel = 1.5; // Beds are low obstacle
        } else if (object.userData?.furnitureType === 'sofa') {
          hazardLevel = 2.0; // Sofas are medium obstacle
        }
        
        // Mark hazard in furnitureHazards map
        const key = `${gridPos.x},${gridPos.z}`;
        if (!this.furnitureHazards.has(key)) {
          this.furnitureHazards.set(key, []);
        }
        this.furnitureHazards.get(key).push({
          hazardLevel,
          timestamp: Date.now(),
          disasterType: 'furniture'
        });
      }
    });
    
    // Re-mark furniture in the grid to make it non-walkable
    this.markFurnitureAsSolid();
    this.buildFurnitureMap();
    
    // Update safety scores based on furniture positions
    this.updateSafetyScores();
  }

  // Override markFurnitureAsSolid to ensure it works with the grid
  markFurnitureAsSolid() {
    this.furniture.forEach(item => {
      const r = this.objectToGridRange(item, 0.25);
      if (!r) return;
      
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          if (this.grid[x] && this.grid[x][z]) {
            // Force mark as non-walkable regardless of current type
            this.grid[x][z].walkable = false;
            this.grid[x][z].type = 'furniture';
            this.grid[x][z].furnitureId = item.uuid;
          }
        }
      }
    });
  }

  // Build furniture position map for quick lookup
  buildFurnitureMap() {
    this.furniturePositions.clear();
    
    this.furniture.forEach(item => {
      const r = this.objectToGridRange(item, 0.25);
      if (!r) return;
      
      for (let x = r.sx; x <= r.ex; x++) {
        for (let z = r.sz; z <= r.ez; z++) {
          const key = `${x},${z}`;
          this.furniturePositions.set(key, true);
          
          // Mark adjacent cells
          const adjacentCells = [
            [x + 1, z], [x - 1, z],
            [x, z + 1], [x, z - 1]
          ];
          
          adjacentCells.forEach(([ax, az]) => {
            if (ax >= 0 && ax < this.gridWidth && az >= 0 && az < this.gridDepth) {
              const adjKey = `${ax},${az}`;
              if (!this.furniturePositions.has(adjKey)) {
                this.furniturePositions.set(adjKey, 'adjacent');
              }
            }
          });
        }
      }
    });
  }

  // Debug method to count furniture in grid (keep for internal use, remove console.log if not needed)
  debugFurnitureGrid() {
    let furnitureCount = 0;
    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridDepth; z++) {
        if (this.grid[x] && this.grid[x][z] && this.grid[x][z].type === 'furniture') {
          furnitureCount++;
        }
      }
    }
    return furnitureCount;
  }

  updateSafetyScores() {
    // Calculate safety scores based on hazard history and furniture
    // Lower score = safer
    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridDepth; z++) {
        const key = `${x},${z}`;
        const hazards = this.hazardZones.get(key) || [];
        const furnitureHazards = this.furnitureHazards.get(key) || [];
        
        // Combine all hazards
        const allHazards = [...hazards, ...furnitureHazards];
        
        // Calculate average hazard level
        if (allHazards.length > 0) {
          const avgHazard = allHazards.reduce((sum, h) => sum + h.hazardLevel, 0) / allHazards.length;
          this.safetyScores.set(key, avgHazard);
          
          // Update grid cell cost based on safety score - NEVER OVERRIDE WALLS
          if (this.grid[x] && this.grid[x][z] && this.grid[x][z].type !== 'wall') {
            this.grid[x][z].safetyCost = avgHazard * 0.1;
          }
        }
      }
    }
  }

  // Override getMovementCost to include safety scores
  getMovementCost(from, to) {
    const baseCost = super.getMovementCost(from, to);
    
    // Add safety cost - but walls already have infinite cost
    if (this.grid[to.x][to.z].type === 'wall') {
      return Infinity; // Walls are impassable
    }
    
    const toKey = `${to.x},${to.z}`;
    const safetyCost = this.safetyScores.get(toKey) || 0;
    
    return baseCost + safetyCost;
  }

  // Learn from successful evacuation paths
  learnFromPath(path, success) {
    if (!path || path.length === 0) return;
    
    const pathKey = this.hashPath(path);
    
    if (!this.learningData.has(pathKey)) {
      this.learningData.set(pathKey, {
        path: path,
        successCount: 0,
        failCount: 0,
        lastUsed: null
      });
    }
    
    const data = this.learningData.get(pathKey);
    if (success) {
      data.successCount++;
    } else {
      data.failCount++;
    }
    data.lastUsed = Date.now();
  }

  hashPath(path) {
    return path.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join('|');
  }

  // Find path with AI preferences
  findAIPath(start, end, preferLearnedPaths = true) {
    // Try to find a learned path first
    if (preferLearnedPaths) {
      const bestLearnedPath = this.findBestLearnedPath(start, end);
      if (bestLearnedPath) {
        return bestLearnedPath;
      }
    }
    
    // Fall back to regular A* pathfinding
    return this.findPath(start, end);
  }

  findBestLearnedPath(start, end) {
    let bestPath = null;
    let bestScore = -Infinity;
    
    const startGrid = this.worldToGrid(start);
    const endGrid = this.worldToGrid(end);
    
    if (!startGrid || !endGrid) return null;
    
    for (const [_, data] of this.learningData) {
      const pathStart = data.path[0];
      const pathEnd = data.path[data.path.length - 1];
      
      // Check if path starts and ends near our desired points
      const startDist = Math.abs(pathStart.x - start.x) + Math.abs(pathStart.z - start.z);
      const endDist = Math.abs(pathEnd.x - end.x) + Math.abs(pathEnd.z - end.z);
      
      if (startDist < 2 && endDist < 2) {
        // Calculate path score based on success rate and recency
        const totalAttempts = data.successCount + data.failCount;
        const successRate = totalAttempts > 0 ? data.successCount / totalAttempts : 0;
        const recencyBonus = data.lastUsed ? Math.exp((Date.now() - data.lastUsed) / -86400000) : 0; // Decay over 24 hours
        
        const score = successRate * 100 + recencyBonus * 10;
        
        if (score > bestScore) {
          bestScore = score;
          bestPath = data.path;
        }
      }
    }
    
    return bestPath;
  }

  // =====================================================
  // Override findEscapePath to use AI and furniture hazard awareness
  // =====================================================
  findEscapePath(currentPosition, scene) {
    // First update furniture hazard zones - this now populates this.furniture
    this.updateFurnitureHazardZones(scene);
    
    // Re-mark furniture in grid to ensure it's non-walkable
    this.markFurnitureAsSolid();
    this.buildFurnitureMap();
    
    // Then find the best path using base class method
    const path = super.findEscapePath(currentPosition, scene);
    
    // EXTRA SAFETY: Check if path goes through walls or furniture
    if (path) {
      let hasObstacle = false;
      for (let i = 0; i < path.length; i++) {
        const point = path[i];
        const gridPos = this.worldToGrid(point);
        if (gridPos) {
          const cellType = this.grid[gridPos.x][gridPos.z].type;
          if (cellType === 'wall') {
            return null;
          }
          if (cellType === 'furniture') {
            hasObstacle = true;
          }
        }
      }
    }
    
    // Learn from this path attempt (if we found one)
    if (path) {
      this.learnFromPath(path, true);
    }
    
    return path;
  }

  // Mark all grid cells covered by furniture (for hazard visualization)
  markFurnitureCells(furniture, hazardLevel) {
    // Calculate bounds of furniture
    let minX, maxX, minZ, maxZ;
    const padding = 0.5; // 0.5m padding around furniture for hazard zone
    
    if (furniture.isGroup) {
      // Calculate bounds from children
      let bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
      };
      
      furniture.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.parameters) {
          const pos = child.position.clone();
          child.localToWorld(pos);
          
          const childWidth = child.geometry.parameters.width || 1;
          const childDepth = child.geometry.parameters.height || child.geometry.parameters.depth || 1;
          
          bounds.minX = Math.min(bounds.minX, pos.x - childWidth/2);
          bounds.maxX = Math.max(bounds.maxX, pos.x + childWidth/2);
          bounds.minZ = Math.min(bounds.minZ, pos.z - childDepth/2);
          bounds.maxZ = Math.max(bounds.maxZ, pos.z + childDepth/2);
        }
      });
      
      if (bounds.minX !== Infinity) {
        minX = bounds.minX;
        maxX = bounds.maxX;
        minZ = bounds.minZ;
        maxZ = bounds.maxZ;
      } else {
        return;
      }
    } else {
      const geometry = furniture.geometry;
      if (!geometry || !geometry.parameters) return;
      
      const width = geometry.parameters.width || 1;
      const depth = geometry.parameters.height || geometry.parameters.depth || 1;
      
      minX = furniture.position.x - width/2;
      maxX = furniture.position.x + width/2;
      minZ = furniture.position.z - depth/2;
      maxZ = furniture.position.z + depth/2;
    }
    
    // Add padding
    minX -= padding;
    maxX += padding;
    minZ -= padding;
    maxZ += padding;
    
    const startX = Math.max(0, Math.floor((minX - this.bounds.minX) / this.gridSize));
    const endX = Math.min(this.gridWidth - 1, Math.floor((maxX - this.bounds.minX) / this.gridSize));
    const startZ = Math.max(0, Math.floor((minZ - this.bounds.minZ) / this.gridSize));
    const endZ = Math.min(this.gridDepth - 1, Math.floor((maxZ - this.bounds.minZ) / this.gridSize));
    
    for (let x = startX; x <= endX; x++) {
      for (let z = startZ; z <= endZ; z++) {
        const key = `${x},${z}`;
        
        if (!this.furnitureHazards.has(key)) {
          this.furnitureHazards.set(key, []);
        }
        
        this.furnitureHazards.get(key).push({
          hazardLevel: hazardLevel,
          timestamp: Date.now(),
          disasterType: 'furniture'
        });
        
        // Update grid cell with hazard cost - BUT NEVER OVERRIDE WALLS
        if (this.grid[x] && this.grid[x][z]) {
          // CRITICAL: Never mark walls with safety cost - walls are absolute barriers
          if (this.grid[x][z].type !== 'wall') {
            this.grid[x][z].safetyCost = (this.grid[x][z].safetyCost || 0) + hazardLevel;
          }
        }
      }
    }
  }
}