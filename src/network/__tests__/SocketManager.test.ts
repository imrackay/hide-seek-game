/**
 * @jest-environment jsdom
 */

import { SocketManager, ConnectionState } from '../SocketManager';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: false,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('SocketManager', () => {
  let socketManager: SocketManager;

  beforeEach(() => {
    jest.clearAllMocks();
    socketManager = new SocketManager('http://localhost:3001');
  });

  afterEach(() => {
    socketManager.disconnect();
  });

  describe('connection management', () => {
    it('should initialize with disconnected state', () => {
      expect(socketManager.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(socketManager.isConnected()).toBe(false);
    });

    it('should create socket when connecting', () => {
      const { io } = require('socket.io-client');
      socketManager.connect();
      expect(io).toHaveBeenCalledWith('http://localhost:3001', expect.any(Object));
    });

    it('should disconnect properly', () => {
      // First set up a socket
      socketManager['socket'] = mockSocket;
      socketManager.disconnect();
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(socketManager.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('event handling', () => {
    it('should register event handlers', () => {
      const handler = jest.fn();
      expect(() => socketManager.on('player_joined', handler)).not.toThrow();
    });

    it('should remove event handlers', () => {
      const handler = jest.fn();
      socketManager.on('player_left', handler);
      expect(() => socketManager.off('player_left', handler)).not.toThrow();
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      expect(() => {
        socketManager.on('game_started', handler1);
        socketManager.on('game_started', handler2);
      }).not.toThrow();
    });
  });

  describe('message emission', () => {
    it('should not emit messages when disconnected', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      socketManager.emit('test_event', { test: 'data' });
      expect(consoleSpy).toHaveBeenCalledWith('Cannot emit test_event: Socket not connected');
      consoleSpy.mockRestore();
    });

    it('should emit messages when socket exists and connected', () => {
      // Set up connected socket
      socketManager['socket'] = mockSocket;
      socketManager['connectionState'] = ConnectionState.CONNECTED;
      
      const testData = { test: 'data' };
      socketManager.emit('test_event', testData);

      expect(mockSocket.emit).toHaveBeenCalledWith('test_event', testData);
    });
  });

  describe('game-specific methods', () => {
    beforeEach(() => {
      // Set up connected socket
      socketManager['socket'] = mockSocket;
      socketManager['connectionState'] = ConnectionState.CONNECTED;
      jest.clearAllMocks();
    });

    it('should join room', () => {
      socketManager.joinRoom('ROOM123');
      expect(mockSocket.emit).toHaveBeenCalledWith('join_room', { roomCode: 'ROOM123' });
    });

    it('should leave room', () => {
      socketManager.leaveRoom();
      expect(mockSocket.emit).toHaveBeenCalledWith('leave_room', undefined);
    });

    it('should update player position', () => {
      const position = { x: 10, y: 0, z: 5 };
      const rotation = Math.PI / 2;
      
      socketManager.updatePlayerPosition(position, rotation);
      expect(mockSocket.emit).toHaveBeenCalledWith('update_position', { position, rotation });
    });

    it('should update player camouflage', () => {
      socketManager.updatePlayerCamouflage(true, 'box');
      expect(mockSocket.emit).toHaveBeenCalledWith('update_camouflage', { isActive: true, objectType: 'box' });
    });

    it('should send chat message', () => {
      socketManager.sendChatMessage('Hello world!');
      expect(mockSocket.emit).toHaveBeenCalledWith('chat_message', { message: 'Hello world!' });
    });

    it('should start game', () => {
      socketManager.startGame();
      expect(mockSocket.emit).toHaveBeenCalledWith('start_game', undefined);
    });

    it('should end game', () => {
      socketManager.endGame();
      expect(mockSocket.emit).toHaveBeenCalledWith('end_game', undefined);
    });
  });
});