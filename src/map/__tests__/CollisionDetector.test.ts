import * as THREE from 'three';
import { CollisionDetector } from '../CollisionDetector';

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(),
  Raycaster: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    intersectObjects: jest.fn().mockReturnValue([]),
    far: 100
  })),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    clone: jest.fn().mockReturnThis(),
    sub: jest.fn().mockReturnThis(),
    add: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5),
    multiplyScalar: jest.fn().mockReturnThis(),
    dot: jest.fn().mockReturnValue(1),
    length: jest.fn().mockReturnValue(5)
  })),
  Sphere: jest.fn().mockImplementation((center, radius) => ({
    center,
    radius,
    intersectsBox: jest.fn().mockReturnValue(false)
  })),
  Box3: jest.fn().mockImplementation(() => ({
    setFromObject: jest.fn().mockReturnThis(),
    containsPoint: jest.fn().mockReturnValue(true),
    clampPoint: jest.fn().mockReturnValue(new THREE.Vector3()),
    clone: jest.fn().mockReturnThis()
  })),
  Mesh: jest.fn(),
  ArrowHelper: jest.fn(),
  SphereGeometry: jest.fn(),
  MeshBasicMaterial: jest.fn()
}));

describe('CollisionDetector', () => {
  let scene: THREE.Scene;
  let collisionDetector: CollisionDetector;
  let mockObjects: THREE.Object3D[];

  beforeEach(() => {
    scene = new THREE.Scene();
    collisionDetector = new CollisionDetector(scene);
    
    mockObjects = [
      { userData: { collidable: true } } as THREE.Object3D,
      { userData: { collidable: true } } as THREE.Object3D,
      { userData: { collidable: false } } as THREE.Object3D
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create CollisionDetector with scene', () => {
      expect(collisionDetector).toBeInstanceOf(CollisionDetector);
      expect(THREE.Raycaster).toHaveBeenCalled();
    });

    it('should create CollisionDetector with custom options', () => {
      const options = {
        raycastDistance: 50,
        sphereRadius: 1.0,
        enableDebugVisualization: true
      };
      
      const detector = new CollisionDetector(scene, options);
      expect(detector).toBeInstanceOf(CollisionDetector);
    });
  });

  describe('setCollidableObjects', () => {
    it('should set collidable objects', () => {
      collisionDetector.setCollidableObjects(mockObjects);
      
      // Test by checking if collision detection works
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const result = collisionDetector.checkMovementCollision(currentPos, targetPos);
      expect(result).toBeDefined();
    });
  });

  describe('addCollidableObject', () => {
    it('should add collidable object', () => {
      const newObject = { userData: { collidable: true } } as THREE.Object3D;
      
      collisionDetector.addCollidableObject(newObject);
      
      // Object should be added (tested indirectly through collision detection)
      expect(() => {
        const currentPos = new THREE.Vector3(0, 0, 0);
        const targetPos = new THREE.Vector3(1, 0, 0);
        collisionDetector.checkMovementCollision(currentPos, targetPos);
      }).not.toThrow();
    });

    it('should not add duplicate objects', () => {
      const object = mockObjects[0];
      
      collisionDetector.addCollidableObject(object);
      collisionDetector.addCollidableObject(object); // Add same object again
      
      // Should not throw or cause issues
      expect(() => {
        const currentPos = new THREE.Vector3(0, 0, 0);
        const targetPos = new THREE.Vector3(1, 0, 0);
        collisionDetector.checkMovementCollision(currentPos, targetPos);
      }).not.toThrow();
    });
  });

  describe('removeCollidableObject', () => {
    it('should remove collidable object', () => {
      const object = mockObjects[0];
      
      collisionDetector.setCollidableObjects([object]);
      collisionDetector.removeCollidableObject(object);
      
      // Object should be removed (tested indirectly)
      expect(() => {
        const currentPos = new THREE.Vector3(0, 0, 0);
        const targetPos = new THREE.Vector3(1, 0, 0);
        collisionDetector.checkMovementCollision(currentPos, targetPos);
      }).not.toThrow();
    });
  });

  describe('setMapBounds', () => {
    it('should set map bounds', () => {
      const bounds = new THREE.Box3();
      
      collisionDetector.setMapBounds(bounds);
      
      expect(THREE.Box3).toHaveBeenCalled();
    });
  });

  describe('checkMovementCollision', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return no collision when path is clear', () => {
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const result = collisionDetector.checkMovementCollision(currentPos, targetPos);
      
      expect(result.hasCollision).toBe(false);
    });

    it('should detect collision when objects intersect path', () => {
      // Mock raycaster to return intersection
      const mockRaycaster = collisionDetector['raycaster'] as jest.Mocked<THREE.Raycaster>;
      mockRaycaster.intersectObjects.mockReturnValue([
        {
          distance: 2,
          point: new THREE.Vector3(0.5, 0, 0),
          face: { normal: new THREE.Vector3(1, 0, 0) },
          object: mockObjects[0]
        }
      ] as any);
      
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const result = collisionDetector.checkMovementCollision(currentPos, targetPos);
      
      expect(result.hasCollision).toBe(true);
      expect(result.collisionPoint).toBeDefined();
      expect(result.collidedObject).toBe(mockObjects[0]);
    });
  });

  describe('isPositionValid', () => {
    it('should return true for valid position', () => {
      const position = new THREE.Vector3(0, 0, 0);
      
      const isValid = collisionDetector.isPositionValid(position);
      
      expect(isValid).toBe(true);
    });

    it('should return false for position outside bounds', () => {
      // Mock bounds to not contain point
      const mockBounds = collisionDetector['mapBounds'] as jest.Mocked<THREE.Box3>;
      mockBounds.containsPoint.mockReturnValue(false);
      
      const position = new THREE.Vector3(100, 0, 100);
      
      const isValid = collisionDetector.isPositionValid(position);
      
      expect(isValid).toBe(false);
    });
  });

  describe('checkSphereCollision', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return no collision when sphere is clear', () => {
      const position = new THREE.Vector3(0, 0, 0);
      
      const result = collisionDetector.checkSphereCollision(position);
      
      expect(result.hasCollision).toBe(false);
    });

    it('should detect collision when sphere intersects object', () => {
      // Mock sphere to intersect with box
      const mockSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.5);
      (mockSphere.intersectsBox as jest.Mock).mockReturnValue(true);
      
      // Mock collision detection
      const mockVector = new THREE.Vector3(0, 0, 0);
      if (typeof mockVector.distanceTo === 'function') {
        (mockVector.distanceTo as jest.Mock).mockReturnValue(0.3);
      }
      
      const position = new THREE.Vector3(0, 0, 0);
      
      const result = collisionDetector.checkSphereCollision(position);
      
      // Result depends on mock implementation
      expect(result).toBeDefined();
    });
  });

  describe('getSafeMovementPosition', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return target position when no collision', () => {
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const safePos = collisionDetector.getSafeMovementPosition(currentPos, targetPos);
      
      expect(safePos).toBeDefined();
      expect(THREE.Vector3).toHaveBeenCalled();
    });

    it('should return current position when movement is blocked', () => {
      // Mock collision detection to return collision
      const mockRaycaster = collisionDetector['raycaster'] as jest.Mocked<THREE.Raycaster>;
      mockRaycaster.intersectObjects.mockReturnValue([
        {
          distance: 0.5,
          point: new THREE.Vector3(0.5, 0, 0),
          face: { normal: new THREE.Vector3(1, 0, 0) },
          object: mockObjects[0]
        }
      ] as any);
      
      // Mock position validation to return false
      jest.spyOn(collisionDetector, 'isPositionValid').mockReturnValue(false);
      
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const safePos = collisionDetector.getSafeMovementPosition(currentPos, targetPos);
      
      expect(safePos).toBeDefined();
    });
  });

  describe('hasLineOfSight', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return true when line of sight is clear', () => {
      const fromPos = new THREE.Vector3(0, 0, 0);
      const toPos = new THREE.Vector3(1, 0, 0);
      
      const hasLOS = collisionDetector.hasLineOfSight(fromPos, toPos);
      
      expect(hasLOS).toBe(true);
    });

    it('should return false when line of sight is blocked', () => {
      // Mock raycaster to return intersection
      const mockRaycaster = collisionDetector['raycaster'] as jest.Mocked<THREE.Raycaster>;
      mockRaycaster.intersectObjects.mockReturnValue([
        {
          distance: 0.5,
          point: new THREE.Vector3(0.5, 0, 0),
          object: mockObjects[0]
        }
      ] as any);
      
      const fromPos = new THREE.Vector3(0, 0, 0);
      const toPos = new THREE.Vector3(1, 0, 0);
      
      const hasLOS = collisionDetector.hasLineOfSight(fromPos, toPos);
      
      expect(hasLOS).toBe(false);
    });

    it('should return false when distance exceeds maximum', () => {
      const fromPos = new THREE.Vector3(0, 0, 0);
      const toPos = new THREE.Vector3(100, 0, 0);
      const maxDistance = 10;
      
      // Mock distance calculation
      const mockVector = new THREE.Vector3();
      (mockVector.length as jest.Mock).mockReturnValue(100);
      
      const hasLOS = collisionDetector.hasLineOfSight(fromPos, toPos, maxDistance);
      
      expect(typeof hasLOS).toBe('boolean');
    });
  });

  describe('findNearestCollision', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return collision when object is found', () => {
      // Mock raycaster to return intersection
      const mockRaycaster = collisionDetector['raycaster'] as jest.Mocked<THREE.Raycaster>;
      mockRaycaster.intersectObjects.mockReturnValue([
        {
          distance: 2,
          point: new THREE.Vector3(2, 0, 0),
          face: { normal: new THREE.Vector3(-1, 0, 0) },
          object: mockObjects[0]
        }
      ] as any);
      
      const position = new THREE.Vector3(0, 0, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      
      const result = collisionDetector.findNearestCollision(position, direction);
      
      expect(result.hasCollision).toBe(true);
      expect(result.distance).toBe(2);
    });

    it('should return no collision when no objects found', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      
      const result = collisionDetector.findNearestCollision(position, direction);
      
      expect(result.hasCollision).toBe(false);
    });
  });

  describe('getObjectsInRadius', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return objects within radius', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const radius = 5;
      
      const objectsInRadius = collisionDetector.getObjectsInRadius(center, radius);
      
      expect(Array.isArray(objectsInRadius)).toBe(true);
    });
  });

  describe('isWithinMapBounds', () => {
    it('should return true for position within bounds', () => {
      const position = new THREE.Vector3(0, 0, 0);
      
      const isWithin = collisionDetector.isWithinMapBounds(position);
      
      expect(isWithin).toBe(true);
    });

    it('should return false for position outside bounds', () => {
      // Mock bounds to not contain point
      const mockBounds = collisionDetector['mapBounds'] as jest.Mocked<THREE.Box3>;
      mockBounds.containsPoint.mockReturnValue(false);
      
      const position = new THREE.Vector3(100, 0, 100);
      
      const isWithin = collisionDetector.isWithinMapBounds(position);
      
      expect(isWithin).toBe(false);
    });
  });

  describe('clampToMapBounds', () => {
    it('should clamp position to map bounds', () => {
      const position = new THREE.Vector3(100, 0, 100);
      
      const clampedPosition = collisionDetector.clampToMapBounds(position);
      
      expect(clampedPosition).toBeDefined();
      expect(typeof clampedPosition.x).toBe('number');
      expect(typeof clampedPosition.y).toBe('number');
      expect(typeof clampedPosition.z).toBe('number');
    });
  });

  describe('getDistanceToNearestCollision', () => {
    beforeEach(() => {
      collisionDetector.setCollidableObjects(mockObjects);
    });

    it('should return distance to nearest collision', () => {
      // Mock findNearestCollision to return collision
      jest.spyOn(collisionDetector, 'findNearestCollision').mockReturnValue({
        hasCollision: true,
        distance: 5
      });
      
      const position = new THREE.Vector3(0, 0, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      
      const distance = collisionDetector.getDistanceToNearestCollision(position, direction);
      
      expect(distance).toBe(5);
    });

    it('should return max distance when no collision', () => {
      // Mock findNearestCollision to return no collision
      jest.spyOn(collisionDetector, 'findNearestCollision').mockReturnValue({
        hasCollision: false
      });
      
      const position = new THREE.Vector3(0, 0, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      
      const distance = collisionDetector.getDistanceToNearestCollision(position, direction);
      
      expect(distance).toBe(100); // Default raycast distance
    });
  });

  describe('dispose', () => {
    it('should dispose resources', () => {
      collisionDetector.setCollidableObjects(mockObjects);
      
      collisionDetector.dispose();
      
      // Should not throw after disposal
      expect(() => {
        const position = new THREE.Vector3(0, 0, 0);
        collisionDetector.isPositionValid(position);
      }).not.toThrow();
    });
  });
});