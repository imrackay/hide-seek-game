/**
 * @jest-environment jsdom
 */

import { PlayerManager } from '../PlayerManager';
import { Player } from '@/types';

// Mock GameEngine
const mockGameEngine = {
  addPlayer: jest.fn(),
  removePlayer: jest.fn(),
  updatePlayerPosition: jest.fn(),
  updatePlayerRotation: jest.fn(),
  setPlayerCamouflage: jest.fn(),
  players: new Map(),
};

// Mock NetworkManager
const mockNetworkManager = {
  on: jest.fn(),
  setPlayerId: jest.fn(),
  updatePosition: jest.fn(),
  updateCamouflage: jest.fn(),
};

describe('PlayerManager', () => {
  let playerManager: PlayerManager;
  let mockPlayer: Player;

  beforeEach(() => {
    jest.clearAllMocks();
    playerManager = new PlayerManager(mockGameEngine as any, mockNetworkManager as any);
    
    mockPlayer = {
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
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(() => playerManager.initialize()).not.toThrow();
    });

    it('should set up network event handlers', () => {
      playerManager.initialize();
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerJoined', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerLeft', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerPositionUpdated', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerRoleChanged', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerCamouflageChanged', expect.any(Function));
    });

    it('should not initialize twice', () => {
      playerManager.initialize();
      playerManager.initialize();
      // Should only call network setup once
      expect(mockNetworkManager.on).toHaveBeenCalledTimes(5);
    });
  });

  describe('player management', () => {
    beforeEach(() => {
      playerManager.initialize();
    });

    it('should handle player joined', () => {
      const eventHandler = jest.fn();
      playerManager.on('playerSpawned', eventHandler);

      // Simulate network event
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      expect(mockGameEngine.addPlayer).toHaveBeenCalledWith(expect.objectContaining({
        id: 'player1',
        username: 'testuser'
      }));
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        id: 'player1'
      }));
    });

    it('should handle player left', () => {
      const eventHandler = jest.fn();
      playerManager.on('playerDespawned', eventHandler);

      // First add player
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      // Then remove player
      const leftHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerLeft')[1];
      leftHandler('player1');

      expect(mockGameEngine.removePlayer).toHaveBeenCalledWith('player1');
      expect(eventHandler).toHaveBeenCalledWith('player1');
    });

    it('should handle position updates', () => {
      const eventHandler = jest.fn();
      playerManager.on('playerMoved', eventHandler);

      // First add player
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      // Then update position
      const positionHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerPositionUpdated')[1];
      const newPosition = { x: 10, y: 0, z: 5 };
      positionHandler('player1', newPosition, Math.PI / 2);

      expect(mockGameEngine.updatePlayerPosition).toHaveBeenCalledWith('player1', newPosition);
      expect(mockGameEngine.updatePlayerRotation).toHaveBeenCalledWith('player1', Math.PI / 2);
      expect(eventHandler).toHaveBeenCalledWith('player1', newPosition, Math.PI / 2);
    });

    it('should handle role changes', () => {
      const eventHandler = jest.fn();
      playerManager.on('playerRoleChanged', eventHandler);

      // First add player
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      // Mock avatar for role change
      const mockAvatar = { setRole: jest.fn() };
      mockGameEngine.players.set('player1', mockAvatar);

      // Then change role
      const roleHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerRoleChanged')[1];
      roleHandler('player1', 'seeker');

      expect(mockAvatar.setRole).toHaveBeenCalledWith('seeker');
      expect(eventHandler).toHaveBeenCalledWith('player1', 'seeker');
    });

    it('should handle camouflage changes', () => {
      const eventHandler = jest.fn();
      playerManager.on('playerCamouflageChanged', eventHandler);

      // First add player
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      // Then change camouflage
      const camouflageHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerCamouflageChanged')[1];
      camouflageHandler('player1', true, 'box');

      expect(mockGameEngine.setPlayerCamouflage).toHaveBeenCalledWith('player1', true, 'box');
      expect(eventHandler).toHaveBeenCalledWith('player1', true, 'box');
    });
  });

  describe('local player management', () => {
    beforeEach(() => {
      playerManager.initialize();
      // Add a player first
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);
    });

    it('should set local player', () => {
      playerManager.setLocalPlayer('player1');
      expect(playerManager.getLocalPlayerId()).toBe('player1');
      expect(mockNetworkManager.setPlayerId).toHaveBeenCalledWith('player1');
    });

    it('should get local player', () => {
      playerManager.setLocalPlayer('player1');
      const localPlayer = playerManager.getLocalPlayer();
      expect(localPlayer).toEqual(expect.objectContaining({
        id: 'player1',
        username: 'testuser'
      }));
    });

    it('should move local player', () => {
      playerManager.setLocalPlayer('player1');
      const newPosition = { x: 5, y: 0, z: 10 };
      
      playerManager.moveLocalPlayer(newPosition, Math.PI);

      expect(mockGameEngine.updatePlayerPosition).toHaveBeenCalledWith('player1', newPosition);
      expect(mockGameEngine.updatePlayerRotation).toHaveBeenCalledWith('player1', Math.PI);
      expect(mockNetworkManager.updatePosition).toHaveBeenCalledWith(newPosition, Math.PI);
    });

    it('should set local player camouflage', () => {
      playerManager.setLocalPlayer('player1');
      
      playerManager.setLocalPlayerCamouflage(true, 'cylinder');

      expect(mockGameEngine.setPlayerCamouflage).toHaveBeenCalledWith('player1', true, 'cylinder');
      expect(mockNetworkManager.updateCamouflage).toHaveBeenCalledWith(true, 'cylinder');
    });
  });

  describe('player queries', () => {
    beforeEach(() => {
      playerManager.initialize();
      
      // Add multiple players
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);
      joinHandler({
        ...mockPlayer,
        id: 'player2',
        username: 'seeker1',
        role: 'seeker'
      });
    });

    it('should get all players', () => {
      const players = playerManager.getAllPlayers();
      expect(players).toHaveLength(2);
      expect(players.map(p => p.id)).toContain('player1');
      expect(players.map(p => p.id)).toContain('player2');
    });

    it('should get player by id', () => {
      const player = playerManager.getPlayer('player1');
      expect(player).toEqual(expect.objectContaining({
        id: 'player1',
        username: 'testuser'
      }));
    });

    it('should get player count', () => {
      expect(playerManager.getPlayerCount()).toBe(2);
    });

    it('should get players by role', () => {
      const hiders = playerManager.getPlayersByRole('hider');
      const seekers = playerManager.getPlayersByRole('seeker');
      
      expect(hiders).toHaveLength(1);
      expect(seekers).toHaveLength(1);
      expect(hiders[0].id).toBe('player1');
      expect(seekers[0].id).toBe('player2');
    });
  });

  describe('spawn point management', () => {
    it('should have default spawn points', () => {
      const spawnPoints = playerManager.getSpawnPoints();
      expect(spawnPoints.length).toBeGreaterThan(0);
    });

    it('should add spawn point', () => {
      const initialCount = playerManager.getSpawnPoints().length;
      playerManager.addSpawnPoint({ x: 20, y: 0, z: 20 });
      
      expect(playerManager.getSpawnPoints()).toHaveLength(initialCount + 1);
    });

    it('should remove spawn point', () => {
      const initialCount = playerManager.getSpawnPoints().length;
      playerManager.removeSpawnPoint(0);
      
      expect(playerManager.getSpawnPoints()).toHaveLength(initialCount - 1);
    });
  });

  describe('event handling', () => {
    it('should register event handlers', () => {
      const handler = jest.fn();
      expect(() => playerManager.on('playerSpawned', handler)).not.toThrow();
    });

    it('should remove event handlers', () => {
      const handler = jest.fn();
      playerManager.on('playerSpawned', handler);
      expect(() => playerManager.off('playerSpawned', handler)).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      playerManager.initialize();
      
      // Add a player
      const joinHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      joinHandler(mockPlayer);

      playerManager.dispose();

      expect(mockGameEngine.removePlayer).toHaveBeenCalledWith('player1');
      expect(playerManager.getPlayerCount()).toBe(0);
      expect(playerManager.getLocalPlayerId()).toBeNull();
    });
  });
});