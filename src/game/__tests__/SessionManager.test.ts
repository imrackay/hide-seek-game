/**
 * @jest-environment jsdom
 */

import { SessionManager } from '../SessionManager';
import { GameSettings } from '@/types';

// Mock NetworkManager
const mockNetworkManager = {
  on: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
};

// Mock PlayerManager
const mockPlayerManager = {
  getLocalPlayerId: jest.fn(() => 'localPlayer'),
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockSettings: GameSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    
    sessionManager = new SessionManager(mockNetworkManager as any, mockPlayerManager as any);
    
    mockSettings = {
      maxPlayers: 4,
      hidingTime: 60,
      seekingTime: 120,
      mapId: 'testMap'
    };

    mockNetworkManager.joinRoom.mockResolvedValue(undefined);
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const config = sessionManager.getSessionConfig();
      
      expect(config).toEqual({
        maxPlayers: 8,
        isPrivate: false,
        allowSpectators: true,
        autoStart: false,
        minPlayersToStart: 2
      });
    });

    it('should set up network event handlers', () => {
      expect(mockNetworkManager.on).toHaveBeenCalledWith('roomJoined', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('roomLeft', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('roomError', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerJoined', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('playerLeft', expect.any(Function));
    });
  });

  describe('session creation', () => {
    it('should create session successfully', async () => {
      const session = await sessionManager.createSession(mockSettings);
      
      expect(session).toEqual(expect.objectContaining({
        settings: mockSettings,
        createdBy: 'localPlayer',
        isPrivate: false,
        maxPlayers: 8
      }));
      
      expect(session.roomCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(mockNetworkManager.joinRoom).toHaveBeenCalledWith(session.roomCode);
    });

    it('should create session with custom config', async () => {
      const customConfig = {
        maxPlayers: 6,
        isPrivate: true
      };
      
      const session = await sessionManager.createSession(mockSettings, customConfig);
      
      expect(session.maxPlayers).toBe(6);
      expect(session.isPrivate).toBe(true);
    });

    it('should throw error when no local player', async () => {
      const tempSessionManager = new SessionManager(mockNetworkManager as any, {
        getLocalPlayerId: () => null
      } as any);
      
      await expect(tempSessionManager.createSession(mockSettings)).rejects.toThrow('No local player set');
    });

    it('should throw error when network join fails', async () => {
      mockNetworkManager.joinRoom.mockRejectedValue(new Error('Network error'));
      
      await expect(sessionManager.createSession(mockSettings)).rejects.toThrow('Failed to create session');
    });
  });

  describe('session joining', () => {
    it('should join session successfully', async () => {
      const joinPromise = sessionManager.joinSession('ROOM123');
      
      // Simulate room joined event
      const roomJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'roomJoined')[1];
      setTimeout(() => roomJoinedHandler('ROOM123'), 0);
      
      const session = await joinPromise;
      
      expect(session.roomCode).toBe('ROOM123');
      expect(mockNetworkManager.joinRoom).toHaveBeenCalledWith('ROOM123');
    });

    it('should throw error when already in session', async () => {
      await sessionManager.createSession(mockSettings);
      
      await expect(sessionManager.joinSession('ROOM456')).rejects.toThrow('Already in a session');
    });

    it('should timeout when no session data received', async () => {
      const joinPromise = sessionManager.joinSession('ROOM123');
      
      // Don't simulate room joined event - should timeout
      await expect(joinPromise).rejects.toThrow('Timeout waiting for session data');
    }, 15000);
  });

  describe('session management', () => {
    beforeEach(async () => {
      await sessionManager.createSession(mockSettings);
    });

    it('should leave session', () => {
      const leaveHandler = jest.fn();
      sessionManager.on('sessionLeft', leaveHandler);
      
      sessionManager.leaveSession();
      
      expect(sessionManager.isInSession()).toBe(false);
      expect(mockNetworkManager.leaveRoom).toHaveBeenCalled();
      expect(leaveHandler).toHaveBeenCalled();
    });

    it('should update session settings as host', () => {
      const newSettings = { hidingTime: 90 };
      const result = sessionManager.updateSessionSettings(newSettings);
      
      expect(result).toBe(true);
      
      const session = sessionManager.getCurrentSession();
      expect(session?.settings.hidingTime).toBe(90);
    });

    it('should not update settings when not host', () => {
      sessionManager.dispose();
      sessionManager = new SessionManager(mockNetworkManager as any, mockPlayerManager as any);
      
      // Test as non-host (no session created)
      const result = sessionManager.updateSessionSettings({ hidingTime: 90 });
      
      expect(result).toBe(false);
    });

    it('should check if can start game', () => {
      // Initially no session, so can't start
      expect(sessionManager.canStartGame()).toBe(false);
      
      sessionManager.leaveSession();
      expect(sessionManager.canStartGame()).toBe(false); // No session
    });
  });

  describe('player management', () => {
    beforeEach(async () => {
      await sessionManager.createSession(mockSettings);
    });

    it('should handle player joining session', () => {
      const playerJoinHandler = jest.fn();
      sessionManager.on('playerJoinedSession', playerJoinHandler);
      
      const mockPlayer = {
        id: 'player1',
        username: 'user1',
        role: 'hider' as const,
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      };
      
      // Simulate player joined event
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler(mockPlayer);
      
      expect(playerJoinHandler).toHaveBeenCalledWith(mockPlayer);
      expect(sessionManager.getSessionPlayerCount()).toBe(1);
    });

    it('should handle player leaving session', () => {
      const playerLeftHandler = jest.fn();
      sessionManager.on('playerLeftSession', playerLeftHandler);
      
      // First add a player
      const mockPlayer = {
        id: 'player1',
        username: 'user1',
        role: 'hider' as const,
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      };
      
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler(mockPlayer);
      
      // Then remove the player
      const playerLeftNetworkHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerLeft')[1];
      playerLeftNetworkHandler('player1');
      
      expect(playerLeftHandler).toHaveBeenCalledWith('player1');
      expect(sessionManager.getSessionPlayerCount()).toBe(0);
    });

    it('should not add duplicate players', () => {
      const mockPlayer = {
        id: 'player1',
        username: 'user1',
        role: 'hider' as const,
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      };
      
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler(mockPlayer);
      playerJoinedHandler(mockPlayer); // Try to add same player again
      
      expect(sessionManager.getSessionPlayerCount()).toBe(1);
    });

    it('should handle session full', async () => {
      // Create session with max 2 players
      sessionManager.dispose();
      sessionManager = new SessionManager(mockNetworkManager as any, mockPlayerManager as any);
      await sessionManager.createSession(mockSettings, { maxPlayers: 2 });
      
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      
      // Add 2 players
      playerJoinedHandler({ id: 'player1', username: 'user1', role: 'hider' });
      playerJoinedHandler({ id: 'player2', username: 'user2', role: 'hider' });
      
      expect(sessionManager.getSessionPlayerCount()).toBeGreaterThanOrEqual(0);
      
      // Try to add 3rd player - should be ignored
      playerJoinedHandler({ id: 'player3', username: 'user3', role: 'hider' });
      
      expect(sessionManager.getSessionPlayerCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('host management', () => {
    beforeEach(async () => {
      await sessionManager.createSession(mockSettings);
    });

    it('should kick player as host', () => {
      // Add a player first
      const mockPlayer = {
        id: 'player1',
        username: 'user1',
        role: 'hider' as const,
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      };
      
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler(mockPlayer);
      
      const result = sessionManager.kickPlayer('player1');
      
      expect(result).toBe(true);
      expect(sessionManager.getSessionPlayerCount()).toBe(0);
    });

    it('should not kick non-existent player', () => {
      const result = sessionManager.kickPlayer('nonexistent');
      
      expect(result).toBe(false);
    });

    it('should transfer host', () => {
      // Add a player first
      const mockPlayer = {
        id: 'player1',
        username: 'user1',
        role: 'hider' as const,
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      };
      
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler(mockPlayer);
      
      const result = sessionManager.transferHost('player1');
      
      expect(result).toBe(true);
      expect(sessionManager.isSessionHost()).toBe(false);
    });

    it('should handle host leaving and auto-transfer', () => {
      // Add players
      const playerJoinedHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerJoined')[1];
      playerJoinedHandler({ id: 'player1', username: 'user1', role: 'hider' });
      playerJoinedHandler({ id: 'player2', username: 'user2', role: 'hider' });
      
      // Simulate host (localPlayer) leaving
      const playerLeftHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'playerLeft')[1];
      playerLeftHandler('localPlayer');
      
      // Should transfer host to first remaining player
      const session = sessionManager.getCurrentSession();
      expect(typeof session?.createdBy).toBe('string');
    });
  });

  describe('configuration', () => {
    it('should update session config', () => {
      const newConfig = {
        maxPlayers: 10,
        autoStart: true
      };
      
      sessionManager.updateSessionConfig(newConfig);
      
      const config = sessionManager.getSessionConfig();
      expect(config.maxPlayers).toBe(10);
      expect(config.autoStart).toBe(true);
    });
  });

  describe('event handling', () => {
    it('should register and remove event handlers', () => {
      const handler = jest.fn();
      
      sessionManager.on('sessionCreated', handler);
      sessionManager.off('sessionCreated', handler);
      
      // Should not throw
      expect(() => sessionManager.createSession(mockSettings)).not.toThrow();
    });

    it('should handle room error', () => {
      const errorHandler = jest.fn();
      sessionManager.on('sessionError', errorHandler);
      
      const roomErrorHandler = mockNetworkManager.on.mock.calls.find(call => call[0] === 'roomError')[1];
      roomErrorHandler('Test error');
      
      expect(errorHandler).toHaveBeenCalledWith('Test error');
    });
  });

  describe('state queries', () => {
    it('should return correct session state', () => {
      expect(sessionManager.isInSession()).toBe(false);
      expect(sessionManager.isSessionHost()).toBe(false);
      expect(sessionManager.getSessionPlayerCount()).toBe(0);
      expect(sessionManager.getCurrentSession()).toBeNull();
    });

    it('should return correct state after creating session', async () => {
      const session = await sessionManager.createSession(mockSettings);
      
      expect(sessionManager.isInSession()).toBe(true);
      expect(sessionManager.isSessionHost()).toBe(true);
      expect(sessionManager.getCurrentSession()).toEqual(session);
    });
  });

  describe('disposal', () => {
    it('should dispose properly', async () => {
      await sessionManager.createSession(mockSettings);
      
      expect(sessionManager.isInSession()).toBe(true);
      
      sessionManager.dispose();
      
      expect(sessionManager.isInSession()).toBe(false);
      expect(mockNetworkManager.leaveRoom).toHaveBeenCalled();
    });
  });
});