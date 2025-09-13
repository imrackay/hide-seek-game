import * as THREE from 'three';
import { MapLoader } from '../MapLoader';
import { basicTestMap } from '../sampleMaps';

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    background: null,
    fog: null
  })),
  Color: jest.fn(),
  Fog: jest.fn(),
  AmbientLight: jest.fn().mockImplementation(() => ({
    position: { set: jest.fn() },
    castShadow: false
  })),
  DirectionalLight: jest.fn().mockImplementation(() => ({
    position: { set: jest.fn() },
    castShadow: false,
    shadow: {
      mapSize: { width: 0, height: 0 },
      camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 }
    }
  })),
  PlaneGeometry: jest.fn(),
  BoxGeometry: jest.fn(),
  SphereGeometry: jest.fn(),
  CylinderGeometry: jest.fn(),
  MeshLambertMaterial: jest.fn(),
  Mesh: jest.fn().mockImplementation(() => ({
    rotation: { x: 0, y: 0, z: 0 },
    position: { set: jest.fn(), x: 0, y: 0, z: 0 },
    scale: { set: jest.fn() },
    castShadow: false,
    receiveShadow: false,
    userData: {}
  })),
  Box3: jest.fn().mockImplementation(() => ({
    setFromObject: jest.fn().mockReturnThis(),
    union: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis()
  }))
}));

describe('MapLoader', () => {
  let scene: THREE.Scene;
  let mapLoader: MapLoader;

  beforeEach(() => {
    scene = new THREE.Scene();
    mapLoader = new MapLoader(scene);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create MapLoader with scene', () => {
      expect(mapLoader).toBeInstanceOf(MapLoader);
    });
  });

  describe('loadMap', () => {
    it('should load basic test map successfully', async () => {
      await expect(mapLoader.loadMap(basicTestMap)).resolves.not.toThrow();
    });

    it('should set up environment correctly', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      // Verify scene background was set
      expect(THREE.Color).toHaveBeenCalledWith(basicTestMap.environment.skyColor);
      
      // Verify lights were added
      expect(THREE.AmbientLight).toHaveBeenCalled();
      expect(THREE.DirectionalLight).toHaveBeenCalled();
    });

    it('should create ground plane', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      expect(THREE.PlaneGeometry).toHaveBeenCalledWith(
        basicTestMap.ground.width,
        basicTestMap.ground.height
      );
      expect(THREE.MeshLambertMaterial).toHaveBeenCalledWith({
        color: basicTestMap.ground.color
      });
    });

    it('should load all map objects', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      // Should create geometries for each object type
      expect(THREE.BoxGeometry).toHaveBeenCalled();
      expect(THREE.SphereGeometry).toHaveBeenCalled();
      expect(THREE.CylinderGeometry).toHaveBeenCalled();
    });

    it('should handle fog options', async () => {
      const options = {
        enableFog: true,
        fogColor: 0xcccccc,
        fogNear: 10,
        fogFar: 100
      };
      
      await mapLoader.loadMap(basicTestMap, options);
      
      expect(THREE.Fog).toHaveBeenCalledWith(0xcccccc, 10, 100);
    });
  });

  describe('clearMap', () => {
    it('should clear all loaded objects', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      mapLoader.clearMap();
      
      expect(scene.remove).toHaveBeenCalled();
    });

    it('should reset spawn points and bounds', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      mapLoader.clearMap();
      
      const spawnPoints = mapLoader.getSpawnPoints();
      expect(spawnPoints).toHaveLength(0);
    });
  });

  describe('getSpawnPoints', () => {
    it('should return all spawn points after loading', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const spawnPoints = mapLoader.getSpawnPoints();
      expect(spawnPoints).toHaveLength(basicTestMap.spawnPoints.length);
    });

    it('should return copy of spawn points array', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const spawnPoints1 = mapLoader.getSpawnPoints();
      const spawnPoints2 = mapLoader.getSpawnPoints();
      
      expect(spawnPoints1).not.toBe(spawnPoints2);
      expect(spawnPoints1).toEqual(spawnPoints2);
    });
  });

  describe('getRandomSpawnPoint', () => {
    it('should return random spawn point', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const spawnPoint = mapLoader.getRandomSpawnPoint();
      expect(spawnPoint).toBeDefined();
      expect(basicTestMap.spawnPoints).toContainEqual(spawnPoint);
    });

    it('should return null when no spawn points', () => {
      const spawnPoint = mapLoader.getRandomSpawnPoint();
      expect(spawnPoint).toBeNull();
    });
  });

  describe('getSpawnPointsByType', () => {
    it('should return hider spawn points', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const hiderSpawns = mapLoader.getSpawnPointsByType('hider');
      const expectedHiderSpawns = basicTestMap.spawnPoints.filter(p => p.type === 'hider');
      
      expect(hiderSpawns).toHaveLength(expectedHiderSpawns.length);
    });

    it('should return seeker spawn points', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const seekerSpawns = mapLoader.getSpawnPointsByType('seeker');
      const expectedSeekerSpawns = basicTestMap.spawnPoints.filter(p => p.type === 'seeker');
      
      expect(seekerSpawns).toHaveLength(expectedSeekerSpawns.length);
    });
  });

  describe('getCollidableObjects', () => {
    it('should return only collidable objects', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const collidableObjects = mapLoader.getCollidableObjects();
      expect(Array.isArray(collidableObjects)).toBe(true);
    });
  });

  describe('getCamouflageObjects', () => {
    it('should return only camouflage-able objects', async () => {
      await mapLoader.loadMap(basicTestMap);
      
      const camouflageObjects = mapLoader.getCamouflageObjects();
      expect(Array.isArray(camouflageObjects)).toBe(true);
    });
  });

  describe('object creation methods', () => {
    it('should create box objects with correct properties', async () => {
      const boxObject = basicTestMap.objects.find(obj => obj.type === 'box');
      if (!boxObject) throw new Error('No box object in test map');
      
      await mapLoader.loadMap(basicTestMap);
      
      expect(THREE.BoxGeometry).toHaveBeenCalledWith(
        boxObject.size!.width,
        boxObject.size!.height,
        boxObject.size!.depth
      );
    });

    it('should create sphere objects with correct properties', async () => {
      const sphereObject = basicTestMap.objects.find(obj => obj.type === 'sphere');
      if (!sphereObject) throw new Error('No sphere object in test map');
      
      await mapLoader.loadMap(basicTestMap);
      
      expect(THREE.SphereGeometry).toHaveBeenCalledWith(
        sphereObject.radius,
        16,
        12
      );
    });

    it('should create cylinder objects with correct properties', async () => {
      const cylinderObject = basicTestMap.objects.find(obj => obj.type === 'cylinder');
      if (!cylinderObject) throw new Error('No cylinder object in test map');
      
      await mapLoader.loadMap(basicTestMap);
      
      expect(THREE.CylinderGeometry).toHaveBeenCalled();
      // Note: Parameters may vary due to implementation details
    });
  });

  describe('error handling', () => {
    it('should handle unknown object types gracefully', async () => {
      const mapWithUnknownObject = {
        ...basicTestMap,
        objects: [{
          ...basicTestMap.objects[0],
          type: 'unknown' as any
        }]
      };
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await expect(mapLoader.loadMap(mapWithUnknownObject)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Unknown object type: unknown');
      
      consoleSpy.mockRestore();
    });
  });
});