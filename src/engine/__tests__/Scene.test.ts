/**
 * @jest-environment jsdom
 */

import { GameScene } from '../Scene';

// Mock Three.js
jest.mock('three', () => ({
  Scene: jest.fn(() => ({
    add: jest.fn(),
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
  BoxGeometry: jest.fn(),
  CylinderGeometry: jest.fn(),
  SphereGeometry: jest.fn(),
  MeshLambertMaterial: jest.fn(),
  Mesh: jest.fn(() => ({
    rotation: { x: 0 },
    position: { set: jest.fn() },
    receiveShadow: false,
    castShadow: false,
  })),
  PCFSoftShadowMap: 'PCFSoftShadowMap',
}));

describe('GameScene', () => {
  let gameScene: GameScene;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    gameScene = new GameScene();
    mockContainer = document.createElement('div');
  });

  describe('initialization', () => {
    it('should create scene successfully', () => {
      expect(gameScene).toBeDefined();
      expect(gameScene.getScene()).toBeDefined();
      expect(gameScene.getCamera()).toBeDefined();
      expect(gameScene.getRenderer()).toBeDefined();
    });

    it('should initialize with container', () => {
      expect(() => gameScene.initialize(mockContainer)).not.toThrow();
    });

    it('should not initialize twice', () => {
      gameScene.initialize(mockContainer);
      // Second initialization should not throw
      expect(() => gameScene.initialize(mockContainer)).not.toThrow();
    });
  });

  describe('rendering', () => {
    it('should render without errors', () => {
      gameScene.initialize(mockContainer);
      expect(() => gameScene.render()).not.toThrow();
    });

    it('should handle render before initialization', () => {
      expect(() => gameScene.render()).not.toThrow();
    });
  });

  describe('resize handling', () => {
    it('should resize properly', () => {
      gameScene.initialize(mockContainer);
      expect(() => gameScene.resize(1024, 768)).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      gameScene.initialize(mockContainer);
      expect(() => gameScene.dispose()).not.toThrow();
    });

    it('should handle disposal without initialization', () => {
      expect(() => gameScene.dispose()).not.toThrow();
    });
  });
});