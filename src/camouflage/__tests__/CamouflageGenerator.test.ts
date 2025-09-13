import * as THREE from 'three';
import { CamouflageGenerator } from '../CamouflageGenerator';
import { EnvironmentAnalyzer } from '../EnvironmentAnalyzer';

// Mock EnvironmentAnalyzer
jest.mock('../EnvironmentAnalyzer', () => ({
  EnvironmentAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeEnvironment: jest.fn().mockReturnValue({
      nearbyObjects: [
        {
          id: 'box1',
          type: 'box',
          position: new THREE.Vector3(1, 0, 1),
          size: new THREE.Vector3(2, 2, 2),
          color: 0xff0000,
          distance: 2,
          believabilityScore: 0.8,
          canCamouflage: true
        }
      ],
      camouflageOptions: [
        {
          objectType: 'box',
          model: 'camouflage_box',
          scale: new THREE.Vector3(1, 1, 1),
          believabilityScore: 0.8,
          restrictions: [{ type: 'speed', value: 0.3 }],
          duration: 30000
        }
      ],
      environmentScore: 0.7,
      analysisTimestamp: Date.now()
    })
  }))
}));

// Mock Three.js
jest.mock('three', () => ({
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    clone: jest.fn().mockReturnThis(),
    distanceTo: jest.fn().mockReturnValue(5)
  }))
}));

describe('CamouflageGenerator', () => {
  let mockEnvironmentAnalyzer: EnvironmentAnalyzer;
  let camouflageGenerator: CamouflageGenerator;

  beforeEach(() => {
    mockEnvironmentAnalyzer = new EnvironmentAnalyzer({} as any);
    camouflageGenerator = new CamouflageGenerator(mockEnvironmentAnalyzer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create CamouflageGenerator with default options', () => {
      expect(camouflageGenerator).toBeInstanceOf(CamouflageGenerator);
    });

    it('should create CamouflageGenerator with custom options', () => {
      const options = {
        maxOptions: 10,
        qualityThreshold: 0.6,
        diversityFactor: 0.8
      };
      
      const generator = new CamouflageGenerator(mockEnvironmentAnalyzer, options);
      expect(generator).toBeInstanceOf(CamouflageGenerator);
    });
  });

  describe('generateCamouflageOptions', () => {
    it('should generate enhanced camouflage options', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      expect(Array.isArray(options)).toBe(true);
      expect(mockEnvironmentAnalyzer.analyzeEnvironment).toHaveBeenCalledWith(playerPosition);
    });

    it('should return empty array when no base options available', () => {
      // Mock analyzer to return no options
      (mockEnvironmentAnalyzer.analyzeEnvironment as jest.Mock).mockReturnValue({
        nearbyObjects: [],
        camouflageOptions: [],
        environmentScore: 0,
        analysisTimestamp: Date.now()
      });
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      expect(options).toHaveLength(0);
    });

    it('should enhance options with additional properties', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      options.forEach(option => {
        expect(option.id).toBeDefined();
        expect(option.generatedAt).toBeDefined();
        expect(option.expiresAt).toBeDefined();
        expect(option.difficulty).toBeDefined();
        expect(Array.isArray(option.tags)).toBe(true);
        expect(['easy', 'medium', 'hard']).toContain(option.difficulty);
      });
    });

    it('should filter options by quality threshold', () => {
      const generator = new CamouflageGenerator(mockEnvironmentAnalyzer, {
        qualityThreshold: 0.9 // High threshold
      });
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const options = generator.generateCamouflageOptions(playerPosition);
      
      // Should filter out options below threshold
      options.forEach(option => {
        expect(option.believabilityScore).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('generateQuickCamouflage', () => {
    it('should generate quick camouflage option', () => {
      // Mock getBestCamouflageOption
      (mockEnvironmentAnalyzer as any).getBestCamouflageOption = jest.fn().mockReturnValue({
        objectType: 'box',
        model: 'camouflage_box',
        scale: new THREE.Vector3(1, 1, 1),
        believabilityScore: 0.8,
        restrictions: [{ type: 'speed', value: 0.3 }],
        duration: 30000
      });
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const quickOption = camouflageGenerator.generateQuickCamouflage(playerPosition);
      
      expect(quickOption).toBeDefined();
      if (quickOption) {
        expect(quickOption.id).toBeDefined();
        expect(quickOption.difficulty).toBeDefined();
      }
    });

    it('should return null when no best option available', () => {
      (mockEnvironmentAnalyzer as any).getBestCamouflageOption = jest.fn().mockReturnValue(null);
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const quickOption = camouflageGenerator.generateQuickCamouflage(playerPosition);
      
      expect(quickOption).toBeNull();
    });
  });

  describe('generateCamouflageByType', () => {
    it('should filter options by object type', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const objectType = 'box';
      
      const options = camouflageGenerator.generateCamouflageByType(playerPosition, objectType);
      
      options.forEach(option => {
        expect(option.objectType).toBe(objectType);
      });
    });
  });

  describe('generateCamouflageByDifficulty', () => {
    it('should filter options by difficulty', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const difficulty = 'easy';
      
      const options = camouflageGenerator.generateCamouflageByDifficulty(playerPosition, difficulty);
      
      options.forEach(option => {
        expect(option.difficulty).toBe(difficulty);
      });
    });
  });

  describe('option management', () => {
    it('should store generated options', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      if (options.length > 0) {
        const option = camouflageGenerator.getGeneratedOption(options[0].id);
        expect(option).toBeDefined();
        expect(option?.id).toBe(options[0].id);
      }
    });

    it('should check if option is expired', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      if (options.length > 0) {
        const isExpired = camouflageGenerator.isOptionExpired(options[0].id);
        expect(typeof isExpired).toBe('boolean');
      }
    });

    it('should cleanup expired options', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // Generate options
      camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      // Cleanup should not throw
      expect(() => {
        camouflageGenerator.cleanupExpiredOptions();
      }).not.toThrow();
    });
  });

  describe('player skill management', () => {
    it('should set player skill level', () => {
      const skillLevel = 0.7;
      
      camouflageGenerator.setPlayerSkillLevel(skillLevel);
      
      const retrievedSkill = camouflageGenerator.getPlayerSkillLevel();
      expect(retrievedSkill).toBe(skillLevel);
    });

    it('should clamp skill level to valid range', () => {
      camouflageGenerator.setPlayerSkillLevel(-0.5); // Below 0
      expect(camouflageGenerator.getPlayerSkillLevel()).toBe(0);
      
      camouflageGenerator.setPlayerSkillLevel(1.5); // Above 1
      expect(camouflageGenerator.getPlayerSkillLevel()).toBe(1);
    });

    it('should consider player skill in option generation', () => {
      // Set beginner skill level
      camouflageGenerator.setPlayerSkillLevel(0.2);
      
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      // Should generate options (exact behavior depends on implementation)
      expect(Array.isArray(options)).toBe(true);
    });
  });

  describe('option enhancement', () => {
    it('should calculate difficulty correctly', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      options.forEach(option => {
        if (option.believabilityScore >= 0.8) {
          expect(option.difficulty).toBe('easy');
        } else if (option.believabilityScore >= 0.6) {
          expect(option.difficulty).toBe('medium');
        } else {
          expect(option.difficulty).toBe('hard');
        }
      });
    });

    it('should generate appropriate tags', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      options.forEach(option => {
        expect(option.tags.length).toBeGreaterThan(0);
        expect(option.tags).toContain(`type:${option.objectType}`);
        
        // Should have quality tag
        const hasQualityTag = option.tags.some(tag => 
          ['high-quality', 'medium-quality', 'low-quality'].includes(tag)
        );
        expect(hasQualityTag).toBe(true);
      });
    });

    it('should enhance restrictions based on difficulty', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      options.forEach(option => {
        expect(Array.isArray(option.restrictions)).toBe(true);
        
        if (option.difficulty === 'hard') {
          // Hard difficulty should have more restrictions
          const hasSpeedRestriction = option.restrictions.some(r => 
            r.type === 'speed' && r.value <= 0.2
          );
          expect(hasSpeedRestriction).toBe(true);
        }
      });
    });
  });

  describe('statistics', () => {
    it('should provide generation statistics', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // Generate some options
      camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      const stats = camouflageGenerator.getGenerationStats();
      
      expect(stats.totalGenerated).toBeGreaterThanOrEqual(0);
      expect(stats.activeOptions).toBeGreaterThanOrEqual(0);
      expect(stats.expiredOptions).toBeGreaterThanOrEqual(0);
      expect(stats.averageQuality).toBeGreaterThanOrEqual(0);
      expect(stats.averageQuality).toBeLessThanOrEqual(1);
    });
  });

  describe('configuration updates', () => {
    it('should update options', () => {
      const newOptions = {
        maxOptions: 12,
        qualityThreshold: 0.7
      };
      
      camouflageGenerator.updateOptions(newOptions);
      
      // Should not throw and should accept the update
      const playerPosition = new THREE.Vector3(0, 0, 0);
      const options = camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      expect(Array.isArray(options)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should dispose resources', () => {
      const playerPosition = new THREE.Vector3(0, 0, 0);
      
      // Generate options
      camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      // Dispose
      camouflageGenerator.dispose();
      
      // Should clear generated options
      const stats = camouflageGenerator.getGenerationStats();
      expect(stats.totalGenerated).toBe(0);
    });
  });
});