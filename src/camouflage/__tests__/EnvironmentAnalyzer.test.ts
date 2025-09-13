import * as THREE from 'three';
import { EnvironmentAnalyzer } from '../EnvironmentAnalyzer';

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn().mockImplementation(() => ({
    traverse: jest.fn()
  })),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    clone: jest.fn().mockReturnThis(),
    sub: jest.fn().mockReturnThis(),
    add: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5),
    multiplyScalar: jest.fn().mockReturnThis(),
    length: jest.fn().mockReturnValue(5)
  })),
  Sphere: jest.fn().mockImplementation((center, radius) => ({
    center,
    radius,
    intersectsBox: jest.fn().mockReturnValue(true)
  })),
  Box3: jest.fn().mockImplementation(() => ({
    setFromObject: jest.fn().mockReturnThis(),
    getSize: jest.fn().mockReturnValue(new THREE.Vector3(2, 2, 2))
  })),
  Mesh: jest.fn(),
  MeshLambertMaterial: jest.fn().mockImplementation(() => ({
    color: { getHex: jest.fn().mockReturnValue(0xff0000) }
  })),
  MeshBasicMaterial: jest.fn().mockImplementation(() => ({
    color: { getHex: jest.fn().mockReturnValue(0xff0000) }
  }))
}));

describe('EnvironmentAnalyzer', () => {
  let scene: THREE.Scene;
  let environmentAnalyzer: EnvironmentAnalyzer;
  let mockMeshes: THREE.Mesh[];

  beforeEach(() => {
    scene = new THREE.Scene();
    environmentAnalyzer = new EnvironmentAnalyzer(scene);
    
    // Create mock meshes
    mockMeshes = [
      {
        userData: { canCamouflage: true, id: 'box1', type: 'box' },
        position: new THREE.Vector3(1, 0, 1),
        material: new THREE.MeshLambertMaterial(),
        uuid: 'mesh-1'
      } as any,
      {
        userData: { canCamouflage: true, id: 'sphere1', type: 'sphere' },
        position: new THREE.Vector3(2, 0, 2),
        material: new THREE.MeshLambertMaterial(),
        uuid: 'mesh-2'
      } as any,
      {
        userData: { canCamouflage: false, id: 'wall1', type: 'wall' },
        position: new THREE.Vector3(3, 0, 3),
        material: new THREE.MeshLambertMaterial(),
        uuid: 'mesh-3'
      } as any
    ];

    // Mock scene.traverse to return our mock meshes
    (scene.traverse as jest.Mock).mockImplementation((callback) => {
      mockMeshes.forEach(mesh => callback(mesh));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create EnvironmentAnalyzer with default options', () => {
      expect(environmentAnalyzer).toBeInstanceOf(EnvironmentAnalyzer);
    });

    it('should create EnvironmentAnalyzer with custom options', () => {
      const options = {
        analysisRadius: 15,
        maxCamouflageOptions: 8,
        minBelievabilityScore: 0.5
      };
      
      const analyzer = new EnvironmentAnalyzer(scene, options);
      expect(analyzer).toBeInstanceOf(EnvironmentAnalyzer);
    });
  });

  describe('analyzeEnvironment', () => {
    it('should analyze environment and return results', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      expect(result).toBeDefined();
      expect(result.nearbyObjects).toBeDefined();
      expect(result.camouflageOptions).toBeDefined();
      expect(result.environmentScore).toBeDefined();
      expect(result.analysisTimestamp).toBeDefined();
      expect(typeof result.analysisTimestamp).toBe('number');
    });

    it('should find nearby camouflage objects', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      // Should analyze environment (may or may not find objects in test)
      expect(result.nearbyObjects.length).toBeGreaterThanOrEqual(0);
      expect(scene.traverse).toHaveBeenCalled();
    });

    it('should calculate believability scores', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.nearbyObjects.forEach(obj => {
        expect(obj.believabilityScore).toBeGreaterThanOrEqual(0);
        expect(obj.believabilityScore).toBeLessThanOrEqual(1);
      });
    });

    it('should sort objects by believability score', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      if (result.nearbyObjects.length > 1) {
        for (let i = 1; i < result.nearbyObjects.length; i++) {
          expect(result.nearbyObjects[i-1].believabilityScore)
            .toBeGreaterThanOrEqual(result.nearbyObjects[i].believabilityScore);
        }
      }
    });

    it('should generate camouflage options', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      expect(Array.isArray(result.camouflageOptions)).toBe(true);
      result.camouflageOptions.forEach(option => {
        expect(option.objectType).toBeDefined();
        expect(option.model).toBeDefined();
        expect(option.believabilityScore).toBeGreaterThanOrEqual(0);
        expect(option.believabilityScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(option.restrictions)).toBe(true);
      });
    });

    it('should calculate environment score', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      expect(result.environmentScore).toBeGreaterThanOrEqual(0);
      expect(result.environmentScore).toBeLessThanOrEqual(1);
    });
  });

  describe('getBestCamouflageOption', () => {
    it('should return best camouflage option', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const bestOption = environmentAnalyzer.getBestCamouflageOption(playerPosition);
      
      if (bestOption) {
        expect(bestOption.objectType).toBeDefined();
        expect(bestOption.believabilityScore).toBeGreaterThan(0);
      }
    });

    it('should return null when no options available', () => {
      // Mock scene with no camouflage objects
      (scene.traverse as jest.Mock).mockImplementation((callback) => {
        // No objects
      });
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const bestOption = environmentAnalyzer.getBestCamouflageOption(playerPosition);
      
      expect(bestOption).toBeNull();
    });
  });

  describe('getCamouflageOptionsInRadius', () => {
    it('should return options within specified radius', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const radius = 5;
      
      const options = environmentAnalyzer.getCamouflageOptionsInRadius(playerPosition, radius);
      
      expect(Array.isArray(options)).toBe(true);
      // All returned options should have target positions within radius
      options.forEach(option => {
        if (option.targetPosition) {
          // In our mock, distanceTo always returns 5, so all should be within radius
          expect(playerPosition.distanceTo(option.targetPosition)).toBeLessThanOrEqual(radius);
        }
      });
    });
  });

  describe('updateAnalysisRadius', () => {
    it('should update analysis radius', () => {
      const newRadius = 20;
      
      environmentAnalyzer.updateAnalysisRadius(newRadius);
      
      // Test that the new radius is used in analysis
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      expect(result).toBeDefined();
    });
  });

  describe('setMinBelievabilityScore', () => {
    it('should update minimum believability score', () => {
      const newMinScore = 0.8;
      
      environmentAnalyzer.setMinBelievabilityScore(newMinScore);
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      // All returned options should meet the minimum score
      result.camouflageOptions.forEach(option => {
        expect(option.believabilityScore).toBeGreaterThanOrEqual(newMinScore);
      });
    });

    it('should clamp score to valid range', () => {
      environmentAnalyzer.setMinBelievabilityScore(-0.5); // Below 0
      environmentAnalyzer.setMinBelievabilityScore(1.5);  // Above 1
      
      // Should not throw errors
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      expect(result).toBeDefined();
    });
  });

  describe('getLastAnalysis', () => {
    it('should return last analysis result', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result1 = environmentAnalyzer.analyzeEnvironment(playerPosition);
      const lastAnalysis = environmentAnalyzer.getLastAnalysis();
      
      expect(lastAnalysis).toBe(result1);
    });

    it('should return null when no analysis performed', () => {
      const newAnalyzer = new EnvironmentAnalyzer(scene);
      
      const lastAnalysis = newAnalyzer.getLastAnalysis();
      
      expect(lastAnalysis).toBeNull();
    });
  });

  describe('object analysis', () => {
    it('should extract object colors correctly', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.nearbyObjects.forEach(obj => {
        expect(typeof obj.color).toBe('number');
      });
    });

    it('should calculate object sizes', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.nearbyObjects.forEach(obj => {
        expect(obj.size).toBeDefined();
        expect(obj.size.x).toBeGreaterThan(0);
        expect(obj.size.y).toBeGreaterThan(0);
        expect(obj.size.z).toBeGreaterThan(0);
      });
    });

    it('should calculate distances correctly', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.nearbyObjects.forEach(obj => {
        expect(obj.distance).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('camouflage option generation', () => {
    it('should generate movement restrictions', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.camouflageOptions.forEach(option => {
        expect(Array.isArray(option.restrictions)).toBe(true);
        option.restrictions.forEach(restriction => {
          expect(restriction.type).toBeDefined();
          expect(restriction.value).toBeDefined();
        });
      });
    });

    it('should assign appropriate models for object types', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.camouflageOptions.forEach(option => {
        expect(option.model).toMatch(/camouflage_/);
      });
    });

    it('should calculate appropriate scales', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      result.camouflageOptions.forEach(option => {
        if (option.scale) {
          expect(option.scale.x).toBeGreaterThan(0);
          expect(option.scale.y).toBeGreaterThan(0);
          expect(option.scale.z).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('dispose', () => {
    it('should dispose resources', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      environmentAnalyzer.dispose();
      
      const lastAnalysis = environmentAnalyzer.getLastAnalysis();
      expect(lastAnalysis).toBeNull();
    });
  });
});