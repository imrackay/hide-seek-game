/**
 * @jest-environment jsdom
 */

import { GameStateManager } from '../GameStateManager';
import { GameSettings } from '@/types';

// Mock PlayerManager
const mockPlayerManager = {
  getLocalPlayerId: jest.fn(() => 'localPlayer'),
  getAllPlayers: jest.fn(() => []),
  getPlayersByRole: jest.fn(() => []),
  getPlayer: jest.fn(),
};

// Mock NetworkManager
const mockNetworkManager = {
  on: jest.fn(),
  startGame: jest.fn(),
  endGame: jest.fn(),
};

// Mock timers
jest.useFakeTimers();

describe('GameStateManager', () => {
  let gameStateManager: GameStateManager;
  let mockSettings: GameSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    gameStateManager = new GameStateManager(mockPlayerManager as any, mockNetworkManager as any);
    
    mockSettings = {
      maxPlayers: 4,
      hidingTime: 60,
      seekingTime: 120,
      mapId: 'testMap'
    };

    mockPlayerManager.getAllPlayers.mockReturnValue([
      { id: 'player1', username: 'user1', role: 'hider' },
      { id: 'player2', username: 'user2', role: 'seeker' }
    ]);
  });

  afterEach(() => {
    gameStateManager.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(() => gameStateManager.initialize(true)).not.toThrow();
    });

    it('should set up network event handlers', () => {
      gameStateManager.initialize();
      
      expect(mockNetworkManager.on).toHaveBeenCalledWith('gameStateUpdated', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('gameStarted', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('gameEnded', expect.any(Function));
      expect(mockNetworkManager.on).toHaveBeenCalledWith('phaseChanged', expect.any(Function));
    });
  });

  describe('session creation', () => {
    beforeEach(() => {
      gameStateManager.initialize(true);
    });

    it('should create game session successfully', () => {
      const session = gameStateManager.createGameSession(mockSettings, 'ROOM123');
      
      expect(session).toEqual(expect.objectContaining({
        roomCode: 'ROOM123',
        settings: mockSettings,
        createdBy: 'localPlayer'
      }));
    });

    it('should throw error when no local player set', () => {
      mockPlayerManager.getLocalPlayerId.mockReturnValue(null);
      
      expect(() => gameStateManager.createGameSession(mockSettings, 'ROOM123')).toThrow('No local player set');
    });
  });

  describe('game lifecycle', () => {
    beforeEach(() => {
      gameStateManager.initialize(true);
      mockPlayerManager.getLocalPlayerId.mockReturnValue('localPlayer');
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
    });

    it('should start game successfully', () => {
      const result = gameStateManager.startGame();
      
      expect(result).toBe(true);
      expect(gameStateManager.getCurrentPhase()).toBe('hiding');
      expect(gameStateManager.getTimeRemaining()).toBe(60);
      expect(mockNetworkManager.startGame).toHaveBeenCalled();
    });

    it('should not start game when not host', () => {
      gameStateManager.dispose();
      gameStateManager = new GameStateManager(mockPlayerManager as any, mockNetworkManager as any);
      gameStateManager.initialize(false); // not host
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
      
      const result = gameStateManager.startGame();
      
      expect(result).toBe(false);
    });

    it('should not start game with insufficient players', () => {
      mockPlayerManager.getAllPlayers.mockReturnValue([{ id: 'player1', username: 'user1', role: 'hider' }]);
      
      const result = gameStateManager.startGame();
      
      expect(result).toBe(false);
    });

    it('should transition from hiding to seeking phase', () => {
      const phaseHandler = jest.fn();
      gameStateManager.on('phaseChanged', phaseHandler);
      
      gameStateManager.startGame();
      
      // Fast-forward through hiding phase
      jest.advanceTimersByTime(60000);
      
      expect(gameStateManager.getCurrentPhase()).toBe('seeking');
      expect(gameStateManager.getTimeRemaining()).toBe(120);
      expect(phaseHandler).toHaveBeenCalledWith('seeking', 120);
    });

    it('should end game when seeking time expires', () => {
      const gameEndHandler = jest.fn();
      gameStateManager.on('gameEnded', gameEndHandler);
      
      gameStateManager.startGame();
      
      // Fast-forward through both phases
      jest.advanceTimersByTime(180000); // 60s hiding + 120s seeking
      
      expect(gameStateManager.getCurrentPhase()).toBe('ended');
      expect(gameEndHandler).toHaveBeenCalledWith('hiders', expect.any(Object));
    });

    it('should end game manually', () => {
      const gameEndHandler = jest.fn();
      gameStateManager.on('gameEnded', gameEndHandler);
      
      gameStateManager.startGame();
      gameStateManager.endGame('seekers');
      
      expect(gameStateManager.getCurrentPhase()).toBe('ended');
      expect(gameEndHandler).toHaveBeenCalledWith('seekers', expect.any(Object));
    });
  });

  describe('player found reporting', () => {
    beforeEach(() => {
      gameStateManager.initialize(true);
      mockPlayerManager.getLocalPlayerId.mockReturnValue('localPlayer');
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
      
      mockPlayerManager.getPlayer.mockImplementation((id) => {
        const players = {
          'seeker1': { id: 'seeker1', username: 'seeker', role: 'seeker' },
          'hider1': { id: 'hider1', username: 'hider', role: 'hider' }
        };
        return players[id] || null;
      });
    });

    it('should report player found successfully', () => {
      const foundHandler = jest.fn();
      gameStateManager.on('playerFound', foundHandler);
      
      gameStateManager.startGame();
      // Skip to seeking phase
      jest.advanceTimersByTime(60000);
      
      const result = gameStateManager.reportPlayerFound('seeker1', 'hider1');
      
      expect(result).toBe(true);
      expect(foundHandler).toHaveBeenCalledWith('seeker1', 'hider1');
    });

    it('should not report player found during hiding phase', () => {
      gameStateManager.startGame();
      
      const result = gameStateManager.reportPlayerFound('seeker1', 'hider1');
      
      expect(result).toBe(false);
    });

    it('should not report player found with invalid roles', () => {
      mockPlayerManager.getPlayer.mockImplementation((id) => {
        return { id, username: 'user', role: 'hider' }; // Both hiders
      });
      
      gameStateManager.startGame();
      jest.advanceTimersByTime(60000); // Skip to seeking
      
      const result = gameStateManager.reportPlayerFound('hider1', 'hider2');
      
      expect(result).toBe(false);
    });
  });

  describe('state queries', () => {
    beforeEach(() => {
      gameStateManager.initialize(true);
      mockPlayerManager.getLocalPlayerId.mockReturnValue('localPlayer');
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
    });

    it('should return current state', () => {
      const state = gameStateManager.getCurrentState();
      
      expect(state).toEqual(expect.objectContaining({
        phase: 'waiting',
        timeRemaining: 0
      }));
    });

    it('should return current session', () => {
      const session = gameStateManager.getCurrentSession();
      
      expect(session).toEqual(expect.objectContaining({
        roomCode: 'ROOM123',
        settings: mockSettings
      }));
    });

    it('should check game status correctly', () => {
      expect(gameStateManager.isWaitingForPlayers()).toBe(true);
      expect(gameStateManager.isGameActive()).toBe(false);
      expect(gameStateManager.isGameEnded()).toBe(false);
      
      gameStateManager.startGame();
      
      expect(gameStateManager.isWaitingForPlayers()).toBe(false);
      expect(gameStateManager.isGameActive()).toBe(true);
      expect(gameStateManager.isGameEnded()).toBe(false);
      
      gameStateManager.endGame();
      
      expect(gameStateManager.isWaitingForPlayers()).toBe(false);
      expect(gameStateManager.isGameActive()).toBe(false);
      expect(gameStateManager.isGameEnded()).toBe(true);
    });

    it('should calculate game duration', () => {
      gameStateManager.startGame();
      
      // Mock time passage
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 30000); // 30 seconds later
      
      const duration = gameStateManager.getGameDuration();
      expect(duration).toBeGreaterThan(0);
      
      Date.now = originalNow;
    });
  });

  describe('event handling', () => {
    it('should register and remove event handlers', () => {
      const handler = jest.fn();
      
      gameStateManager.on('gameStarted', handler);
      gameStateManager.off('gameStarted', handler);
      
      // Should not throw
      expect(() => gameStateManager.initialize()).not.toThrow();
    });

    it('should emit events correctly', () => {
      const stateHandler = jest.fn();
      const phaseHandler = jest.fn();
      const startHandler = jest.fn();
      
      gameStateManager.on('stateChanged', stateHandler);
      gameStateManager.on('phaseChanged', phaseHandler);
      gameStateManager.on('gameStarted', startHandler);
      
      gameStateManager.initialize(true);
      mockPlayerManager.getLocalPlayerId.mockReturnValue('localPlayer');
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
      gameStateManager.startGame();
      
      expect(stateHandler).toHaveBeenCalled();
      expect(phaseHandler).toHaveBeenCalledWith('hiding', 60);
      expect(startHandler).toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      gameStateManager.initialize(true);
      mockPlayerManager.getLocalPlayerId.mockReturnValue('localPlayer');
      gameStateManager.createGameSession(mockSettings, 'ROOM123');
      gameStateManager.startGame();
      
      expect(() => gameStateManager.dispose()).not.toThrow();
      
      expect(gameStateManager.getCurrentState()).toBeNull();
      expect(gameStateManager.getCurrentSession()).toBeNull();
    });
  });
});