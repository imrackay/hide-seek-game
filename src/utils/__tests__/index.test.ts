import {
  calculateDistance,
  generateRandomId,
  clamp,
  lerp,
  formatTime,
  isValidPosition,
} from '../index';
import { Vector3 } from '@/types';

describe('Utility Functions', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two points correctly', () => {
      const pos1: Vector3 = { x: 0, y: 0, z: 0 };
      const pos2: Vector3 = { x: 3, y: 4, z: 0 };
      expect(calculateDistance(pos1, pos2)).toBe(5);
    });
  });

  describe('generateRandomId', () => {
    it('should generate a string', () => {
      const id = generateRandomId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique ids', () => {
      const id1 = generateRandomId();
      const id2 = generateRandomId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('should interpolate between values', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
    });
  });

  describe('formatTime', () => {
    it('should format time correctly', () => {
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(30)).toBe('0:30');
      expect(formatTime(0)).toBe('0:00');
    });
  });

  describe('isValidPosition', () => {
    it('should validate positions within bounds', () => {
      const bounds = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      };

      expect(isValidPosition({ x: 5, y: 5, z: 5 }, bounds)).toBe(true);
      expect(isValidPosition({ x: -1, y: 5, z: 5 }, bounds)).toBe(false);
      expect(isValidPosition({ x: 11, y: 5, z: 5 }, bounds)).toBe(false);
    });
  });
});
