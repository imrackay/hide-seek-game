import * as THREE from 'three';
import { InteractionManager } from '../InteractionManager';

// Mock the interaction system components
jest.mock('../InteractionDetector', () => ({
  InteractionDetector: jest.fn().mockImplementation(() => ({
    registerCamouflagePlayer: jest.fn(),
    unregisterCamouflagePlayer: jest.fn(),
    registerObject: jest.fn(),
    unregisterInteractionTarget: jest.fn(),
    updateTargetPosition: jest.fn(),
    getInteractableTargets: jest.fn().mockReturnValue([]),
    getNearestInteractableTarget: jest.fn().mockReturnValue(null),
    getProximityHints: jest.fn().mockReturnValue({
      nearbyTargets: [],
      suspiciousObjects: [],
      interactableCount: 0
    }),
    startInteraction: jest.fn().mockResolvedValue({
      success: true,
      target: { id: 'test-target', type: 'object' },
      interactionType: 'inspect',
      confidence: 0.8,
      timestamp: Date.now()
    }),
    cancelInteraction: jest.fn(),
    updateOptions: jest.fn(),
    dispose: jest.fn()
  }))
}));

jest.mock('../HiderDiscoverySystem', () => ({
  HiderDiscoverySystem: jest.fn().mockImplementation(() => ({
    addNotificationCallback: jest.fn(),
    updatePlayerPosition: jest.fn(),
    recordDiscoveryAttempt: jest.fn(),
    isPlayerDiscovered: jest.fn().mockReturnValue(false),
    getDiscoveredPlayers: jest.fn().mockReturnValue([]),
    getRecentDiscoveries: jest.fn().mockReturnValue([]),
    forceDiscovery: jest.fn().mockReturnValue(true),
    resetPlayerDiscovery: jest.fn(),
    resetAllDiscoveries: jest.fn(),
    updateOptions: jest.fn(),
    dispose: jest.fn()
  }))
}));

jest.mock('../MovementRestrictionManager', () => ({
  MovementRestrictionManager: jest.fn().mockImplementation(() => ({
    registerPlayer: jest.fn(),
    unregisterPlayer: jest.fn(),
    applyRestrictions: jest.fn(),
    removeRestrictions: jest.fn(),
    validateMovement: jest.fn().mockReturnValue({
      isValid: true,
      correctedPosition: new THREE.Vector3(),
      violations: []
    }),
    getPlayerState: jest.fn().mockReturnValue({
      playerId: 'test-player',
      originalSpeed: 1.0,
      currentSpeed: 1.0,
      restrictions: [],
      isRestricted: false,
      restrictionStartTime: 0,
      lastPosition: new THREE.Vector3(),
      movementViolations: 0
    }),
    addViolationCallback: jest.fn(),
    getViolationStatistics: jest.fn().mockReturnValue({
      totalViolations: 0,
      violationsByType: {},
      violationsBySeverity: {},
      averageViolationsPerPlayer: 0,
      recentViolationRate: 0
    }),
    updateOptions: jest.fn(),
    dispose: jest.fn()
  }))
}));

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(),
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    clone: jest.fn().mockReturnThis(),
    copy: jest.fn().mockReturnThis()
  })),
  Mesh: jest.fn()
}));

describe('InteractionManager', () => {
  let scene: THREE.Scene;
  let interactionManager: InteractionManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    interactionManager = new InteractionManager(scene);
  });

  afterEach(() => {
    interactionManager.dispose();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create InteractionManager with default options', () => {
      expect(interactionManager).toBeInstanceOf(InteractionManager);
    });

    it('should create InteractionManager with custom options', () => {
      const options = {
        enableAutoCleanup: false,
        cleanupInterval: 60000
      };
      
      const manager = new InteractionManager(scene, options);
      expect(manager).toBeInstanceOf(InteractionManager);
      manager.dispose();
    });
  });

  describe('player management', () => {
    it('should register player', () => {
      interactionManager.registerPlayer('player1', 'hider', 1.5);
      
      // Should not throw
      expect(() => {
        interactionManager.registerPlayer('player1', 'hider', 1.5);
      }).not.toThrow();
    });

    it('should unregister player', () => {
      interactionManager.registerPlayer('player1', 'hider');
      interactionManager.unregisterPlayer('player1');
      
      // Should not throw
      expect(() => {
        interactionManager.unregisterPlayer('player1');
      }).not.toThrow();
    });

    it('should update player position', () => {
      interactionManager.registerPlayer('player1', 'seeker');
      const position = new THREE.Vector3(1, 0, 1);
      
      interactionManager.updatePlayerPosition('player1', position);
      
      // Should not throw
      expect(() => {
        interactionManager.updatePlayerPosition('player1', position);
      }).not.toThrow();
    });
  });

  describe('camouflage management', () => {
    it('should activate player camouflage', () => {
      const player = {
        id: 'player1',
        username: 'TestPlayer',
        role: 'hider' as const,
        position: new THREE.Vector3(0, 0, 0),
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: true, restrictions: [] }
      };
      
      const camouflageData = {
        objectType: 'box',
        model: 'camouflage_box',
        scale: new THREE.Vector3(1, 1, 1),
        believabilityScore: 0.8,
        restrictions: []
      };
      
      const playerMesh = new THREE.Mesh();
      
      interactionManager.activatePlayerCamouflage('player1', player, camouflageData, playerMesh);
      
      // Should not throw
      expect(() => {
        interactionManager.activatePlayerCamouflage('player1', player, camouflageData, playerMesh);
      }).not.toThrow();
    });

    it('should deactivate player camouflage', () => {
      interactionManager.deactivatePlayerCamouflage('player1');
      
      // Should not throw
      expect(() => {
        interactionManager.deactivatePlayerCamouflage('player1');
      }).not.toThrow();
    });
  });

  describe('object registration', () => {
    it('should register interactable object', () => {
      const mesh = new THREE.Mesh();
      
      interactionManager.registerInteractableObject('object1', mesh, false);
      
      // Should not throw
      expect(() => {
        interactionManager.registerInteractableObject('object1', mesh, false);
      }).not.toThrow();
    });

    it('should unregister interactable object', () => {
      interactionManager.unregisterInteractableObject('object1');
      
      // Should not throw
      expect(() => {
        interactionManager.unregisterInteractableObject('object1');
      }).not.toThrow();
    });
  });

  describe('interaction execution', () => {
    beforeEach(() => {
      interactionManager.registerPlayer('seeker1', 'seeker');
    });

    it('should start interaction successfully', async () => {
      const seekerPosition = new THREE.Vector3(0, 0, 0);
      
      const result = await interactionManager.startInteraction('seeker1', seekerPosition, 'test-target');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should throw error for non-seeker player', async () => {
      interactionManager.registerPlayer('hider1', 'hider');
      const position = new THREE.Vector3(0, 0, 0);
      
      await expect(
        interactionManager.startInteraction('hider1', position, 'test-target')
      ).rejects.toThrow('Only seekers can initiate interactions');
    });

    it('should cancel interaction', () => {
      const result = interactionManager.cancelInteraction('seeker1');
      
      expect(typeof result).toBe('boolean');
    });
  });

  describe('movement validation', () => {
    beforeEach(() => {
      interactionManager.registerPlayer('player1', 'hider');
    });

    it('should validate player movement', () => {
      const currentPos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(1, 0, 0);
      const deltaTime = 0.016;
      
      const result = interactionManager.validatePlayerMovement('player1', currentPos, targetPos, deltaTime);
      
      expect(result.isValid).toBe(true);
      expect(result.correctedPosition).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      interactionManager.registerPlayer('player1', 'seeker');
    });

    it('should get interactable targets', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const targets = interactionManager.getInteractableTargets(position, 'player1');
      
      expect(Array.isArray(targets)).toBe(true);
    });

    it('should get nearest interactable target', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const target = interactionManager.getNearestInteractableTarget(position, 'player1');
      
      // Can be null if no targets
      expect(target === null || typeof target === 'object').toBe(true);
    });

    it('should get proximity hints', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const hints = interactionManager.getProximityHints(position, 'player1');
      
      expect(hints.nearbyTargets).toBeDefined();
      expect(hints.suspiciousObjects).toBeDefined();
      expect(hints.interactableCount).toBeDefined();
    });

    it('should check if player is interacting', () => {
      const isInteracting = interactionManager.isPlayerInteracting('player1');
      expect(typeof isInteracting).toBe('boolean');
    });

    it('should check if player is discovered', () => {
      const isDiscovered = interactionManager.isPlayerDiscovered('player1');
      expect(typeof isDiscovered).toBe('boolean');
    });

    it('should get player movement state', () => {
      const state = interactionManager.getPlayerMovementState('player1');
      expect(state).toBeDefined();
      expect(state?.playerId).toBe('test-player');
    });

    it('should get discovered players', () => {
      const discoveredPlayers = interactionManager.getDiscoveredPlayers();
      expect(Array.isArray(discoveredPlayers)).toBe(true);
    });

    it('should get recent discoveries', () => {
      const discoveries = interactionManager.getRecentDiscoveries();
      expect(Array.isArray(discoveries)).toBe(true);
    });
  });

  describe('session management', () => {
    it('should get active sessions', () => {
      const sessions = interactionManager.getActiveSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get session history', () => {
      const history = interactionManager.getSessionHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get session history for specific player', () => {
      const history = interactionManager.getSessionHistory('player1');
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('event system', () => {
    it('should add event listener', () => {
      const callback = jest.fn();
      
      interactionManager.addEventListener('player_discovery', callback);
      
      // Should not throw
      expect(() => {
        interactionManager.addEventListener('player_discovery', callback);
      }).not.toThrow();
    });

    it('should remove event listener', () => {
      const callback = jest.fn();
      
      interactionManager.addEventListener('player_discovery', callback);
      interactionManager.removeEventListener('player_discovery', callback);
      
      // Should not throw
      expect(() => {
        interactionManager.removeEventListener('player_discovery', callback);
      }).not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should get statistics', () => {
      const stats = interactionManager.getStatistics();
      
      expect(stats.totalInteractions).toBeGreaterThanOrEqual(0);
      expect(stats.activeInteractions).toBeGreaterThanOrEqual(0);
      expect(stats.discoveredPlayers).toBeGreaterThanOrEqual(0);
      expect(stats.totalViolations).toBeGreaterThanOrEqual(0);
      expect(stats.interactionSuccessRate).toBeGreaterThanOrEqual(0);
      expect(stats.averageInteractionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('manual controls', () => {
    it('should force discovery', () => {
      const result = interactionManager.forceDiscovery('player1', 'seeker1');
      expect(typeof result).toBe('boolean');
    });

    it('should reset player discovery', () => {
      interactionManager.resetPlayerDiscovery('player1');
      
      // Should not throw
      expect(() => {
        interactionManager.resetPlayerDiscovery('player1');
      }).not.toThrow();
    });

    it('should reset all discoveries', () => {
      interactionManager.resetAllDiscoveries();
      
      // Should not throw
      expect(() => {
        interactionManager.resetAllDiscoveries();
      }).not.toThrow();
    });
  });

  describe('configuration updates', () => {
    it('should update interaction detector options', () => {
      const options = { maxInteractionDistance: 5 };
      
      interactionManager.updateInteractionDetectorOptions(options);
      
      // Should not throw
      expect(() => {
        interactionManager.updateInteractionDetectorOptions(options);
      }).not.toThrow();
    });

    it('should update hider discovery options', () => {
      const options = { enableProximityDiscovery: false };
      
      interactionManager.updateHiderDiscoveryOptions(options);
      
      // Should not throw
      expect(() => {
        interactionManager.updateHiderDiscoveryOptions(options);
      }).not.toThrow();
    });

    it('should update movement restriction options', () => {
      const options = { violationThreshold: 0.2 };
      
      interactionManager.updateMovementRestrictionOptions(options);
      
      // Should not throw
      expect(() => {
        interactionManager.updateMovementRestrictionOptions(options);
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose all resources', () => {
      interactionManager.registerPlayer('player1', 'seeker');
      
      interactionManager.dispose();
      
      // Should not throw after disposal
      expect(() => {
        interactionManager.dispose();
      }).not.toThrow();
    });
  });
});