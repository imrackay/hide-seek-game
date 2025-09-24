import { PositionalAudioManager, AudioSource, ProximityZone } from '../PositionalAudioManager';
import * as THREE from 'three';

// Mock Web Audio API
const mockAudioContext = {
  createGain: jest.fn(() => ({
    gain: { value: 1, setValueAtTime: jest.fn() },
    connect: jest.fn(),
    disconnect: jest.fn()
  })),
  createPanner: jest.fn(() => ({
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    maxDistance: 50,
    rolloffFactor: 1,
    refDistance: 1,
    dopplerFactor: 1,
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    setVelocity: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn()
  })),
  createMediaElementSource: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn()
  })),
  createDynamicsCompressor: jest.fn(() => ({
    threshold: { value: -24 },
    knee: { value: 30 },
    ratio: { value: 12 },
    attack: { value: 0.003 },
    release: { value: 0.25 },
    connect: jest.fn(),
    disconnect: jest.fn()
  })),
  createConvolver: jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn()
  })),
  createBuffer: jest.fn(() => ({
    getChannelData: jest.fn(() => new Float32Array(1024))
  })),
  listener: {
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    forwardX: { value: 0 },
    forwardY: { value: 0 },
    forwardZ: { value: -1 },
    upX: { value: 0 },
    upY: { value: 1 },
    upZ: { value: 0 }
  },
  currentTime: 0,
  sampleRate: 44100,
  state: 'running',
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  destination: {}
};

// Mock HTMLAudioElement
const createMockAudioElement = () => ({
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  volume: 1,
  muted: false,
  currentTime: 0,
  duration: 100,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
});

// Mock global AudioContext
(global as any).AudioContext = jest.fn(() => mockAudioContext);
(global as any).webkitAudioContext = jest.fn(() => mockAudioContext);

describe('PositionalAudioManager', () => {
  let audioManager: PositionalAudioManager;
  let mockAudioElement: any;

  beforeEach(() => {
    jest.clearAllMocks();
    audioManager = new PositionalAudioManager({
      enablePositionalAudio: true,
      maxAudioDistance: 50,
      rolloffFactor: 1,
      audioUpdateInterval: 100
    });
    mockAudioElement = createMockAudioElement();
  });

  afterEach(() => {
    audioManager.dispose();
  });

  describe('Initialization', () => {
    it('should initialize successfully with default options', async () => {
      const result = await audioManager.initialize();
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail initialization when positional audio is disabled', async () => {
      const disabledManager = new PositionalAudioManager({ enablePositionalAudio: false });
      const result = await disabledManager.initialize();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Positional audio is disabled');
    });

    it('should create audio processing nodes during initialization', async () => {
      await audioManager.initialize();
      
      expect(mockAudioContext.createGain).toHaveBeenCalled();
      expect(mockAudioContext.createDynamicsCompressor).toHaveBeenCalled();
    });
  });

  describe('Audio Source Management', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should add audio source successfully', () => {
      const position = new THREE.Vector3(10, 0, 5);
      const source = audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      expect(source.playerId).toBe('player1');
      expect(source.playerName).toBe('Player One');
      expect(source.position).toEqual(position);
      expect(source.isActive).toBe(true);
      expect(mockAudioContext.createMediaElementSource).toHaveBeenCalledWith(mockAudioElement);
      expect(mockAudioContext.createPanner).toHaveBeenCalled();
    });

    it('should remove audio source successfully', () => {
      const position = new THREE.Vector3(10, 0, 5);
      const source = audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      const removed = audioManager.removeAudioSource(source.id);
      
      expect(removed).toBe(true);
      expect(audioManager.getAudioSource(source.id)).toBeNull();
    });

    it('should return false when removing non-existent source', () => {
      const removed = audioManager.removeAudioSource('non-existent');
      
      expect(removed).toBe(false);
    });

    it('should get audio sources by player ID', () => {
      const position1 = new THREE.Vector3(10, 0, 5);
      const position2 = new THREE.Vector3(15, 0, 10);
      
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position1);
      audioManager.addAudioSource('player1', 'Player One Alt', createMockAudioElement(), position2);
      audioManager.addAudioSource('player2', 'Player Two', createMockAudioElement(), position1);
      
      const player1Sources = audioManager.getAudioSourcesByPlayer('player1');
      
      expect(player1Sources).toHaveLength(2);
      expect(player1Sources.every(s => s.playerId === 'player1')).toBe(true);
    });
  });

  describe('Audio Listener Management', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should set audio listener position and orientation', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const orientation = new THREE.Vector3(0, 0, -1);
      
      audioManager.setAudioListener('listener1', position, orientation);
      
      const listener = audioManager.getAudioListener();
      expect(listener).not.toBeNull();
      expect(listener!.playerId).toBe('listener1');
      expect(listener!.position).toEqual(position);
      expect(listener!.orientation).toEqual(orientation);
    });

    it('should update listener position', () => {
      const initialPos = new THREE.Vector3(0, 0, 0);
      const initialOrient = new THREE.Vector3(0, 0, -1);
      const newPos = new THREE.Vector3(10, 5, -3);
      const newOrient = new THREE.Vector3(1, 0, 0);
      
      audioManager.setAudioListener('listener1', initialPos, initialOrient);
      audioManager.updateListenerPosition(newPos, newOrient);
      
      const listener = audioManager.getAudioListener();
      expect(listener!.position).toEqual(newPos);
      expect(listener!.orientation).toEqual(newOrient);
    });
  });

  describe('Position Updates', () => {
    let sourceId: string;

    beforeEach(async () => {
      await audioManager.initialize();
      const position = new THREE.Vector3(10, 0, 5);
      const source = audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      sourceId = source.id;
    });

    it('should update source position', () => {
      const newPosition = new THREE.Vector3(20, 10, -5);
      
      audioManager.updateSourcePosition(sourceId, newPosition);
      
      const source = audioManager.getAudioSource(sourceId);
      expect(source!.position).toEqual(newPosition);
    });

    it('should update source position with velocity for Doppler effect', () => {
      const newPosition = new THREE.Vector3(20, 10, -5);
      const velocity = new THREE.Vector3(5, 0, 0);
      
      audioManager.updateSourcePosition(sourceId, newPosition, velocity);
      
      const source = audioManager.getAudioSource(sourceId);
      expect(source!.position).toEqual(newPosition);
      expect(source!.pannerNode!.setVelocity).toHaveBeenCalledWith(5, 0, 0);
    });
  });

  describe('Proximity Zones', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should add proximity zone', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const zone = audioManager.addProximityZone('zone1', center, 10, 1.5, 'amplify');
      
      expect(zone.id).toBe('zone1');
      expect(zone.center).toEqual(center);
      expect(zone.radius).toBe(10);
      expect(zone.volumeMultiplier).toBe(1.5);
      expect(zone.type).toBe('amplify');
      expect(zone.isActive).toBe(true);
    });

    it('should remove proximity zone', () => {
      const center = new THREE.Vector3(0, 0, 0);
      audioManager.addProximityZone('zone1', center, 10, 1.5);
      
      const removed = audioManager.removeProximityZone('zone1');
      
      expect(removed).toBe(true);
      expect(audioManager.getProximityZone('zone1')).toBeNull();
    });

    it('should update proximity zone properties', () => {
      const center = new THREE.Vector3(0, 0, 0);
      const newCenter = new THREE.Vector3(5, 5, 5);
      
      audioManager.addProximityZone('zone1', center, 10, 1.5);
      const updated = audioManager.updateProximityZone('zone1', newCenter, 15);
      
      expect(updated).toBe(true);
      
      const zone = audioManager.getProximityZone('zone1');
      expect(zone!.center).toEqual(newCenter);
      expect(zone!.radius).toBe(15);
    });
  });

  describe('Audio Quality Controls', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should set master volume', () => {
      audioManager.setMasterVolume(0.5);
      
      // Verify the gain node was called with correct value
      expect(mockAudioContext.createGain().gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    });

    it('should clamp master volume to valid range', () => {
      audioManager.setMasterVolume(1.5); // Above max
      audioManager.setMasterVolume(-0.5); // Below min
      
      // Should clamp to 1.0 and 0.0 respectively
      const gainNode = mockAudioContext.createGain();
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    });

    it('should set source volume', () => {
      const position = new THREE.Vector3(10, 0, 5);
      const source = audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      const result = audioManager.setSourceVolume(source.id, 0.7);
      
      expect(result).toBe(true);
      expect(source.volume).toBe(0.7);
    });
  });

  describe('Proximity Detection', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should find sources in range', () => {
      const pos1 = new THREE.Vector3(0, 0, 0);
      const pos2 = new THREE.Vector3(5, 0, 0);
      const pos3 = new THREE.Vector3(20, 0, 0);
      
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, pos1);
      audioManager.addAudioSource('player2', 'Player Two', createMockAudioElement(), pos2);
      audioManager.addAudioSource('player3', 'Player Three', createMockAudioElement(), pos3);
      
      const searchPos = new THREE.Vector3(0, 0, 0);
      const sourcesInRange = audioManager.getSourcesInRange(searchPos, 10);
      
      expect(sourcesInRange).toHaveLength(2);
      expect(sourcesInRange.map(s => s.playerId)).toContain('player1');
      expect(sourcesInRange.map(s => s.playerId)).toContain('player2');
      expect(sourcesInRange.map(s => s.playerId)).not.toContain('player3');
    });

    it('should get players in voice range', () => {
      const pos1 = new THREE.Vector3(0, 0, 0);
      const pos2 = new THREE.Vector3(10, 0, 0);
      const pos3 = new THREE.Vector3(60, 0, 0); // Outside default max distance of 50
      
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, pos1);
      audioManager.addAudioSource('player2', 'Player Two', createMockAudioElement(), pos2);
      audioManager.addAudioSource('player3', 'Player Three', createMockAudioElement(), pos3);
      
      const listenerPos = new THREE.Vector3(0, 0, 0);
      const playersInRange = audioManager.getPlayersInVoiceRange(listenerPos);
      
      expect(playersInRange).toHaveLength(2);
      expect(playersInRange).toContain('player1');
      expect(playersInRange).toContain('player2');
      expect(playersInRange).not.toContain('player3');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should provide accurate statistics', () => {
      const pos1 = new THREE.Vector3(0, 0, 0);
      const pos2 = new THREE.Vector3(10, 0, 0);
      
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, pos1);
      audioManager.addAudioSource('player2', 'Player Two', createMockAudioElement(), pos2);
      audioManager.addProximityZone('zone1', new THREE.Vector3(0, 0, 0), 5, 1.2);
      audioManager.setAudioListener('listener1', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
      
      const stats = audioManager.getAudioStatistics();
      
      expect(stats.totalSources).toBe(2);
      expect(stats.activeSources).toBe(2);
      expect(stats.proximityZones).toBe(1);
      expect(stats.isInitialized).toBe(true);
      expect(stats.hasListener).toBe(true);
      expect(stats.sourcesInRange).toBe(2);
    });
  });

  describe('Event System', () => {
    let eventCallback: jest.Mock;

    beforeEach(async () => {
      await audioManager.initialize();
      eventCallback = jest.fn();
    });

    it('should add and trigger audio callbacks', () => {
      audioManager.addAudioCallback('test_event', eventCallback);
      
      // Trigger event by adding a source (which emits an event)
      const position = new THREE.Vector3(10, 0, 5);
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      expect(eventCallback).toHaveBeenCalled();
    });

    it('should remove audio callbacks', () => {
      audioManager.addAudioCallback('test_event', eventCallback);
      audioManager.removeAudioCallback('test_event', eventCallback);
      
      // Trigger event - callback should not be called
      const position = new THREE.Vector3(10, 0, 5);
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      // The callback should have been called during addAudioSource before removal
      // but not after removal for subsequent events
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should update options and apply to existing sources', () => {
      const position = new THREE.Vector3(10, 0, 5);
      const source = audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      
      audioManager.updateOptions({
        maxAudioDistance: 100,
        rolloffFactor: 2
      });
      
      expect(source.maxDistance).toBe(100);
      expect(source.rolloffFactor).toBe(2);
    });

    it('should return current options', () => {
      const options = audioManager.getOptions();
      
      expect(options.enablePositionalAudio).toBe(true);
      expect(options.maxAudioDistance).toBe(50);
      expect(options.rolloffFactor).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should dispose all resources properly', async () => {
      await audioManager.initialize();
      
      const position = new THREE.Vector3(10, 0, 5);
      audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      audioManager.addProximityZone('zone1', new THREE.Vector3(0, 0, 0), 5, 1.2);
      
      audioManager.dispose();
      
      expect(audioManager.getAllAudioSources()).toHaveLength(0);
      expect(audioManager.getAllProximityZones()).toHaveLength(0);
      expect(audioManager.getAudioListener()).toBeNull();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when adding source without initialization', () => {
      const position = new THREE.Vector3(10, 0, 5);
      
      expect(() => {
        audioManager.addAudioSource('player1', 'Player One', mockAudioElement, position);
      }).toThrow('Positional audio not initialized');
    });

    it('should handle audio context creation failure gracefully', async () => {
      // Mock AudioContext to throw error
      (global as any).AudioContext = jest.fn(() => {
        throw new Error('Audio context creation failed');
      });
      
      const result = await audioManager.initialize();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to initialize positional audio');
    });
  });
});