import * as THREE from 'three';
import { CamouflageManager } from '../CamouflageManager';

// Mock the camouflage system components
jest.mock('../EnvironmentAnalyzer', () => ({
  EnvironmentAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeEnvironment: jest.fn().mockReturnValue({
      nearbyObjects: [
        {
          id: 'box1',
          type: 'box',
          position: new THREE.Vector3(1, 0, 1),
          size: new THREE.Vector3(2, 2, 2),
          color: 0xff0000,
          distance: 2,
          believabilityScore: 0.8,
          canCamouflage: true
        }
      ],
      camouflageOptions: [
        {
          objectType: 'box',
          model: 'camouflage_box',
          scale: new THREE.Vector3(1, 1, 1),
          believabilityScore: 0.8,
          restrictions: [{ type: 'speed', value: 0.3 }],
          duration: 30000
        }
      ],
      environmentScore: 0.7,
      analysisTimestamp: Date.now()
    }),
    dispose: jest.fn()
  }))
}));

jest.mock('../CamouflageGenerator', () => ({
  CamouflageGenerator: jest.fn().mockImplementation(() => ({
    generateCamouflageOptions: jest.fn().mockReturnValue([
      {
        id: 'generated-1',
        objectType: 'box',
        model: 'camouflage_box',
        scale: new THREE.Vector3(1, 1, 1),
        believabilityScore: 0.8,
        restrictions: [{ type: 'speed', value: 0.3 }],
        generatedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        difficulty: 'medium',
        tags: ['type:box'],
        duration: 30000
      }
    ]),
    generateCamouflageByType: jest.fn().mockReturnValue([]),
    generateCamouflageByDifficulty: jest.fn().mockReturnValue([]),
    setPlayerSkillLevel: jest.fn(),
    getPlayerSkillLevel: jest.fn().mockReturnValue(0.5),
    cleanupExpiredOptions: jest.fn(),
    getGenerationStats: jest.fn().mockReturnValue({
      totalGenerated: 1,
      activeOptions: 1,
      expiredOptions: 0,
      averageQuality: 0.8
    }),
    dispose: jest.fn()
  }))
}));

jest.mock('../PlayerTransformer', () => ({
  PlayerTransformer: jest.fn().mockImplementation(() => ({
    registerPlayer: jest.fn(),
    unregisterPlayer: jest.fn(),
    transformPlayer: jest.fn().mockResolvedValue(true),
    revertTransformation: jest.fn().mockResolvedValue(true),
    getTransformationState: jest.fn().mockReturnValue({
      isActive: true,
      camouflageOption: {
        id: 'generated-1',
        objectType: 'box',
        model: 'camouflage_box',
        believabilityScore: 0.8,
        restrictions: [],
        generatedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        difficulty: 'medium',
        tags: [],
        duration: 30000
      },
      originalAppearance: {},
      transformedAppearance: {},
      startTime: Date.now(),
      endTime: Date.now() + 30000,
      restrictions: []
    }),
    getRemainingTransformationTime: jest.fn().mockReturnValue(25000),
    updateTransformationDuration: jest.fn().mockReturnValue(true),
    dispose: jest.fn()
  }))
}));

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    distanceTo: jest.fn().mockReturnValue(5)
  })),
  Mesh: jest.fn().mockImplementation(() => ({
    userData: {}
  }))
}));

describe('CamouflageManager', () => {
  let scene: THREE.Scene;
  let camouflageManager: CamouflageManager;
  let mockPlayerMesh: THREE.Mesh;

  beforeEach(() => {
    scene = new THREE.Scene();
    camouflageManager = new CamouflageManager(scene);
    mockPlayerMesh = new THREE.Mesh();
    
    // Mock setInterval for auto-cleanup
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    camouflageManager.dispose();
  });

  describe('constructor', () => {
    it('should create CamouflageManager with default options', () => {
      expect(camouflageManager).toBeInstanceOf(CamouflageManager);
    });

    it('should create CamouflageManager with custom options', () => {
      const options = {
        autoAnalysisInterval: 10000,
        enableAutoCleanup: false,
        maxCacheSize: 100
      };
      
      const manager = new CamouflageManager(scene, options);
      expect(manager).toBeInstanceOf(CamouflageManager);
      manager.dispose();
    });
  });

  describe('activateCamouflage', () => {
    it('should activate camouflage successfully', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = await camouflageManager.activateCamouflage(
        playerId, 
        playerPosition, 
        mockPlayerMesh
      );
      
      expect(result).toBe(true);
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(true);
    });

    it('should fail when no camouflage options available', async () => {
      // Mock analyzer to return no options
      const mockAnalyzer = camouflageManager['environmentAnalyzer'];
      (mockAnalyzer.analyzeEnvironment as jest.Mock).mockReturnValue({
        nearbyObjects: [],
        camouflageOptions: [],
        environmentScore: 0,
        analysisTimestamp: Date.now()
      });
      
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = await camouflageManager.activateCamouflage(
        playerId, 
        playerPosition, 
        mockPlayerMesh
      );
      
      expect(result).toBe(false);
    });

    it('should fail when generation fails', async () => {
      // Mock generator to return no options
      const mockGenerator = camouflageManager['camouflageGenerator'];
      (mockGenerator.generateCamouflageOptions as jest.Mock).mockReturnValue([]);
      
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = await camouflageManager.activateCamouflage(
        playerId, 
        playerPosition, 
        mockPlayerMesh
      );
      
      expect(result).toBe(false);
    });

    it('should fail when transformation fails', async () => {
      // Mock transformer to fail
      const mockTransformer = camouflageManager['playerTransformer'];
      (mockTransformer.transformPlayer as jest.Mock).mockResolvedValue(false);
      
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = await camouflageManager.activateCamouflage(
        playerId, 
        playerPosition, 
        mockPlayerMesh
      );
      
      expect(result).toBe(false);
    });

    it('should use preferred object type when specified', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const preferredType = 'sphere';
      
      // Mock generator to return multiple types
      const mockGenerator = camouflageManager['camouflageGenerator'];
      (mockGenerator.generateCamouflageOptions as jest.Mock).mockReturnValue([
        {
          id: 'box-option',
          objectType: 'box',
          model: 'camouflage_box',
          believabilityScore: 0.9,
          restrictions: [],
          generatedAt: Date.now(),
          expiresAt: Date.now() + 30000,
          difficulty: 'easy',
          tags: [],
          duration: 30000
        },
        {
          id: 'sphere-option',
          objectType: 'sphere',
          model: 'camouflage_sphere',
          believabilityScore: 0.7,
          restrictions: [],
          generatedAt: Date.now(),
          expiresAt: Date.now() + 30000,
          difficulty: 'medium',
          tags: [],
          duration: 30000
        }
      ]);
      
      const result = await camouflageManager.activateCamouflage(
        playerId, 
        playerPosition, 
        mockPlayerMesh,
        preferredType
      );
      
      expect(result).toBe(true);
    });
  });

  describe('deactivateCamouflage', () => {
    it('should deactivate camouflage successfully', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // First activate
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      // Then deactivate
      const result = await camouflageManager.deactivateCamouflage(playerId);
      
      expect(result).toBe(true);
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(false);
    });

    it('should fail when no active camouflage', async () => {
      const playerId = 'player1';
      
      const result = await camouflageManager.deactivateCamouflage(playerId);
      
      expect(result).toBe(false);
    });

    it('should fail when reversion fails', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // First activate
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      // Mock transformer to fail reversion
      const mockTransformer = camouflageManager['playerTransformer'];
      (mockTransformer.revertTransformation as jest.Mock).mockResolvedValue(false);
      
      const result = await camouflageManager.deactivateCamouflage(playerId);
      
      expect(result).toBe(false);
    });
  });

  describe('environment analysis', () => {
    it('should analyze environment for player', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = camouflageManager.analyzeEnvironmentForPlayer(playerId, playerPosition);
      
      expect(result).toBeDefined();
      expect(result.nearbyObjects).toBeDefined();
      expect(result.camouflageOptions).toBeDefined();
      expect(result.environmentScore).toBeDefined();
    });

    it('should use cached analysis when available', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // First analysis
      const result1 = camouflageManager.analyzeEnvironmentForPlayer(playerId, playerPosition);
      
      // Second analysis should use cache
      const result2 = camouflageManager.analyzeEnvironmentForPlayer(playerId, playerPosition);
      
      expect(result1.analysisTimestamp).toBe(result2.analysisTimestamp);
    });

    it('should clear analysis cache', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // Generate cache
      camouflageManager.analyzeEnvironmentForPlayer(playerId, playerPosition);
      
      // Clear cache
      camouflageManager.clearAnalysisCache();
      
      // Should not throw
      expect(() => {
        camouflageManager.analyzeEnvironmentForPlayer(playerId, playerPosition);
      }).not.toThrow();
    });
  });

  describe('camouflage options', () => {
    it('should get camouflage options', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageManager.getCamouflageOptions(playerId, playerPosition);
      
      expect(Array.isArray(options)).toBe(true);
    });

    it('should get best camouflage option', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const bestOption = camouflageManager.getBestCamouflageOption(playerId, playerPosition);
      
      if (bestOption) {
        expect(bestOption.id).toBeDefined();
        expect(bestOption.objectType).toBeDefined();
      }
    });

    it('should get camouflage options by type', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const objectType = 'box';
      
      const options = camouflageManager.getCamouflageOptionsByType(playerId, playerPosition, objectType);
      
      expect(Array.isArray(options)).toBe(true);
    });

    it('should get camouflage options by difficulty', () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const difficulty = 'medium';
      
      const options = camouflageManager.getCamouflageOptionsByDifficulty(playerId, playerPosition, difficulty);
      
      expect(Array.isArray(options)).toBe(true);
    });
  });

  describe('session management', () => {
    it('should get active session', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      const session = camouflageManager.getActiveSession(playerId);
      
      expect(session).toBeDefined();
      expect(session?.playerId).toBe(playerId);
    });

    it('should return null for non-active session', () => {
      const playerId = 'player1';
      
      const session = camouflageManager.getActiveSession(playerId);
      
      expect(session).toBeNull();
    });

    it('should check if player is camouflaged', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(false);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(true);
    });

    it('should get remaining camouflage time', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      const remainingTime = camouflageManager.getRemainingCamouflageTime(playerId);
      
      expect(remainingTime).toBeGreaterThan(0);
    });

    it('should extend camouflage time', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      const result = camouflageManager.extendCamouflageTime(playerId, 10000);
      
      expect(result).toBe(true);
    });
  });

  describe('player management', () => {
    it('should register player', () => {
      const playerId = 'player1';
      
      camouflageManager.registerPlayer(playerId, mockPlayerMesh);
      
      // Should not throw
      expect(() => {
        camouflageManager.registerPlayer(playerId, mockPlayerMesh);
      }).not.toThrow();
    });

    it('should unregister player', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // Activate camouflage
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      // Unregister should deactivate camouflage
      camouflageManager.unregisterPlayer(playerId);
      
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(false);
    });
  });

  describe('skill management', () => {
    it('should update player skill', () => {
      const playerId = 'player1';
      const skillLevel = 0.8;
      
      camouflageManager.updatePlayerSkill(playerId, skillLevel);
      
      const retrievedSkill = camouflageManager.getPlayerSkill(playerId);
      expect(retrievedSkill).toBe(skillLevel);
    });
  });

  describe('event system', () => {
    it('should add event listener', () => {
      const callback = jest.fn();
      
      camouflageManager.addEventListener('camouflage-activated', callback);
      
      // Should not throw
      expect(() => {
        camouflageManager.addEventListener('camouflage-activated', callback);
      }).not.toThrow();
    });

    it('should remove event listener', () => {
      const callback = jest.fn();
      
      camouflageManager.addEventListener('camouflage-activated', callback);
      camouflageManager.removeEventListener('camouflage-activated', callback);
      
      // Should not throw
      expect(() => {
        camouflageManager.removeEventListener('camouflage-activated', callback);
      }).not.toThrow();
    });

    it('should emit events on camouflage activation', async () => {
      const callback = jest.fn();
      
      camouflageManager.addEventListener('camouflage-activated', callback);
      
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        playerId,
        session: expect.any(Object)
      }));
    });
  });

  describe('statistics', () => {
    it('should provide statistics', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      const stats = camouflageManager.getStatistics();
      
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
      expect(stats.cacheSize).toBeGreaterThanOrEqual(0);
      expect(stats.totalAnalyses).toBeGreaterThanOrEqual(0);
      expect(stats.averageEnvironmentScore).toBeGreaterThanOrEqual(0);
      expect(stats.generationStats).toBeDefined();
    });

    it('should provide debug info', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      const debugInfo = camouflageManager.getDebugInfo(playerId);
      
      expect(debugInfo.statistics).toBeDefined();
      expect(debugInfo.activeSessions).toBeDefined();
      expect(debugInfo.playerSession).toBeDefined();
      expect(debugInfo.transformationState).toBeDefined();
    });
  });

  describe('configuration updates', () => {
    it('should update environment analyzer options', () => {
      const options = {
        analysisRadius: 15,
        minBelievabilityScore: 0.6
      };
      
      camouflageManager.updateEnvironmentAnalyzerOptions(options);
      
      // Should not throw
      expect(() => {
        camouflageManager.updateEnvironmentAnalyzerOptions(options);
      }).not.toThrow();
    });

    it('should update camouflage generator options', () => {
      const options = {
        maxOptions: 10,
        qualityThreshold: 0.7
      };
      
      camouflageManager.updateCamouflageGeneratorOptions(options);
      
      // Should not throw
      expect(() => {
        camouflageManager.updateCamouflageGeneratorOptions(options);
      }).not.toThrow();
    });
  });

  describe('auto-cleanup', () => {
    it('should perform maintenance on interval', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      // Fast-forward time to trigger maintenance
      jest.advanceTimersByTime(5000);
      
      // Should not throw
      expect(() => {
        jest.advanceTimersByTime(5000);
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose all resources', async () => {
      const playerId = 'player1';
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      await camouflageManager.activateCamouflage(playerId, playerPosition, mockPlayerMesh);
      
      camouflageManager.dispose();
      
      // Should clear all sessions
      expect(camouflageManager.isPlayerCamouflaged(playerId)).toBe(false);
    });

    it('should clear auto-cleanup timer', () => {
      camouflageManager.dispose();
      
      // Should not throw after disposal
      expect(() => {
        jest.advanceTimersByTime(10000);
      }).not.toThrow();
    });
  });
});