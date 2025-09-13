import * as THREE from 'three';
import { SpawnPointManager } from '../SpawnPointManager';
import { SpawnPoint } from '../../types';

// Mock Three.js Vector3
jest.mock('three', () => ({
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    set: jest.fn(),
    add: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5)
  }))
}));

describe('SpawnPointManager', () => {
  let spawnPointManager: SpawnPointManager;
  let mockSpawnPoints: SpawnPoint[];

  beforeEach(() => {
    spawnPointManager = new SpawnPointManager();
    
    mockSpawnPoints = [
      {
        id: 'hider-1',
        position: { x: 0, y: 0, z: 0 },
        type: 'hider',
        priority: 1,
        name: 'Hider Spawn 1'
      },
      {
        id: 'hider-2',
        position: { x: 10, y: 0, z: 0 },
        type: 'hider',
        priority: 1,
        name: 'Hider Spawn 2'
      },
      {
        id: 'seeker-1',
        position: { x: 0, y: 0, z: 10 },
        type: 'seeker',
        priority: 1,
        name: 'Seeker Spawn 1'
      },
      {
        id: 'any-1',
        position: { x: 5, y: 0, z: 5 },
        type: 'any',
        priority: 2,
        name: 'Any Spawn 1'
      }
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create SpawnPointManager with default options', () => {
      expect(spawnPointManager).toBeInstanceOf(SpawnPointManager);
    });

    it('should create SpawnPointManager with custom options', () => {
      const options = {
        minDistanceBetweenPlayers: 5,
        maxSpawnAttempts: 15,
        preferredSpawnRadius: 2
      };
      
      const manager = new SpawnPointManager(options);
      expect(manager).toBeInstanceOf(SpawnPointManager);
    });
  });

  describe('setSpawnPoints', () => {
    it('should set spawn points', () => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
      
      const allSpawnPoints = spawnPointManager.getAllSpawnPoints();
      expect(allSpawnPoints).toHaveLength(mockSpawnPoints.length);
    });

    it('should create copy of spawn points array', () => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
      
      const allSpawnPoints = spawnPointManager.getAllSpawnPoints();
      expect(allSpawnPoints).not.toBe(mockSpawnPoints);
      expect(allSpawnPoints).toEqual(mockSpawnPoints);
    });
  });

  describe('addSpawnPoint', () => {
    it('should add spawn point', () => {
      const newSpawnPoint: SpawnPoint = {
        id: 'new-spawn',
        position: { x: 15, y: 0, z: 15 },
        type: 'hider',
        priority: 1,
        name: 'New Spawn'
      };
      
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
      spawnPointManager.addSpawnPoint(newSpawnPoint);
      
      const allSpawnPoints = spawnPointManager.getAllSpawnPoints();
      expect(allSpawnPoints).toHaveLength(mockSpawnPoints.length + 1);
      expect(allSpawnPoints).toContainEqual(newSpawnPoint);
    });
  });

  describe('removeSpawnPoint', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should remove existing spawn point', () => {
      const result = spawnPointManager.removeSpawnPoint('hider-1');
      
      expect(result).toBe(true);
      
      const allSpawnPoints = spawnPointManager.getAllSpawnPoints();
      expect(allSpawnPoints).toHaveLength(mockSpawnPoints.length - 1);
      expect(allSpawnPoints.find(p => p.id === 'hider-1')).toBeUndefined();
    });

    it('should return false for non-existing spawn point', () => {
      const result = spawnPointManager.removeSpawnPoint('non-existing');
      
      expect(result).toBe(false);
      
      const allSpawnPoints = spawnPointManager.getAllSpawnPoints();
      expect(allSpawnPoints).toHaveLength(mockSpawnPoints.length);
    });
  });

  describe('getSpawnPosition', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should return spawn position for hider', () => {
      const position = spawnPointManager.getSpawnPosition('player-1', 'hider');
      
      expect(position).toBeDefined();
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');
      expect(typeof position.z).toBe('number');
    });

    it('should return spawn position for seeker', () => {
      const position = spawnPointManager.getSpawnPosition('player-1', 'seeker');
      
      expect(position).toBeDefined();
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');
      expect(typeof position.z).toBe('number');
    });

    it('should return null when no spawn points available for type', () => {
      spawnPointManager.setSpawnPoints([]);
      
      const position = spawnPointManager.getSpawnPosition('player-1', 'hider');
      expect(position).toBeNull();
    });

    it('should consider "any" type spawn points for both hider and seeker', () => {
      const anyOnlySpawnPoints = [mockSpawnPoints[3]]; // only "any" type
      spawnPointManager.setSpawnPoints(anyOnlySpawnPoints);
      
      const hiderPosition = spawnPointManager.getSpawnPosition('player-1', 'hider');
      const seekerPosition = spawnPointManager.getSpawnPosition('player-2', 'seeker');
      
      expect(hiderPosition).not.toBeNull();
      expect(seekerPosition).not.toBeNull();
    });
  });

  describe('releaseSpawnPosition', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should release occupied spawn position', () => {
      // First occupy a position
      spawnPointManager.getSpawnPosition('player-1', 'hider');
      
      const result = spawnPointManager.releaseSpawnPosition('player-1');
      expect(result).toBe(true);
    });

    it('should return false for non-occupied position', () => {
      const result = spawnPointManager.releaseSpawnPosition('non-existing-player');
      expect(result).toBe(false);
    });
  });

  describe('getOccupiedPositions', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should return map of occupied positions', () => {
      spawnPointManager.getSpawnPosition('player-1', 'hider');
      spawnPointManager.getSpawnPosition('player-2', 'seeker');
      
      const occupiedPositions = spawnPointManager.getOccupiedPositions();
      expect(occupiedPositions).toBeInstanceOf(Map);
      expect(occupiedPositions.size).toBe(2);
      expect(occupiedPositions.has('player-1')).toBe(true);
      expect(occupiedPositions.has('player-2')).toBe(true);
    });

    it('should return copy of occupied positions map', () => {
      spawnPointManager.getSpawnPosition('player-1', 'hider');
      
      const occupiedPositions1 = spawnPointManager.getOccupiedPositions();
      const occupiedPositions2 = spawnPointManager.getOccupiedPositions();
      
      expect(occupiedPositions1).not.toBe(occupiedPositions2);
    });
  });

  describe('clearOccupiedPositions', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should clear all occupied positions', () => {
      spawnPointManager.getSpawnPosition('player-1', 'hider');
      spawnPointManager.getSpawnPosition('player-2', 'seeker');
      
      spawnPointManager.clearOccupiedPositions();
      
      const occupiedPositions = spawnPointManager.getOccupiedPositions();
      expect(occupiedPositions.size).toBe(0);
    });
  });

  describe('getSpawnPointById', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should return spawn point by ID', () => {
      const spawnPoint = spawnPointManager.getSpawnPointById('hider-1');
      
      expect(spawnPoint).toEqual(mockSpawnPoints[0]);
    });

    it('should return null for non-existing ID', () => {
      const spawnPoint = spawnPointManager.getSpawnPointById('non-existing');
      
      expect(spawnPoint).toBeNull();
    });
  });

  describe('getSpawnPointsByType', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should return hider spawn points', () => {
      const hiderSpawns = spawnPointManager.getSpawnPointsByType('hider');
      
      expect(hiderSpawns).toHaveLength(2);
      expect(hiderSpawns.every(p => p.type === 'hider')).toBe(true);
    });

    it('should return seeker spawn points', () => {
      const seekerSpawns = spawnPointManager.getSpawnPointsByType('seeker');
      
      expect(seekerSpawns).toHaveLength(1);
      expect(seekerSpawns.every(p => p.type === 'seeker')).toBe(true);
    });

    it('should return any type spawn points', () => {
      const anySpawns = spawnPointManager.getSpawnPointsByType('any');
      
      expect(anySpawns).toHaveLength(1);
      expect(anySpawns.every(p => p.type === 'any')).toBe(true);
    });
  });

  describe('getSpawnPointsInRadius', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should return spawn points within radius', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const radius = 15;
      
      const spawnPointsInRadius = spawnPointManager.getSpawnPointsInRadius(center, radius);
      
      expect(Array.isArray(spawnPointsInRadius)).toBe(true);
    });
  });

  describe('findNearestSpawnPoint', () => {
    beforeEach(() => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
    });

    it('should find nearest spawn point', () => {
      const position = new THREE.Vector3(1, 0, 1);
      
      const nearestSpawnPoint = spawnPointManager.findNearestSpawnPoint(position);
      
      expect(nearestSpawnPoint).toBeDefined();
    });

    it('should find nearest spawn point of specific type', () => {
      const position = new THREE.Vector3(1, 0, 1);
      
      const nearestHiderSpawn = spawnPointManager.findNearestSpawnPoint(position, 'hider');
      
      expect(nearestHiderSpawn).toBeDefined();
      expect(nearestHiderSpawn!.type).toBe('hider');
    });

    it('should return null when no spawn points of type exist', () => {
      spawnPointManager.setSpawnPoints([]);
      const position = new THREE.Vector3(0, 0, 0);
      
      const nearestSpawnPoint = spawnPointManager.findNearestSpawnPoint(position, 'hider');
      
      expect(nearestSpawnPoint).toBeNull();
    });
  });

  describe('validateSpawnPoints', () => {
    it('should validate valid spawn points', () => {
      spawnPointManager.setSpawnPoints(mockSpawnPoints);
      
      const validation = spawnPointManager.validateSpawnPoints();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect no spawn points', () => {
      const validation = spawnPointManager.validateSpawnPoints();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No spawn points defined');
    });

    it('should detect duplicate IDs', () => {
      const duplicateSpawnPoints = [
        mockSpawnPoints[0],
        { ...mockSpawnPoints[1], id: mockSpawnPoints[0].id }
      ];
      
      spawnPointManager.setSpawnPoints(duplicateSpawnPoints);
      
      const validation = spawnPointManager.validateSpawnPoints();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('Duplicate spawn point ID'))).toBe(true);
    });

    it('should detect missing hider spawn points', () => {
      const seekerOnlySpawnPoints = mockSpawnPoints.filter(p => p.type === 'seeker');
      spawnPointManager.setSpawnPoints(seekerOnlySpawnPoints);
      
      const validation = spawnPointManager.validateSpawnPoints();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No spawn points available for hiders');
    });

    it('should detect missing seeker spawn points', () => {
      const hiderOnlySpawnPoints = mockSpawnPoints.filter(p => p.type === 'hider');
      spawnPointManager.setSpawnPoints(hiderOnlySpawnPoints);
      
      const validation = spawnPointManager.validateSpawnPoints();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No spawn points available for seekers');
    });
  });
});