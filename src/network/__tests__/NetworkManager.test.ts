/**
 * @jest-environment jsdom
 */

import { NetworkManager } from '../NetworkManager';
import { ConnectionState } from '../SocketManager';

// Mock SocketManager
const mockSocketManager = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  getConnectionState: jest.fn(),
  isConnected: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  updatePlayerPosition: jest.fn(),
  updatePlayerCamouflage: jest.fn(),
  sendChatMessage: jest.fn(),
  startGame: jest.fn(),
  endGame: jest.fn(),
};

jest.mock('../SocketManager', () => ({
  SocketManager: jest.fn(() => mockSocketManager),
  ConnectionState: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
  }
}));

describe('NetworkManager', () => {
  let networkManager: NetworkManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketManager.connect.mockResolvedValue(undefined);
    mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.DISCONNECTED);
    mockSocketManager.isConnected.mockReturnValue(false);
    
    networkManager = new NetworkManager('http://localhost:3001');
  });

  afterEach(() => {
    networkManager.disconnect();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      
      await expect(networkManager.initialize()).resolves.toBeUndefined();
      expect(mockSocketManager.connect).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const testError = new Error('Connection failed');
      mockSocketManager.connect.mockRejectedValue(testError);

      await expect(networkManager.initialize()).rejects.toThrow('Connection failed');
    });

    it('should not initialize twice', async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      
      await networkManager.initialize();
      await networkManager.initialize();

      expect(mockSocketManager.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('connection management', () => {
    beforeEach(async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      mockSocketManager.isConnected.mockReturnValue(true);
      await networkManager.initialize();
    });

    it('should connect if not initialized', async () => {
      const newManager = new NetworkManager();
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      
      await newManager.connect();
      expect(mockSocketManager.connect).toHaveBeenCalled();
    });

    it('should disconnect properly', () => {
      networkManager.disconnect();
      expect(mockSocketManager.disconnect).toHaveBeenCalled();
    });

    it('should return connection state', () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      expect(networkManager.getConnectionState()).toBe(ConnectionState.CONNECTED);
    });

    it('should return connection status', () => {
      mockSocketManager.isConnected.mockReturnValue(true);
      expect(networkManager.isConnected()).toBe(true);
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      await networkManager.initialize();
    });

    it('should register event handlers', () => {
      const handler = jest.fn();
      networkManager.on('playerJoined', handler);

      // Should not throw
      expect(() => networkManager.on('playerJoined', handler)).not.toThrow();
    });

    it('should remove event handlers', () => {
      const handler = jest.fn();
      networkManager.on('playerLeft', handler);
      networkManager.off('playerLeft', handler);

      // Should not throw
      expect(() => networkManager.off('playerLeft', handler)).not.toThrow();
    });
  });

  describe('room management', () => {
    beforeEach(async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      mockSocketManager.isConnected.mockReturnValue(true);
      await networkManager.initialize();
    });

    it('should join room when connected', async () => {
      await networkManager.joinRoom('ROOM123');
      expect(mockSocketManager.joinRoom).toHaveBeenCalledWith('ROOM123');
    });

    it('should throw error when joining room while disconnected', async () => {
      mockSocketManager.isConnected.mockReturnValue(false);
      
      await expect(networkManager.joinRoom('ROOM123')).rejects.toThrow('Not connected to server');
    });

    it('should leave room', () => {
      // Simulate being in a room
      networkManager['currentRoomCode'] = 'ROOM123';
      
      networkManager.leaveRoom();
      expect(mockSocketManager.leaveRoom).toHaveBeenCalled();
    });

    it('should return current room code', () => {
      networkManager['currentRoomCode'] = 'ROOM123';
      expect(networkManager.getCurrentRoomCode()).toBe('ROOM123');
    });
  });

  describe('player actions', () => {
    beforeEach(async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      mockSocketManager.isConnected.mockReturnValue(true);
      await networkManager.initialize();
    });

    it('should update position when connected', () => {
      const position = { x: 10, y: 0, z: 5 };
      const rotation = Math.PI / 2;
      
      networkManager.updatePosition(position, rotation);
      expect(mockSocketManager.updatePlayerPosition).toHaveBeenCalledWith(position, rotation);
    });

    it('should not update position when disconnected', () => {
      mockSocketManager.isConnected.mockReturnValue(false);
      
      const position = { x: 10, y: 0, z: 5 };
      networkManager.updatePosition(position);
      
      expect(mockSocketManager.updatePlayerPosition).not.toHaveBeenCalled();
    });

    it('should update camouflage when connected', () => {
      networkManager.updateCamouflage(true, 'box');
      expect(mockSocketManager.updatePlayerCamouflage).toHaveBeenCalledWith(true, 'box');
    });

    it('should send chat message when connected', () => {
      networkManager.sendChatMessage('Hello world!');
      expect(mockSocketManager.sendChatMessage).toHaveBeenCalledWith('Hello world!');
    });
  });

  describe('game actions', () => {
    beforeEach(async () => {
      mockSocketManager.getConnectionState.mockReturnValue(ConnectionState.CONNECTED);
      mockSocketManager.isConnected.mockReturnValue(true);
      await networkManager.initialize();
    });

    it('should start game when connected', () => {
      networkManager.startGame();
      expect(mockSocketManager.startGame).toHaveBeenCalled();
    });

    it('should end game when connected', () => {
      networkManager.endGame();
      expect(mockSocketManager.endGame).toHaveBeenCalled();
    });

    it('should not start game when disconnected', () => {
      mockSocketManager.isConnected.mockReturnValue(false);
      
      networkManager.startGame();
      expect(mockSocketManager.startGame).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should set and get player ID', () => {
      networkManager.setPlayerId('player123');
      expect(networkManager.getPlayerId()).toBe('player123');
    });

    it('should return socket manager', () => {
      expect(networkManager.getSocketManager()).toBe(mockSocketManager);
    });
  });
});