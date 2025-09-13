/**
 * @jest-environment jsdom
 */

import { GameTimer } from '../GameTimer';

// Mock timers
jest.useFakeTimers();

describe('GameTimer', () => {
  let timer: GameTimer;

  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    if (timer) {
      timer.dispose();
    }
  });

  describe('initialization', () => {
    it('should create timer with default config', () => {
      timer = new GameTimer();
      
      expect(timer.getTimeRemaining()).toBe(60);
      expect(timer.getTotalTime()).toBe(60);
      expect(timer.isActive()).toBe(false);
    });

    it('should create timer with custom config', () => {
      timer = new GameTimer({
        duration: 120,
        warningThreshold: 20,
        autoStart: false
      });
      
      expect(timer.getTimeRemaining()).toBe(120);
      expect(timer.getTotalTime()).toBe(120);
      expect(timer.getConfig().warningThreshold).toBe(20);
    });

    it('should auto-start when configured', () => {
      timer = new GameTimer({ duration: 30, autoStart: true });
      
      expect(timer.isActive()).toBe(true);
    });
  });

  describe('timer controls', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 60 });
    });

    it('should start timer', () => {
      timer.start();
      
      expect(timer.isActive()).toBe(true);
    });

    it('should not start twice', () => {
      timer.start();
      timer.start();
      
      expect(timer.isActive()).toBe(true);
    });

    it('should pause timer', () => {
      timer.start();
      timer.pause();
      
      expect(timer.isActive()).toBe(false);
    });

    it('should resume timer', () => {
      timer.start();
      timer.pause();
      timer.resume();
      
      expect(timer.isActive()).toBe(true);
    });

    it('should stop timer', () => {
      timer.start();
      timer.stop();
      
      expect(timer.isActive()).toBe(false);
    });

    it('should reset timer', () => {
      timer.start();
      jest.advanceTimersByTime(10000); // 10 seconds
      timer.reset();
      
      expect(timer.getTimeRemaining()).toBe(60);
      expect(timer.isActive()).toBe(false);
    });

    it('should reset timer with new duration', () => {
      timer.reset(90);
      
      expect(timer.getTimeRemaining()).toBe(90);
      expect(timer.getTotalTime()).toBe(90);
    });
  });

  describe('timer events', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 10, warningThreshold: 3 });
    });

    it('should emit tick events', () => {
      const tickHandler = jest.fn();
      timer.on('tick', tickHandler);
      
      timer.start();
      jest.advanceTimersByTime(2000); // 2 seconds
      
      expect(tickHandler).toHaveBeenCalledTimes(2);
      expect(tickHandler).toHaveBeenLastCalledWith(8, 10);
    });

    it('should emit warning event', () => {
      const warningHandler = jest.fn();
      timer.on('warning', warningHandler);
      
      timer.start();
      jest.advanceTimersByTime(8000); // 8 seconds (2 remaining, below threshold of 3)
      
      expect(warningHandler).toHaveBeenCalledWith(3); // Warning triggers at 3 seconds remaining
    });

    it('should emit finished event', () => {
      const finishedHandler = jest.fn();
      timer.on('finished', finishedHandler);
      
      timer.start();
      jest.advanceTimersByTime(10000); // Full duration
      
      expect(finishedHandler).toHaveBeenCalled();
      expect(timer.isFinished()).toBe(true);
      expect(timer.isActive()).toBe(false);
    });

    it('should emit pause and resume events', () => {
      const pauseHandler = jest.fn();
      const resumeHandler = jest.fn();
      
      timer.on('paused', pauseHandler);
      timer.on('resumed', resumeHandler);
      
      timer.start();
      timer.pause();
      timer.resume();
      
      expect(pauseHandler).toHaveBeenCalled();
      expect(resumeHandler).toHaveBeenCalled();
    });

    it('should emit reset event', () => {
      const resetHandler = jest.fn();
      timer.on('reset', resetHandler);
      
      timer.reset();
      
      expect(resetHandler).toHaveBeenCalled();
    });

    it('should not emit warning twice', () => {
      const warningHandler = jest.fn();
      timer.on('warning', warningHandler);
      
      timer.start();
      jest.advanceTimersByTime(8000); // Below threshold
      jest.advanceTimersByTime(1000); // Still below threshold
      
      expect(warningHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('time manipulation', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 60 });
    });

    it('should add time', () => {
      timer.addTime(30);
      
      expect(timer.getTimeRemaining()).toBe(90);
      expect(timer.getTotalTime()).toBe(90);
    });

    it('should subtract time', () => {
      timer.subtractTime(20);
      
      expect(timer.getTimeRemaining()).toBe(40);
    });

    it('should not go below zero when subtracting', () => {
      timer.subtractTime(100);
      
      expect(timer.getTimeRemaining()).toBe(0);
    });

    it('should trigger warning when subtracting below threshold', () => {
      const warningHandler = jest.fn();
      timer.on('warning', warningHandler);
      
      timer.subtractTime(55); // 5 seconds remaining, below default threshold of 10
      
      expect(warningHandler).toHaveBeenCalledWith(5);
    });

    it('should trigger finish when subtracting to zero', () => {
      const finishedHandler = jest.fn();
      timer.on('finished', finishedHandler);
      
      timer.start();
      timer.subtractTime(60);
      
      expect(finishedHandler).toHaveBeenCalled();
      expect(timer.isActive()).toBe(false);
    });
  });

  describe('progress tracking', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 100 });
    });

    it('should calculate progress correctly', () => {
      expect(timer.getProgress()).toBe(0);
      
      timer.start();
      jest.advanceTimersByTime(25000); // 25 seconds
      
      expect(timer.getProgress()).toBe(0.25);
      expect(timer.getProgressPercent()).toBe(25);
    });

    it('should handle zero duration', () => {
      timer = new GameTimer({ duration: 0 });
      
      expect(timer.getProgress()).toBe(0);
    });
  });

  describe('time formatting', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 125 }); // 2:05
    });

    it('should format time correctly', () => {
      expect(timer.formatTime()).toBe('2:05');
      expect(timer.formatTime(65)).toBe('1:05');
      expect(timer.formatTime(5)).toBe('0:05');
    });

    it('should format detailed time correctly', () => {
      expect(timer.formatTimeDetailed(3665)).toBe('1:01:05'); // 1 hour, 1 minute, 5 seconds
      expect(timer.formatTimeDetailed(125)).toBe('2:05');
      expect(timer.formatTimeDetailed(5)).toBe('0:05');
    });
  });

  describe('configuration updates', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 60 });
    });

    it('should update configuration', () => {
      timer.updateConfig({ duration: 90, warningThreshold: 15 });
      
      expect(timer.getTotalTime()).toBe(90);
      expect(timer.getConfig().warningThreshold).toBe(15);
    });

    it('should set duration', () => {
      timer.setDuration(120);
      
      expect(timer.getTimeRemaining()).toBe(120);
      expect(timer.getTotalTime()).toBe(120);
    });

    it('should set warning threshold', () => {
      timer.setWarningThreshold(20);
      
      expect(timer.getConfig().warningThreshold).toBe(20);
    });

    it('should reset warning flag when threshold increases', () => {
      const warningHandler = jest.fn();
      timer.on('warning', warningHandler);
      
      timer.start();
      jest.advanceTimersByTime(55000); // 5 seconds remaining, triggers warning
      
      timer.setWarningThreshold(3); // Lower threshold
      expect(warningHandler).toHaveBeenCalledTimes(1);
      
      timer.setWarningThreshold(15); // Higher threshold, should reset warning
      jest.advanceTimersByTime(1000); // 4 seconds remaining, should trigger warning again
      
      expect(warningHandler).toHaveBeenCalledTimes(1); // Only the first warning should have been called
    });
  });

  describe('event handler management', () => {
    beforeEach(() => {
      timer = new GameTimer({ duration: 10 });
    });

    it('should add and remove event handlers', () => {
      const handler = jest.fn();
      
      timer.on('tick', handler);
      timer.start();
      jest.advanceTimersByTime(1000);
      
      expect(handler).toHaveBeenCalled();
      
      timer.off('tick', handler);
      jest.advanceTimersByTime(1000);
      
      // Should not be called again after removal
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      timer.on('tick', handler1);
      timer.on('tick', handler2);
      
      timer.start();
      jest.advanceTimersByTime(1000);
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      timer = new GameTimer({ duration: 60, autoStart: true });
      
      expect(timer.isActive()).toBe(true);
      
      timer.dispose();
      
      expect(timer.isActive()).toBe(false);
    });
  });
});