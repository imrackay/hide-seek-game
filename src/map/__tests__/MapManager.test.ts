import * as THREE from 'three';
import { MapManager } from '../MapManager';
import { basicTestMap } from '../sampleMaps';

// Mock the map system components
jest.mock('../MapLoader', () => ({
  MapLoader: jest.fn().mockImplementation(() => ({
    loadMap: jest.fn().mockResolvedValue(undefined),
    clearMap: jest.fn(),
    getSpawnPoints: jest.fn().mockReturnValue([]),
    getRandomSpawnPoint: jest.fn().mockReturnValue(null),
    getSpawnPointsByType: jest.fn().mockReturnValue([]),
    getMapBounds: jest.fn().mockReturnValue(new THREE.Box3()),
    getCollidableObjects: jest.fn().mockReturnValue([]),
    getCamouflageObjects: jest.fn().mockReturnValue([])
  }))
}));

jest.mock('../SpawnPointManager', () => ({
  SpawnPointManager: jest.fn().mockImplementation(() => ({
    setSpawnPoints: jest.fn(),
    getSpawnPosition: jest.fn().mockReturnValue(new THREE.Vector3()),
    releaseSpawnPosition: jest.fn().mockReturnValue(true),
    clearOccupiedPositions: jest.fn(),
    getAllSpawnPoints: jest.fn().mockReturnValue([]),
    getSpawnPointsInRadius: jest.fn().mockReturnValue([]),
    findNearestSpawnPoint: jest.fn().mockReturnValue(null),
    validateSpawnPoints: jest.fn().mockReturnValue({ valid: true, errors: [] })
  }))
}));

jest.mock('../CollisionDetector', () => ({
  CollisionDetector: jest.fn().mockImplementation(() => ({
    setCollidableObjects: jest.fn(),
    setMapBounds: jest.fn(),
    checkMovementCollision: jest.fn().mockReturnValue({ hasCollision: false }),
    isPositionValid: jest.fn().mockReturnValue(true),
    getSafeMovementPosition: jest.fn().mockReturnValue(new THREE.Vector3()),
    hasLineOfSight: jest.fn().mockReturnValue(true),
    getObjectsInRadius: jest.fn().mockReturnValue([]),
    dispose: jest.fn()
  }))
}));

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({ x, y, z })),
  Box3: jest.fn().mockImplementation(() => ({
    clone: jest.fn().mockReturnThis()
  }))
}));

describe('MapManager', () => {
  let scene: THREE.Scene;
  let mapManager: MapManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    mapManager = new MapManager(scene);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create MapManager with scene', () => {
      expect(mapManager).toBeInstanceOf(MapManager);
    });

    it('should create MapManager with custom options', () => {
      const options = {
        mapLoader: { enableShadows: true },
        spawnPointManager: { minDistanceBetweenPlayers: 5 },
        collisionDetector: { raycastDistance: 50 }
      };
      
      const manager = new MapManager(scene, options);
      expect(manager).toBeInstanceOf(MapManager);
    });
  });

  describe('loadMap', () => {
    it('should load map successfully', async () => {
      await expect(mapManager.loadMap(basicTestMap)).resolves.not.toThrow();
    });

    it('should set loaded state after successful load', async () => {
      await mapManager.loadMap(basicTestMap);
      
      expect(mapManager.isMapLoaded()).toBe(true);
      expect(mapManager.getMapName()).toBe(basicTestMap.name);
    });

    it('should handle load errors', async () => {
      // Mock MapLoader to throw error
      const mockMapLoader = mapManager['mapLoader'];
      (mockMapLoader.loadMap as jest.Mock).mockRejectedValue(new Error('Load failed'));
      
      await expect(mapManager.loadMap(basicTestMap)).rejects.toThrow('Load failed');
      expect(mapManager.isMapLoaded()).toBe(false);
    });

    it('should set up collision detection after loading', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.setCollidableObjects).toHaveBeenCalled();
      expect(mockCollisionDetector.setMapBounds).toHaveBeenCalled();
    });

    it('should set up spawn points after loading', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.setSpawnPoints).toHaveBeenCalledWith(basicTestMap.spawnPoints);
    });
  });

  describe('unloadMap', () => {
    it('should unload map and reset state', async () => {
      await mapManager.loadMap(basicTestMap);
      
      mapManager.unloadMap();
      
      expect(mapManager.isMapLoaded()).toBe(false);
      expect(mapManager.getMapName()).toBeNull();
      expect(mapManager.getCurrentMapData()).toBeNull();
    });

    it('should clear all components', async () => {
      await mapManager.loadMap(basicTestMap);
      
      mapManager.unloadMap();
      
      const mockMapLoader = mapManager['mapLoader'];
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      const mockCollisionDetector = mapManager['collisionDetector'];
      
      expect(mockMapLoader.clearMap).toHaveBeenCalled();
      expect(mockSpawnPointManager.clearOccupiedPositions).toHaveBeenCalled();
      expect(mockCollisionDetector.dispose).toHaveBeenCalled();
    });
  });

  describe('spawn point management', () => {
    beforeEach(async () => {
      await mapManager.loadMap(basicTestMap);
    });

    it('should get spawn position for player', () => {
      const position = mapManager.getSpawnPosition('player-1', 'hider');
      
      expect(position).toBeDefined();
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');
      expect(typeof position.z).toBe('number');
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.getSpawnPosition).toHaveBeenCalledWith('player-1', 'hider');
    });

    it('should return null when no map loaded', () => {
      mapManager.unloadMap();
      
      const position = mapManager.getSpawnPosition('player-1', 'hider');
      expect(position).toBeNull();
    });

    it('should release spawn position', () => {
      const result = mapManager.releaseSpawnPosition('player-1');
      
      expect(result).toBe(true);
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.releaseSpawnPosition).toHaveBeenCalledWith('player-1');
    });

    it('should get random spawn point', () => {
      const spawnPoint = mapManager.getRandomSpawnPoint();
      
      const mockMapLoader = mapManager['mapLoader'];
      expect(mockMapLoader.getRandomSpawnPoint).toHaveBeenCalled();
    });
  });

  describe('collision detection', () => {
    beforeEach(async () => {
      await mapManager.loadMap(basicTestMap);
    });

    it('should check movement collision', () => {
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const result = mapManager.checkMovementCollision(currentPos, targetPos);
      
      expect(result.hasCollision).toBe(false);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.checkMovementCollision).toHaveBeenCalledWith(currentPos, targetPos);
    });

    it('should validate position', () => {
      const position = new THREE.Vector3(0, 0, 0);
      
      const isValid = mapManager.isPositionValid(position);
      
      expect(isValid).toBe(true);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.isPositionValid).toHaveBeenCalledWith(position);
    });

    it('should get safe movement position', () => {
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      
      const safePos = mapManager.getSafeMovementPosition(currentPos, targetPos);
      
      expect(safePos).toBeDefined();
      expect(typeof safePos.x).toBe('number');
      expect(typeof safePos.y).toBe('number');
      expect(typeof safePos.z).toBe('number');
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.getSafeMovementPosition).toHaveBeenCalledWith(currentPos, targetPos);
    });

    it('should check line of sight', () => {
      const fromPos = new THREE.Vector3(0, 0, 0);
      const toPos = new THREE.Vector3(1, 0, 0);
      
      const hasLOS = mapManager.hasLineOfSight(fromPos, toPos);
      
      expect(hasLOS).toBe(true);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.hasLineOfSight).toHaveBeenCalledWith(fromPos, toPos, undefined);
    });

    it('should check line of sight with max distance', () => {
      const fromPos = new THREE.Vector3(0, 0, 0);
      const toPos = new THREE.Vector3(1, 0, 0);
      const maxDistance = 10;
      
      mapManager.hasLineOfSight(fromPos, toPos, maxDistance);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.hasLineOfSight).toHaveBeenCalledWith(fromPos, toPos, maxDistance);
    });
  });

  describe('map information', () => {
    it('should return null for map data when not loaded', () => {
      const mapData = mapManager.getCurrentMapData();
      expect(mapData).toBeNull();
    });

    it('should return map data when loaded', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const mapData = mapManager.getCurrentMapData();
      expect(mapData).toBe(basicTestMap);
    });

    it('should return null for map bounds when not loaded', () => {
      const bounds = mapManager.getMapBounds();
      expect(bounds).toBeNull();
    });

    it('should return map bounds when loaded', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const bounds = mapManager.getMapBounds();
      // Map bounds should be available after loading
      expect(bounds).toBeDefined();
    });

    it('should return empty arrays when not loaded', () => {
      const collidableObjects = mapManager.getCollidableObjects();
      const camouflageObjects = mapManager.getCamouflageObjects();
      
      expect(collidableObjects).toEqual([]);
      expect(camouflageObjects).toEqual([]);
    });

    it('should return objects when loaded', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const collidableObjects = mapManager.getCollidableObjects();
      const camouflageObjects = mapManager.getCamouflageObjects();
      
      expect(Array.isArray(collidableObjects)).toBe(true);
      expect(Array.isArray(camouflageObjects)).toBe(true);
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await mapManager.loadMap(basicTestMap);
    });

    it('should get spawn points in radius', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const radius = 10;
      
      const spawnPoints = mapManager.getSpawnPointsInRadius(center, radius);
      
      expect(Array.isArray(spawnPoints)).toBe(true);
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.getSpawnPointsInRadius).toHaveBeenCalledWith(center, radius);
    });

    it('should find nearest spawn point', () => {
      const position = new THREE.Vector3(0, 0, 0);
      
      mapManager.findNearestSpawnPoint(position);
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.findNearestSpawnPoint).toHaveBeenCalledWith(position, undefined);
    });

    it('should find nearest spawn point of specific type', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const type = 'hider';
      
      mapManager.findNearestSpawnPoint(position, type);
      
      const mockSpawnPointManager = mapManager['spawnPointManager'];
      expect(mockSpawnPointManager.findNearestSpawnPoint).toHaveBeenCalledWith(position, type);
    });

    it('should get objects in radius', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const radius = 5;
      
      const objects = mapManager.getObjectsInRadius(center, radius);
      
      expect(Array.isArray(objects)).toBe(true);
      
      const mockCollisionDetector = mapManager['collisionDetector'];
      expect(mockCollisionDetector.getObjectsInRadius).toHaveBeenCalledWith(center, radius);
    });
  });

  describe('validation', () => {
    it('should return invalid when no map loaded', () => {
      const validation = mapManager.validateCurrentMap();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No map loaded');
    });

    it('should validate loaded map', async () => {
      await mapManager.loadMap(basicTestMap);
      
      const validation = mapManager.validateCurrentMap();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing ground', async () => {
      const mapWithoutGround = { ...basicTestMap, ground: null as any };
      await mapManager.loadMap(mapWithoutGround);
      
      const validation = mapManager.validateCurrentMap();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Map has no ground defined');
    });

    it('should detect no objects', async () => {
      const mapWithoutObjects = { ...basicTestMap, objects: [] };
      await mapManager.loadMap(mapWithoutObjects);
      
      const validation = mapManager.validateCurrentMap();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Map has no objects defined');
    });
  });

  describe('dispose', () => {
    it('should dispose all resources', async () => {
      await mapManager.loadMap(basicTestMap);
      
      mapManager.dispose();
      
      expect(mapManager.isMapLoaded()).toBe(false);
    });
  });
});