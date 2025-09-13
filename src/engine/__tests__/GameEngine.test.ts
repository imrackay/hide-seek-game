/**
 * @jest-environment jsdom
 */

import { GameEngine } from '../GameEngine';
import { Player } from '@/types';

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(() => ({
    add: jest.fn(),
    remove: jest.fn(),
  })),
  PerspectiveCamera: jest.fn(() => ({
    position: { set: jest.fn() },
    lookAt: jest.fn(),
    aspect: 1,
    updateProjectionMatrix: jest.fn(),
  })),
  WebGLRenderer: jest.fn(() => ({
    setSize: jest.fn(),
    setClearColor: jest.fn(),
    render: jest.fn(),
    dispose: jest.fn(),
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: null },
  })),
  AmbientLight: jest.fn(),
  DirectionalLight: jest.fn(() => ({
    position: { set: jest.fn() },
    castShadow: false,
    shadow: {
      mapSize: { width: 0, height: 0 },
    },
  })),
  PlaneGeometry: jest.fn(),
  MeshLambertMaterial: jest.fn(),
  Mesh: jest.fn(() => ({
    rotation: { x: 0 },
    position: { set: jest.fn() },
    receiveShadow: false,
    castShadow: false,
  })),
  BoxGeometry: jest.fn(),
  CylinderGeometry: jest.fn(),
  SphereGeometry: jest.fn(),
  Group: jest.fn(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    position: { set: jest.fn(), x: 0, y: 0, z: 0 },
    rotation: { y: 0 },
    getObjectByName: jest.fn(),
  })),
  CapsuleGeometry: jest.fn(),
  CanvasTexture: jest.fn(),
  SpriteMaterial: jest.fn(),
  Sprite: jest.fn(() => ({
    position: { y: 0 },
    scale: { set: jest.fn() },
  })),
  PCFSoftShadowMap: 'PCFSoftShadowMap',
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  setTimeout(cb, 16);
  return 1;
});

global.cancelAnimationFrame = jest.fn();

describe('GameEngine', () => {
  let gameEngine: GameEngine;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    gameEngine = new GameEngine();
    mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'clientWidth', { value: 800, writable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 600, writable: true });
  });

  afterEach(() => {
    gameEngine.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(() => gameEngine.initialize(mockContainer)).not.toThrow();
      expect(gameEngine.isInitialized()).toBe(true);
    });

    it('should have scene, camera, and renderer after initialization', () => {
      gameEngine.initialize(mockContainer);
      
      expect(gameEngine.getScene()).toBeDefined();
      expect(gameEngine.getCamera()).toBeDefined();
      expect(gameEngine.getRenderer()).toBeDefined();
    });
  });

  describe('player management', () => {
    const mockPlayer: Player = {
      id: 'player1',
      username: 'testuser',
      role: 'hider',
      position: { x: 0, y: 0, z: 0 },
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

    beforeEach(() => {
      gameEngine.initialize(mockContainer);
    });

    it('should add player successfully', () => {
      expect(() => gameEngine.addPlayer(mockPlayer)).not.toThrow();
    });

    it('should update player position', () => {
      gameEngine.addPlayer(mockPlayer);
      const newPosition = { x: 5, y: 0, z: 5 };
      
      expect(() => gameEngine.updatePlayerPosition('player1', newPosition)).not.toThrow();
    });

    it('should update player rotation', () => {
      gameEngine.addPlayer(mockPlayer);
      
      expect(() => gameEngine.updatePlayerRotation('player1', Math.PI / 2)).not.toThrow();
    });

    it('should remove player successfully', () => {
      gameEngine.addPlayer(mockPlayer);
      expect(() => gameEngine.removePlayer('player1')).not.toThrow();
    });

    it('should handle camouflage state changes', () => {
      gameEngine.addPlayer(mockPlayer);
      
      expect(() => gameEngine.setPlayerCamouflage('player1', true, 'box')).not.toThrow();
      expect(() => gameEngine.setPlayerCamouflage('player1', false)).not.toThrow();
    });

    it('should get player position', () => {
      gameEngine.addPlayer(mockPlayer);
      const position = gameEngine.getPlayerPosition('player1');
      
      expect(position).toBeDefined();
      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(position).toHaveProperty('z');
    });

    it('should return null for non-existent player position', () => {
      const position = gameEngine.getPlayerPosition('nonexistent');
      expect(position).toBeNull();
    });

    it('should get all players', () => {
      gameEngine.addPlayer(mockPlayer);
      const players = gameEngine.getAllPlayers();
      
      expect(Array.isArray(players)).toBe(true);
      expect(players.length).toBe(1);
    });
  });

  describe('camera controls', () => {
    beforeEach(() => {
      gameEngine.initialize(mockContainer);
    });

    it('should set camera position', () => {
      const position = { x: 10, y: 15, z: 20 };
      expect(() => gameEngine.setCameraPosition(position)).not.toThrow();
    });

    it('should set camera target', () => {
      const target = { x: 0, y: 0, z: 0 };
      expect(() => gameEngine.setCameraTarget(target)).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      gameEngine.initialize(mockContainer);
      expect(() => gameEngine.dispose()).not.toThrow();
      expect(gameEngine.isInitialized()).toBe(false);
    });
  });
});