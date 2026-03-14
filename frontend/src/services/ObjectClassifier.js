// src/services/ObjectClassifier.js
import * as THREE from 'three';

export class ObjectClassifier {
  constructor() {
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.furniture = [];
    this.floorObjects = [];
    this.ceilingObjects = [];
    this.unknown = [];
    
    // Typical dimensions (in meters)
    this.dimensions = {
      wall: {
        minHeight: 2.0,
        maxHeight: 4.0,
        minWidth: 0.05,
        maxWidth: 0.5,
        isThin: true
      },
      door: {
        minHeight: 1.8,
        maxHeight: 2.4,
        minWidth: 0.7,
        maxWidth: 1.5,
        minYOffset: 0, // sits on floor
        maxYOffset: 0.1
      },
      window: {
        minHeight: 0.8,
        maxHeight: 1.8,
        minWidth: 0.6,
        maxWidth: 3.0,
        minYOffset: 0.7, // starts above floor
        maxYOffset: 1.2
      }
    };
    
    this.debug = true;
  }

  classifyScene(scene, bounds = null) {
    console.log("%c========== GEOMETRIC OBJECT CLASSIFICATION ==========", "color: magenta; font-weight: bold");
    
    // Clear previous classifications
    this.reset();
    
    // First pass: Identify floors and ceilings (reference planes)
    this.identifyHorizontalSurfaces(scene);
    
    // Second pass: Analyze all meshes
    scene.traverse((object) => {
      if (object.isMesh || object.isGroup) {
        this.classifyObject(object);
      }
    });
    
    // Third pass: Validate and resolve conflicts
    this.validateClassifications();
    
    // Print summary
    this.printSummary();
    
    return {
      walls: this.walls,
      doors: this.doors,
      windows: this.windows,
      furniture: this.furniture,
      floors: this.floorObjects,
      ceilings: this.ceilingObjects
    };
  }

  reset() {
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.furniture = [];
    this.floorObjects = [];
    this.ceilingObjects = [];
    this.unknown = [];
  }

  identifyHorizontalSurfaces(scene) {
    scene.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      
      const bounds = this.getMeshBounds(object);
      if (!bounds) return;
      
      const dimensions = this.getMeshDimensions(object);
      
      // Check if it's a horizontal surface (floor or ceiling)
      // by checking if it's thin in Y direction and large in X/Z
      const isHorizontal = dimensions.height < 0.5 && 
                          dimensions.width > 1.0 && 
                          dimensions.depth > 1.0;
      
      if (isHorizontal) {
        const yPosition = object.position.y;
        const isNearGround = yPosition < 0.5;
        
        if (isNearGround) {
          this.floorObjects.push(object);
          object.userData.type = 'floor';
          object.userData.isFloor = true;
          console.log(`  📋 Floor detected at y=${yPosition.toFixed(2)}`);
        } else if (yPosition > 2.0) {
          this.ceilingObjects.push(object);
          object.userData.type = 'ceiling';
          object.userData.isCeiling = true;
          console.log(`  📋 Ceiling detected at y=${yPosition.toFixed(2)}`);
        }
      }
    });
  }

  classifyObject(object) {
    // If already has explicit userData, respect it
    if (object.userData) {
      if (object.userData.isWall) {
        this.walls.push(object);
        return;
      }
      if (object.userData.isDoor) {
        this.doors.push(object);
        return;
      }
      if (object.userData.isWindow) {
        this.windows.push(object);
        return;
      }
      if (object.userData.isFurniture) {
        this.furniture.push(object);
        return;
      }
    }
    
    // Get geometric properties
    const bounds = this.getMeshBounds(object);
    if (!bounds) return;
    
    const dimensions = this.getMeshDimensions(object);
    const volume = dimensions.width * dimensions.height * dimensions.depth;
    
    // Skip very small objects
    if (volume < 0.01) return;
    
    // Check if it's a wall
    if (this.isWall(object, bounds, dimensions)) {
      this.walls.push(object);
      object.userData.isWall = true;
      object.userData.type = 'wall';
      object.userData.classifiedBy = 'geometry';
      return;
    }
    
    // Check if it's a door
    if (this.isDoor(object, bounds, dimensions)) {
      this.doors.push(object);
      object.userData.isDoor = true;
      object.userData.type = 'door';
      object.userData.classifiedBy = 'geometry';
      return;
    }
    
    // Check if it's a window
    if (this.isWindow(object, bounds, dimensions)) {
      this.windows.push(object);
      object.userData.isWindow = true;
      object.userData.type = 'window';
      object.userData.classifiedBy = 'geometry';
      return;
    }
    
    // Check if it's furniture
    if (this.isFurniture(object, bounds, dimensions, volume)) {
      this.furniture.push(object);
      object.userData.isFurniture = true;
      object.userData.furnitureType = this.guessFurnitureType(dimensions);
      object.userData.classifiedBy = 'geometry';
      return;
    }
    
    // Unknown object
    this.unknown.push(object);
    object.userData.type = 'unknown';
    if (this.debug) {
      console.log(`  ❓ Unknown object at (${object.position.x.toFixed(2)}, ${object.position.y.toFixed(2)}, ${object.position.z.toFixed(2)}) - W:${dimensions.width.toFixed(2)} H:${dimensions.height.toFixed(2)} D:${dimensions.depth.toFixed(2)}`);
    }
  }

  getMeshBounds(object) {
    if (object.isGroup) {
      return this.getGroupBounds(object);
    }
    
    if (!object.geometry) return null;
    
    // Compute bounding box
    const box = new THREE.Box3().setFromObject(object);
    return {
      min: box.min.clone(),
      max: box.max.clone(),
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3())
    };
  }

  getMeshDimensions(object) {
    const bounds = this.getMeshBounds(object);
    if (!bounds) {
      return { width: 0, height: 0, depth: 0 };
    }
    
    // Get rotation
    const rotation = object.rotation || { x: 0, y: 0, z: 0 };
    
    return {
      width: bounds.size.x,
      height: bounds.size.y,
      depth: bounds.size.z,
      rotationX: rotation.x,
      rotationY: rotation.y,
      rotationZ: rotation.z,
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minY: bounds.min.y,
      maxY: bounds.max.y,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
      centerX: bounds.center.x,
      centerY: bounds.center.y,
      centerZ: bounds.center.z
    };
  }

  isWall(object, bounds, dims) {
    // Walls are typically:
    // 1. Tall (near ceiling height)
    // 2. Thin in one dimension
    // 3. Vertical orientation
    
    const isVertical = Math.abs(dims.rotationX) < 0.1 && Math.abs(dims.rotationZ) < 0.1;
    const isTallEnough = dims.height >= this.dimensions.wall.minHeight;
    const isThin = Math.min(dims.width, dims.depth) <= this.dimensions.wall.maxWidth;
    
    // Check if it's a wall
    const isWall = isVertical && isTallEnough && isThin;
    
    if (isWall && this.debug) {
      console.log(`  🧱 Wall detected at (${dims.centerX.toFixed(2)}, ${dims.centerY.toFixed(2)}, ${dims.centerZ.toFixed(2)})`);
    }
    
    return isWall;
  }

  isDoor(object, bounds, dims) {
    // Doors are:
    // 1. Human-sized (height ~2m, width ~1m)
    // 2. Sit on floor (minY near ground)
    
    const isHumanSized = 
      dims.height >= this.dimensions.door.minHeight &&
      dims.height <= this.dimensions.door.maxHeight &&
      dims.width >= this.dimensions.door.minWidth &&
      dims.width <= this.dimensions.door.maxWidth;
    
    const sitsOnFloor = Math.abs(dims.minY) <= this.dimensions.door.maxYOffset;
    const isVertical = Math.abs(dims.rotationX) < 0.1 && Math.abs(dims.rotationZ) < 0.1;
    
    // Check if it's a door
    const isDoor = isHumanSized && sitsOnFloor && isVertical;
    
    if (isDoor && this.debug) {
      console.log(`  🚪 Door detected at (${dims.centerX.toFixed(2)}, ${dims.centerZ.toFixed(2)})`);
    }
    
    return isDoor;
  }

  isWindow(object, bounds, dims) {
    // Windows are:
    // 1. Raised off floor (minY > 0.7m)
    // 2. Height typically 1-1.5m
    // 3. Often wider than doors
    
    const isRaised = 
      dims.minY >= this.dimensions.window.minYOffset &&
      dims.minY <= this.dimensions.window.maxYOffset;
    
    const isWindowSized = 
      dims.height >= this.dimensions.window.minHeight &&
      dims.height <= this.dimensions.window.maxHeight &&
      dims.width >= this.dimensions.window.minWidth;
    
    const isWindow = isRaised && isWindowSized;
    
    if (isWindow && this.debug) {
      console.log(`  🪟 Window detected at (${dims.centerX.toFixed(2)}, ${dims.centerZ.toFixed(2)}) - raised ${dims.minY.toFixed(2)}m`);
    }
    
    return isWindow;
  }

  isFurniture(object, bounds, dims, volume) {
    // Furniture is everything else that sits on floor but isn't a wall/door/window
    
    const sitsOnFloor = Math.abs(dims.minY) < 0.3;
    const isNotTiny = volume > 0.1; // Larger than 0.1 cubic meters
    const isNotWall = !this.isWall(object, bounds, dims);
    const isNotDoor = !this.isDoor(object, bounds, dims);
    const isNotWindow = !this.isWindow(object, bounds, dims);
    
    return sitsOnFloor && isNotTiny && isNotWall && isNotDoor && isNotWindow;
  }

  guessFurnitureType(dims) {
    // Guess furniture type based on dimensions
    if (dims.height < 0.5 && dims.width > 1.0) return 'table';
    if (dims.height > 0.8 && dims.height < 1.2 && dims.width < 1.0) return 'chair';
    if (dims.height > 1.5 && dims.width > 1.5) return 'cabinet';
    if (dims.height > 1.8 && dims.width < 1.0) return 'wardrobe';
    return 'other';
  }

  getGroupBounds(group) {
    const box = new THREE.Box3().setFromObject(group);
    return {
      min: box.min.clone(),
      max: box.max.clone(),
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3())
    };
  }

  validateClassifications() {
    console.log("%c========== VALIDATING CLASSIFICATIONS ==========", "color: yellow");
    
    // Check for doors that might be misclassified
    this.doors.forEach(door => {
      const dims = this.getMeshDimensions(door);
      if (dims.width > 2.0) {
        console.log(`  ⚠️ Door at (${dims.centerX.toFixed(2)}, ${dims.centerZ.toFixed(2)}) unusually wide - might be archway?`);
      }
    });
    
    // Check for windows that might be misclassified
    this.windows.forEach(window => {
      const dims = this.getMeshDimensions(window);
      if (dims.height > 2.0) {
        console.log(`  ⚠️ Window at (${dims.centerX.toFixed(2)}, ${dims.centerZ.toFixed(2)}) unusually tall - might be glass door?`);
      }
    });
  }

  printSummary() {
    console.log("%c========== CLASSIFICATION SUMMARY ==========", "color: magenta; font-weight: bold");
    console.log(`  🧱 Walls: ${this.walls.length}`);
    console.log(`  🚪 Doors: ${this.doors.length}`);
    console.log(`  🪟 Windows: ${this.windows.length}`);
    console.log(`  🪑 Furniture: ${this.furniture.length}`);
    console.log(`  📋 Floors: ${this.floorObjects.length}`);
    console.log(`  ⬆️ Ceilings: ${this.ceilingObjects.length}`);
    console.log(`  ❓ Unknown: ${this.unknown.length}`);
  }
}