/**
 * @jest-environment jsdom
 */

import { PlayerAvatar } from '../PlayerAvatar';
import { Player } from '@/types';

// Mock Three.js
jest.mock('three', () => ({
  Group: jest.fn(() => {
    const position = { x: 0, y: 0, z: 0 };
    return {
      add: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
      position: {
        set: jest.fn((x, y, z) => {
          position.x = x;
          position.y = y;
          position.z = z;
        }),
        x: position.x,
        y: position.y,
        z: position.z,
        get x() { return position.x; },
        get y() { return position.y; },
        get z() { return position.z; },
      },
      rotation: { y: 0 },
      getObjectByName: jest.fn(),
    };
  }),
  CapsuleGeometry: jest.fn(),
  SphereGeometry: jest.fn(),
  BoxGeometry: jest.fn(),
  CylinderGeometry: jest.fn(),
  MeshLambertMaterial: jest.fn(() => ({
    color: { setHex: jest.fn() },
  })),
  Mesh: jest.fn(() => ({
    position: { y: 0 },
    castShadow: false,
    receiveShadow: false,
    visible: true,
    material: { color: { setHex: jest.fn() } },
    name: '',
  })),
  CanvasTexture: jest.fn(),
  SpriteMaterial: jest.fn(),
  Sprite: jest.fn(() => ({
    position: { y: 0 },
    scale: { set: jest.fn() },
    visible: true,
  })),
}));

describe('PlayerAvatar', () => {
  const mockPlayer: Player = {
    id: 'player1',
    username: 'testuser',
    role: 'hider',
    position: { x: 5, y: 0, z: 10 },
    avatar: {
      model: 'default',
      skin: 'default',
      accessories: []
    },
    camouflageState: {
      isActive: false,
      objectType: '',
      model: '',
      restrictions: []
    }
  };

  let playerAvatar: PlayerAvatar;

  beforeEach(() => {
    // Mock canvas and context
    const mockCanvas = {
      width: 256,
      height: 64,
      getContext: jest.fn(() => ({
        fillStyle: '',
        fillRect: jest.fn(),
        fillText: jest.fn(),
        font: '',
        textAlign: '',
      })),
    };
    
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return mockCanvas as any;
      }
      return document.createElement(tagName);
    });

    playerAvatar = new PlayerAvatar(mockPlayer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('creation', () => {
    it('should create avatar successfully', () => {
      expect(playerAvatar).toBeDefined();
      expect(playerAvatar.getPlayerId()).toBe('player1');
      expect(playerAvatar.getRole()).toBe('hider');
    });

    it('should have correct initial position', () => {
      const position = playerAvatar.getPosition();
      expect(position.x).toBe(5);
      expect(position.y).toBe(0);
      expect(position.z).toBe(10);
    });

    it('should return Three.js group', () => {
      expect(playerAvatar.getGroup()).toBeDefined();
    });
  });

  describe('position and rotation', () => {
    it('should set position correctly', () => {
      const newPosition = { x: 10, y: 5, z: 15 };
      playerAvatar.setPosition(newPosition);
      
      const position = playerAvatar.getPosition();
      expect(position.x).toBe(10);
      expect(position.y).toBe(5);
      expect(position.z).toBe(15);
    });

    it('should set rotation correctly', () => {
      expect(() => playerAvatar.setRotation(Math.PI / 2)).not.toThrow();
    });
  });

  describe('role management', () => {
    it('should change role correctly', () => {
      expect(playerAvatar.getRole()).toBe('hider');
      
      playerAvatar.setRole('seeker');
      expect(playerAvatar.getRole()).toBe('seeker');
    });
  });

  describe('camouflage system', () => {
    it('should activate camouflage', () => {
      expect(() => playerAvatar.setCamouflaged(true, 'box')).not.toThrow();
    });

    it('should deactivate camouflage', () => {
      playerAvatar.setCamouflaged(true, 'box');
      expect(() => playerAvatar.setCamouflaged(false)).not.toThrow();
    });

    it('should handle different camouflage types', () => {
      expect(() => playerAvatar.setCamouflaged(true, 'cylinder')).not.toThrow();
      expect(() => playerAvatar.setCamouflaged(true, 'sphere')).not.toThrow();
      expect(() => playerAvatar.setCamouflaged(true, 'unknown')).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      expect(() => playerAvatar.dispose()).not.toThrow();
    });
  });
});