import * as THREE from 'three';

export interface CollisionResult {
  hasCollision: boolean;
  collisionPoint?: THREE.Vector3;
  collisionNormal?: THREE.Vector3;
  collidedObject?: THREE.Object3D;
  distance?: number;
}

export interface CollisionDetectorOptions {
  raycastDistance?: number;
  sphereRadius?: number;
  enableDebugVisualization?: boolean;
}

export class CollisionDetector {
  private scene: THREE.Scene;
  private raycaster: THREE.Raycaster;
  private collidableObjects: THREE.Object3D[] = [];
  private mapBounds: THREE.Box3 = new THREE.Box3();
  private options: Required<CollisionDetectorOptions>;

  constructor(scene: THREE.Scene, options: CollisionDetectorOptions = {}) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.options = {
      raycastDistance: options.raycastDistance || 100,
      sphereRadius: options.sphereRadius || 0.5,
      enableDebugVisualization: options.enableDebugVisualization || false
    };
  }

  setCollidableObjects(objects: THREE.Object3D[]): void {
    this.collidableObjects = [...objects];
  }

  addCollidableObject(object: THREE.Object3D): void {
    if (!this.collidableObjects.includes(object)) {
      this.collidableObjects.push(object);
    }
  }

  removeCollidableObject(object: THREE.Object3D): void {
    const index = this.collidableObjects.indexOf(object);
    if (index !== -1) {
      this.collidableObjects.splice(index, 1);
    }
  }

  setMapBounds(bounds: THREE.Box3): void {
    this.mapBounds = bounds.clone();
  }

  // Check collision using raycast from current position in movement direction
  checkMovementCollision(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3
  ): CollisionResult {
    const direction = targetPosition.clone().sub(currentPosition).normalize();
    const distance = currentPosition.distanceTo(targetPosition);

    this.raycaster.set(currentPosition, direction);
    this.raycaster.far = distance + this.options.sphereRadius;

    const intersections = this.raycaster.intersectObjects(this.collidableObjects, true);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      
      // Check if collision is within movement distance
      if (intersection.distance <= distance + this.options.sphereRadius) {
        return {
          hasCollision: true,
          collisionPoint: intersection.point,
          collisionNormal: intersection.face?.normal,
          collidedObject: intersection.object,
          distance: intersection.distance
        };
      }
    }

    return { hasCollision: false };
  }

  // Check if a position is valid (no collisions and within bounds)
  isPositionValid(position: THREE.Vector3): boolean {
    // Check map bounds
    if (!this.mapBounds.containsPoint(position)) {
      return false;
    }

    // Check sphere collision at position
    return !this.checkSphereCollision(position).hasCollision;
  }

  // Check collision using sphere at specific position
  checkSphereCollision(position: THREE.Vector3): CollisionResult {
    const sphere = new THREE.Sphere(position, this.options.sphereRadius);

    for (const object of this.collidableObjects) {
      if (object instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(object);
        
        if (sphere.intersectsBox(box)) {
          // More precise collision detection
          const closestPoint = box.clampPoint(position, new THREE.Vector3());
          const distance = position.distanceTo(closestPoint);
          
          if (distance <= this.options.sphereRadius) {
            const normal = position.clone().sub(closestPoint).normalize();
            
            return {
              hasCollision: true,
              collisionPoint: closestPoint,
              collisionNormal: normal,
              collidedObject: object,
              distance
            };
          }
        }
      }
    }

    return { hasCollision: false };
  }

  // Get safe movement position (slide along collision surface)
  getSafeMovementPosition(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3
  ): THREE.Vector3 {
    const collision = this.checkMovementCollision(currentPosition, targetPosition);
    
    if (!collision.hasCollision) {
      // Check if target position is valid
      if (this.isPositionValid(targetPosition)) {
        return targetPosition;
      }
    }

    // Try sliding along collision surface
    if (collision.collisionNormal) {
      const slideDirection = this.calculateSlideDirection(
        targetPosition.clone().sub(currentPosition),
        collision.collisionNormal
      );
      
      const slideTarget = currentPosition.clone().add(slideDirection);
      
      if (this.isPositionValid(slideTarget)) {
        return slideTarget;
      }
    }

    // Fallback: return current position
    return currentPosition.clone();
  }

  private calculateSlideDirection(
    movementVector: THREE.Vector3,
    collisionNormal: THREE.Vector3
  ): THREE.Vector3 {
    // Project movement vector onto collision surface
    const normalizedNormal = collisionNormal.clone().normalize();
    const projectedMovement = movementVector.clone().sub(
      normalizedNormal.clone().multiplyScalar(
        movementVector.dot(normalizedNormal)
      )
    );
    
    return projectedMovement;
  }

  // Check line of sight between two positions
  hasLineOfSight(
    fromPosition: THREE.Vector3,
    toPosition: THREE.Vector3,
    maxDistance?: number
  ): boolean {
    const direction = toPosition.clone().sub(fromPosition);
    const distance = direction.length();
    
    if (maxDistance && distance > maxDistance) {
      return false;
    }
    
    direction.normalize();
    this.raycaster.set(fromPosition, direction);
    this.raycaster.far = distance - 0.1; // Small offset to avoid self-intersection

    const intersections = this.raycaster.intersectObjects(this.collidableObjects, true);
    return intersections.length === 0;
  }

  // Find nearest collision in direction
  findNearestCollision(
    position: THREE.Vector3,
    direction: THREE.Vector3
  ): CollisionResult {
    this.raycaster.set(position, direction.normalize());
    this.raycaster.far = this.options.raycastDistance;

    const intersections = this.raycaster.intersectObjects(this.collidableObjects, true);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      return {
        hasCollision: true,
        collisionPoint: intersection.point,
        collisionNormal: intersection.face?.normal,
        collidedObject: intersection.object,
        distance: intersection.distance
      };
    }

    return { hasCollision: false };
  }

  // Get all objects within radius
  getObjectsInRadius(
    center: THREE.Vector3,
    radius: number
  ): THREE.Object3D[] {
    const sphere = new THREE.Sphere(center, radius);
    const objectsInRadius: THREE.Object3D[] = [];

    for (const object of this.collidableObjects) {
      const box = new THREE.Box3().setFromObject(object);
      if (sphere.intersectsBox(box)) {
        objectsInRadius.push(object);
      }
    }

    return objectsInRadius;
  }

  // Check if position is within map bounds
  isWithinMapBounds(position: THREE.Vector3): boolean {
    return this.mapBounds.containsPoint(position);
  }

  // Clamp position to map bounds
  clampToMapBounds(position: THREE.Vector3): THREE.Vector3 {
    return this.mapBounds.clampPoint(position, new THREE.Vector3());
  }

  // Get distance to nearest collision in direction
  getDistanceToNearestCollision(
    position: THREE.Vector3,
    direction: THREE.Vector3
  ): number {
    const collision = this.findNearestCollision(position, direction);
    return collision.hasCollision ? collision.distance! : this.options.raycastDistance;
  }

  // Debug visualization
  visualizeCollision(collision: CollisionResult): void {
    if (!this.options.enableDebugVisualization || !collision.hasCollision) {
      return;
    }

    // Create debug sphere at collision point
    if (collision.collisionPoint) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 6);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(collision.collisionPoint);
      this.scene.add(sphere);

      // Remove after 2 seconds
      setTimeout(() => {
        this.scene.remove(sphere);
        geometry.dispose();
        material.dispose();
      }, 2000);
    }

    // Create debug arrow for collision normal
    if (collision.collisionNormal && collision.collisionPoint) {
      const arrowHelper = new THREE.ArrowHelper(
        collision.collisionNormal,
        collision.collisionPoint,
        1,
        0x00ff00
      );
      this.scene.add(arrowHelper);

      // Remove after 2 seconds
      setTimeout(() => {
        this.scene.remove(arrowHelper);
      }, 2000);
    }
  }

  dispose(): void {
    this.collidableObjects = [];
    this.mapBounds = new THREE.Box3();
  }
}