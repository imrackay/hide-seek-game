/**
 * @jest-environment jsdom
 */

import { PlayerSynchronizer } from '../PlayerSynchronizer';
import { PlayerManager } from '../PlayerManager';

// Mock PlayerManager
const mockPlayerManager = {
  getLocalPlayerId: jest.fn(() => 'localPlayer'),
  getPlayer: jest.fn(),
  gameEngine: {
    updatePlayerPosition: jest.fn(),
    updatePlayerRotation: jest.fn(),
  }
};

// Mock timers
jest.useFakeTimers();

describe('PlayerSynchronizer', () => {
  let synchronizer: PlayerSynchronizer;

  beforeEach(() => {
    jest.clearAllMocks();
    synchronizer = new PlayerSynchronizer(mockPlayerManager as any);
    
    mockPlayerManager.getPlayer.mockReturnValue({
      id: 'player1',
      position: { x: 0, y: 0, z: 0 }
    });
  });

  afterEach(() => {
    synchronizer.dispose();
    jest.clearAllTimers();
  });

  describe('lifecycle', () => {
    it('should start and stop properly', () => {
      expect(() => synchronizer.start()).not.toThrow();
      expect(() => synchronizer.stop()).not.toThrow();
    });

    it('should not start twice', () => {
      synchronizer.start();
      synchronizer.start();
      // Should not throw or cause issues
      expect(() => synchronizer.stop()).not.toThrow();
    });
  });

  describe('sync data management', () => {
    it('should add sync data', () => {
      const position = { x: 10, y: 0, z: 5 };
      expect(() => synchronizer.addSyncData('player1', position, Math.PI)).not.toThrow();
    });

    it('should handle multiple sync data points', () => {
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      synchronizer.addSyncData('player1', { x: 5, y: 0, z: 0 });
      synchronizer.addSyncData('player1', { x: 10, y: 0, z: 0 });
      
      // Should not throw and should manage buffer internally
      expect(() => synchronizer.addSyncData('player1', { x: 15, y: 0, z: 0 })).not.toThrow();
    });

    it('should limit buffer size', () => {
      // Add more than max buffer size
      for (let i = 0; i < 15; i++) {
        synchronizer.addSyncData('player1', { x: i, y: 0, z: 0 });
      }
      
      // Should not cause memory issues
      expect(() => synchronizer.addSyncData('player1', { x: 20, y: 0, z: 0 })).not.toThrow();
    });
  });

  describe('interpolation', () => {
    beforeEach(() => {
      // Set up some sync data with timestamps
      const baseTime = Date.now();
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      
      // Mock Date.now to return predictable timestamps
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(baseTime)
        .mockReturnValueOnce(baseTime + 100)
        .mockReturnValueOnce(baseTime + 200);
        
      synchronizer.addSyncData('player1', { x: 10, y: 0, z: 0 });
    });

    it('should handle interpolation updates', () => {
      synchronizer.start();
      
      // Fast-forward time to trigger updates
      jest.advanceTimersByTime(50);
      
      // Should not throw during interpolation
      expect(() => jest.advanceTimersByTime(50)).not.toThrow();
    });

    it('should skip local player interpolation', () => {
      mockPlayerManager.getLocalPlayerId.mockReturnValue('player1');
      
      synchronizer.start();
      jest.advanceTimersByTime(100);
      
      // Local player should not be interpolated
      expect(mockPlayerManager.gameEngine.updatePlayerPosition).not.toHaveBeenCalled();
    });
  });

  describe('prediction', () => {
    it('should predict local player movement', () => {
      const velocity = { x: 1, y: 0, z: 0 };
      const deltaTime = 0.016; // ~60fps
      
      const predicted = synchronizer.predictLocalPlayerMovement('player1', velocity, deltaTime);
      
      expect(predicted).toEqual({
        x: 0.016,
        y: 0,
        z: 0
      });
    });

    it('should return zero vector for non-existent player', () => {
      mockPlayerManager.getPlayer.mockReturnValue(null);
      
      const predicted = synchronizer.predictLocalPlayerMovement('nonexistent', { x: 1, y: 0, z: 0 }, 0.016);
      
      expect(predicted).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe('lag compensation', () => {
    it('should get player position at specific time', () => {
      const baseTime = Date.now();
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      
      const position = synchronizer.getPlayerPositionAtTime('player1', baseTime);
      expect(position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should return current position for player without sync data', () => {
      const position = synchronizer.getPlayerPositionAtTime('player1', Date.now());
      expect(position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should return null for non-existent player', () => {
      mockPlayerManager.getPlayer.mockReturnValue(null);
      
      const position = synchronizer.getPlayerPositionAtTime('nonexistent', Date.now());
      expect(position).toBeNull();
    });
  });

  describe('data cleanup', () => {
    it('should clean up old data', () => {
      // Add some old data
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      
      // Clean up data older than 1ms
      expect(() => synchronizer.cleanupOldData(1)).not.toThrow();
    });

    it('should remove players with no recent data', () => {
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      
      // Clean up all data
      synchronizer.cleanupOldData(0);
      
      const stats = synchronizer.getSyncStats('player1');
      expect(stats).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should return sync stats for player with data', () => {
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      synchronizer.addSyncData('player1', { x: 5, y: 0, z: 0 });
      
      const stats = synchronizer.getSyncStats('player1');
      
      expect(stats).toEqual(expect.objectContaining({
        bufferSize: 2,
        latestTimestamp: expect.any(Number),
        oldestTimestamp: expect.any(Number),
        averageDelay: expect.any(Number)
      }));
    });

    it('should return null for player without data', () => {
      const stats = synchronizer.getSyncStats('nonexistent');
      expect(stats).toBeNull();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      synchronizer.start();
      synchronizer.addSyncData('player1', { x: 0, y: 0, z: 0 });
      
      expect(() => synchronizer.dispose()).not.toThrow();
      
      // Should stop running
      const stats = synchronizer.getSyncStats('player1');
      expect(stats).toBeNull();
    });
  });
});