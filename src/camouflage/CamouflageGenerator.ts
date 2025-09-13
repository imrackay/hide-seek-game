import * as THREE from 'three';
import { CamouflageOption, MovementRestriction } from '../types';
import { EnvironmentAnalyzer, AnalyzedObject } from './EnvironmentAnalyzer';

export interface CamouflageGeneratorOptions {
  maxOptions?: number;
  qualityThreshold?: number;
  diversityFactor?: number;
  considerPlayerSkill?: boolean;
  adaptiveDifficulty?: boolean;
}

export interface GeneratedCamouflage extends CamouflageOption {
  id: string;
  generatedAt: number;
  expiresAt: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

export class CamouflageGenerator {
  private environmentAnalyzer: EnvironmentAnalyzer;
  private options: Required<CamouflageGeneratorOptions>;
  private generatedOptions: Map<string, GeneratedCamouflage> = new Map();
  private playerSkillLevel = 0.5; // 0-1 scale

  constructor(
    environmentAnalyzer: EnvironmentAnalyzer,
    options: CamouflageGeneratorOptions = {}
  ) {
    this.environmentAnalyzer = environmentAnalyzer;
    this.options = {
      maxOptions: options.maxOptions || 8,
      qualityThreshold: options.qualityThreshold || 0.4,
      diversityFactor: options.diversityFactor || 0.7,
      considerPlayerSkill: options.considerPlayerSkill !== false,
      adaptiveDifficulty: options.adaptiveDifficulty !== false
    };
  }

  generateCamouflageOptions(playerPosition: THREE.Vector3): GeneratedCamouflage[] {
    const analysis = this.environmentAnalyzer.analyzeEnvironment(playerPosition);
    const baseOptions = analysis.camouflageOptions;

    if (baseOptions.length === 0) {
      return [];
    }

    // Filter and enhance options
    let enhancedOptions = this.enhanceOptions(baseOptions, playerPosition);
    
    // Apply diversity filtering
    enhancedOptions = this.applyDiversityFiltering(enhancedOptions);
    
    // Apply skill-based filtering
    if (this.options.considerPlayerSkill) {
      enhancedOptions = this.applySkillBasedFiltering(enhancedOptions);
    }
    
    // Apply adaptive difficulty
    if (this.options.adaptiveDifficulty) {
      enhancedOptions = this.applyAdaptiveDifficulty(enhancedOptions);
    }

    // Limit to max options
    enhancedOptions = enhancedOptions.slice(0, this.options.maxOptions);

    // Store generated options
    enhancedOptions.forEach(option => {
      this.generatedOptions.set(option.id, option);
    });

    return enhancedOptions;
  }

  private enhanceOptions(
    baseOptions: CamouflageOption[], 
    playerPosition: THREE.Vector3
  ): GeneratedCamouflage[] {
    return baseOptions
      .filter(option => option.believabilityScore >= this.options.qualityThreshold)
      .map(option => this.enhanceOption(option, playerPosition));
  }

  private enhanceOption(option: CamouflageOption, playerPosition: THREE.Vector3): GeneratedCamouflage {
    const id = this.generateOptionId();
    const difficulty = this.calculateDifficulty(option);
    const tags = this.generateTags(option);
    const duration = this.calculateEnhancedDuration(option, difficulty);

    return {
      ...option,
      id,
      generatedAt: Date.now(),
      expiresAt: Date.now() + duration,
      difficulty,
      tags,
      duration,
      restrictions: this.enhanceRestrictions(option.restrictions, difficulty),
      believabilityScore: this.adjustBelievabilityScore(option.believabilityScore, difficulty)
    };
  }

  private generateOptionId(): string {
    return `camouflage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateDifficulty(option: CamouflageOption): 'easy' | 'medium' | 'hard' {
    const score = option.believabilityScore;
    
    if (score >= 0.8) return 'easy';
    if (score >= 0.6) return 'medium';
    return 'hard';
  }

  private generateTags(option: CamouflageOption): string[] {
    const tags: string[] = [];
    
    // Object type tag
    tags.push(`type:${option.objectType}`);
    
    // Size tags
    if (option.scale) {
      const avgScale = (option.scale.x + option.scale.y + option.scale.z) / 3;
      if (avgScale > 1.5) tags.push('large');
      else if (avgScale < 0.8) tags.push('small');
      else tags.push('medium');
    }
    
    // Believability tags
    if (option.believabilityScore >= 0.8) tags.push('high-quality');
    else if (option.believabilityScore >= 0.6) tags.push('medium-quality');
    else tags.push('low-quality');
    
    // Movement restriction tags
    const hasSpeedRestriction = option.restrictions.some(r => r.type === 'speed' && r.value < 0.5);
    if (hasSpeedRestriction) tags.push('slow-movement');
    
    const hasDirectionRestriction = option.restrictions.some(r => r.type === 'direction');
    if (hasDirectionRestriction) tags.push('limited-movement');
    
    // Special tags based on object type
    const specialTags = this.getSpecialTags(option.objectType);
    tags.push(...specialTags);
    
    return tags;
  }

  private getSpecialTags(objectType: string): string[] {
    const specialTagMap: Record<string, string[]> = {
      'box': ['geometric', 'angular'],
      'sphere': ['round', 'smooth'],
      'cylinder': ['tall', 'cylindrical'],
      'wall': ['flat', 'structural'],
      'tree': ['natural', 'organic'],
      'rock': ['natural', 'rough'],
      'barrel': ['container', 'round'],
      'crate': ['container', 'angular']
    };
    
    return specialTagMap[objectType] || ['generic'];
  }

  private calculateEnhancedDuration(option: CamouflageOption, difficulty: 'easy' | 'medium' | 'hard'): number {
    let baseDuration = option.duration || 30000;
    
    // Adjust duration based on difficulty
    const difficultyMultipliers = {
      'easy': 1.5,
      'medium': 1.0,
      'hard': 0.7
    };
    
    baseDuration *= difficultyMultipliers[difficulty];
    
    // Adjust based on believability score
    baseDuration *= option.believabilityScore;
    
    return Math.max(10000, Math.min(60000, baseDuration)); // 10s to 60s range
  }

  private enhanceRestrictions(
    restrictions: MovementRestriction[], 
    difficulty: 'easy' | 'medium' | 'hard'
  ): MovementRestriction[] {
    const enhanced = [...restrictions];
    
    // Add difficulty-based restrictions
    const difficultyRestrictions = this.getDifficultyRestrictions(difficulty);
    enhanced.push(...difficultyRestrictions);
    
    return enhanced;
  }

  private getDifficultyRestrictions(difficulty: 'easy' | 'medium' | 'hard'): MovementRestriction[] {
    const restrictions: MovementRestriction[] = [];
    
    switch (difficulty) {
      case 'hard':
        restrictions.push({ type: 'speed', value: 0.2 });
        restrictions.push({ type: 'action', value: 0.1 });
        break;
      case 'medium':
        restrictions.push({ type: 'speed', value: 0.4 });
        break;
      case 'easy':
        // No additional restrictions for easy mode
        break;
    }
    
    return restrictions;
  }

  private adjustBelievabilityScore(score: number, difficulty: 'easy' | 'medium' | 'hard'): number {
    // Slightly adjust score based on difficulty for balancing
    const adjustments = {
      'easy': 0.05,
      'medium': 0,
      'hard': -0.05
    };
    
    return Math.max(0, Math.min(1, score + adjustments[difficulty]));
  }

  private applyDiversityFiltering(options: GeneratedCamouflage[]): GeneratedCamouflage[] {
    if (options.length <= 3) return options;
    
    const diverseOptions: GeneratedCamouflage[] = [];
    const usedTypes = new Set<string>();
    
    // First pass: select best option of each type
    for (const option of options) {
      if (!usedTypes.has(option.objectType)) {
        diverseOptions.push(option);
        usedTypes.add(option.objectType);
      }
    }
    
    // Second pass: fill remaining slots with highest scoring options
    const remainingSlots = Math.floor(this.options.maxOptions * this.options.diversityFactor) - diverseOptions.length;
    const remainingOptions = options.filter(opt => !diverseOptions.includes(opt));
    
    diverseOptions.push(...remainingOptions.slice(0, remainingSlots));
    
    return diverseOptions.sort((a, b) => b.believabilityScore - a.believabilityScore);
  }

  private applySkillBasedFiltering(options: GeneratedCamouflage[]): GeneratedCamouflage[] {
    // Adjust options based on player skill level
    const skillAdjustedOptions = options.map(option => {
      const adjustedOption = { ...option };
      
      if (this.playerSkillLevel < 0.3) {
        // Beginner: prefer easier options
        if (option.difficulty === 'easy') {
          adjustedOption.believabilityScore *= 1.2;
        }
      } else if (this.playerSkillLevel > 0.7) {
        // Advanced: prefer challenging options
        if (option.difficulty === 'hard') {
          adjustedOption.believabilityScore *= 1.1;
        }
      }
      
      return adjustedOption;
    });
    
    return skillAdjustedOptions.sort((a, b) => b.believabilityScore - a.believabilityScore);
  }

  private applyAdaptiveDifficulty(options: GeneratedCamouflage[]): GeneratedCamouflage[] {
    // Adjust difficulty based on recent performance
    const recentSuccessRate = this.calculateRecentSuccessRate();
    
    if (recentSuccessRate > 0.8) {
      // Player is doing well, increase difficulty
      return options.filter(opt => opt.difficulty !== 'easy');
    } else if (recentSuccessRate < 0.3) {
      // Player is struggling, provide easier options
      return options.filter(opt => opt.difficulty !== 'hard');
    }
    
    return options;
  }

  private calculateRecentSuccessRate(): number {
    // Simplified success rate calculation
    // In a real implementation, this would track actual player performance
    return 0.5 + (this.playerSkillLevel - 0.5) * 0.4;
  }

  // Specialized generation methods
  generateQuickCamouflage(playerPosition: THREE.Vector3): GeneratedCamouflage | null {
    const bestOption = this.environmentAnalyzer.getBestCamouflageOption(playerPosition);
    
    if (!bestOption) return null;
    
    return this.enhanceOption(bestOption, playerPosition);
  }

  generateCamouflageByType(
    playerPosition: THREE.Vector3, 
    objectType: string
  ): GeneratedCamouflage[] {
    const allOptions = this.generateCamouflageOptions(playerPosition);
    return allOptions.filter(option => option.objectType === objectType);
  }

  generateCamouflageByDifficulty(
    playerPosition: THREE.Vector3, 
    difficulty: 'easy' | 'medium' | 'hard'
  ): GeneratedCamouflage[] {
    const allOptions = this.generateCamouflageOptions(playerPosition);
    return allOptions.filter(option => option.difficulty === difficulty);
  }

  // Utility methods
  getGeneratedOption(id: string): GeneratedCamouflage | null {
    return this.generatedOptions.get(id) || null;
  }

  isOptionExpired(id: string): boolean {
    const option = this.generatedOptions.get(id);
    return option ? Date.now() > option.expiresAt : true;
  }

  cleanupExpiredOptions(): void {
    const now = Date.now();
    for (const [id, option] of this.generatedOptions.entries()) {
      if (now > option.expiresAt) {
        this.generatedOptions.delete(id);
      }
    }
  }

  setPlayerSkillLevel(skillLevel: number): void {
    this.playerSkillLevel = Math.max(0, Math.min(1, skillLevel));
  }

  getPlayerSkillLevel(): number {
    return this.playerSkillLevel;
  }

  updateOptions(options: Partial<CamouflageGeneratorOptions>): void {
    Object.assign(this.options, options);
  }

  getGenerationStats(): {
    totalGenerated: number;
    activeOptions: number;
    expiredOptions: number;
    averageQuality: number;
  } {
    const activeOptions = Array.from(this.generatedOptions.values()).filter(
      opt => Date.now() <= opt.expiresAt
    );
    
    const expiredCount = this.generatedOptions.size - activeOptions.length;
    const averageQuality = activeOptions.length > 0 
      ? activeOptions.reduce((sum, opt) => sum + opt.believabilityScore, 0) / activeOptions.length
      : 0;

    return {
      totalGenerated: this.generatedOptions.size,
      activeOptions: activeOptions.length,
      expiredOptions: expiredCount,
      averageQuality
    };
  }

  dispose(): void {
    this.generatedOptions.clear();
  }
}