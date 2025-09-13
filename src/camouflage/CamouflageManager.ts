import * as THREE from 'three';
import { EnvironmentAnalyzer, EnvironmentAnalysisResult } from './EnvironmentAnalyzer';
import { CamouflageGenerator, GeneratedCamouflage } from './CamouflageGenerator';
import { PlayerTransformer, TransformationState } from './PlayerTransformer';
import { CamouflageOption } from '../types';

export interface CamouflageManagerOptions {
  environmentAnalyzer?: any;
  camouflageGenerator?: any;
  playerTransformer?: any;
  autoAnalysisInterval?: number;
  enableAutoCleanup?: boolean;
  maxCacheSize?: number;
}

export interface CamouflageSession {
  playerId: string;
  startTime: number;
  camouflageOption: GeneratedCamouflage;
  transformationState: TransformationState;
  analysisResult: EnvironmentAnalysisResult;
}

export class CamouflageManager {
  private scene: THREE.Scene;
  private environmentAnalyzer: EnvironmentAnalyzer;
  private camouflageGenerator: CamouflageGenerator;
  private playerTransformer: PlayerTransformer;
  private options: Required<CamouflageManagerOptions>;
  
  private activeSessions: Map<string, CamouflageSession> = new Map();
  private analysisCache: Map<string, EnvironmentAnalysisResult> = new Map();
  private autoAnalysisTimer: NodeJS.Timeout | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  constructor(scene: THREE.Scene, options: CamouflageManagerOptions = {}) {
    this.scene = scene;
    
    // Initialize components
    this.environmentAnalyzer = options.environmentAnalyzer || new EnvironmentAnalyzer(scene);
    this.camouflageGenerator = options.camouflageGenerator || new CamouflageGenerator(this.environmentAnalyzer);
    this.playerTransformer = options.playerTransformer || new PlayerTransformer(scene);
    
    this.options = {
      environmentAnalyzer: options.environmentAnalyzer,
      camouflageGenerator: options.camouflageGenerator,
      playerTransformer: options.playerTransformer,
      autoAnalysisInterval: options.autoAnalysisInterval || 5000,
      enableAutoCleanup: options.enableAutoCleanup !== false,
      maxCacheSize: options.maxCacheSize || 50
    };

    this.setupAutoCleanup();
  }

  // Main camouflage operations
  async activateCamouflage(
    playerId: string, 
    playerPosition: THREE.Vector3,
    playerMesh: THREE.Mesh,
    preferredType?: string
  ): Promise<boolean> {
    try {
      // Register player if not already registered
      this.playerTransformer.registerPlayer(playerId, playerMesh);

      // Analyze environment
      const analysisResult = this.environmentAnalyzer.analyzeEnvironment(playerPosition);
      
      if (analysisResult.camouflageOptions.length === 0) {
        this.emitEvent('camouflage-failed', { playerId, reason: 'no-options' });
        return false;
      }

      // Generate enhanced camouflage options
      const generatedOptions = this.camouflageGenerator.generateCamouflageOptions(playerPosition);
      
      if (generatedOptions.length === 0) {
        this.emitEvent('camouflage-failed', { playerId, reason: 'generation-failed' });
        return false;
      }

      // Select best option (or preferred type)
      let selectedOption = generatedOptions[0];
      if (preferredType) {
        const preferredOption = generatedOptions.find(opt => opt.objectType === preferredType);
        if (preferredOption) {
          selectedOption = preferredOption;
        }
      }

      // Apply transformation
      const transformationSuccess = await this.playerTransformer.transformPlayer(playerId, selectedOption);
      
      if (!transformationSuccess) {
        this.emitEvent('camouflage-failed', { playerId, reason: 'transformation-failed' });
        return false;
      }

      // Create session
      const transformationState = this.playerTransformer.getTransformationState(playerId);
      if (transformationState) {
        const session: CamouflageSession = {
          playerId,
          startTime: Date.now(),
          camouflageOption: selectedOption,
          transformationState,
          analysisResult
        };

        this.activeSessions.set(playerId, session);
        this.cacheAnalysisResult(playerPosition, analysisResult);
        
        this.emitEvent('camouflage-activated', { playerId, session });
        return true;
      }

      return false;

    } catch (error) {
      console.error('Camouflage activation failed:', error);
      this.emitEvent('camouflage-error', { playerId, error });
      return false;
    }
  }

  async deactivateCamouflage(playerId: string): Promise<boolean> {
    try {
      const session = this.activeSessions.get(playerId);
      if (!session) {
        return false;
      }

      const reversionSuccess = await this.playerTransformer.revertTransformation(playerId);
      
      if (reversionSuccess) {
        this.activeSessions.delete(playerId);
        this.emitEvent('camouflage-deactivated', { playerId, session });
        return true;
      }

      return false;

    } catch (error) {
      console.error('Camouflage deactivation failed:', error);
      this.emitEvent('camouflage-error', { playerId, error });
      return false;
    }
  }

  // Analysis and option generation
  analyzeEnvironmentForPlayer(playerId: string, playerPosition: THREE.Vector3): EnvironmentAnalysisResult {
    const cacheKey = this.generateCacheKey(playerPosition);
    const cachedResult = this.analysisCache.get(cacheKey);
    
    if (cachedResult && this.isCacheValid(cachedResult)) {
      return cachedResult;
    }

    const analysisResult = this.environmentAnalyzer.analyzeEnvironment(playerPosition);
    this.cacheAnalysisResult(playerPosition, analysisResult);
    
    return analysisResult;
  }

  getCamouflageOptions(playerId: string, playerPosition: THREE.Vector3): GeneratedCamouflage[] {
    const analysisResult = this.analyzeEnvironmentForPlayer(playerId, playerPosition);
    
    if (analysisResult.camouflageOptions.length === 0) {
      return [];
    }

    return this.camouflageGenerator.generateCamouflageOptions(playerPosition);
  }

  getBestCamouflageOption(playerId: string, playerPosition: THREE.Vector3): GeneratedCamouflage | null {
    const options = this.getCamouflageOptions(playerId, playerPosition);
    return options.length > 0 ? options[0] : null;
  }

  getCamouflageOptionsByType(
    playerId: string, 
    playerPosition: THREE.Vector3, 
    objectType: string
  ): GeneratedCamouflage[] {
    return this.camouflageGenerator.generateCamouflageByType(playerPosition, objectType);
  }

  getCamouflageOptionsByDifficulty(
    playerId: string, 
    playerPosition: THREE.Vector3, 
    difficulty: 'easy' | 'medium' | 'hard'
  ): GeneratedCamouflage[] {
    return this.camouflageGenerator.generateCamouflageByDifficulty(playerPosition, difficulty);
  }

  // Session management
  getActiveSession(playerId: string): CamouflageSession | null {
    return this.activeSessions.get(playerId) || null;
  }

  isPlayerCamouflaged(playerId: string): boolean {
    return this.activeSessions.has(playerId);
  }

  getRemainingCamouflageTime(playerId: string): number {
    const session = this.activeSessions.get(playerId);
    if (!session) return 0;
    
    return this.playerTransformer.getRemainingTransformationTime(playerId);
  }

  extendCamouflageTime(playerId: string, additionalTime: number): boolean {
    const session = this.activeSessions.get(playerId);
    if (!session) return false;

    const currentRemaining = this.getRemainingCamouflageTime(playerId);
    const newDuration = currentRemaining + additionalTime;
    
    return this.playerTransformer.updateTransformationDuration(playerId, newDuration);
  }

  // Player management
  registerPlayer(playerId: string, playerMesh: THREE.Mesh): void {
    this.playerTransformer.registerPlayer(playerId, playerMesh);
  }

  unregisterPlayer(playerId: string): void {
    this.deactivateCamouflage(playerId);
    this.playerTransformer.unregisterPlayer(playerId);
    this.activeSessions.delete(playerId);
  }

  // Skill and difficulty management
  private playerSkills: Map<string, number> = new Map();

  updatePlayerSkill(playerId: string, skillLevel: number): void {
    this.playerSkills.set(playerId, skillLevel);
    this.camouflageGenerator.setPlayerSkillLevel(skillLevel);
  }

  getPlayerSkill(playerId: string): number {
    return this.playerSkills.get(playerId) || 0.5; // Default skill level
  }

  // Cache management
  private generateCacheKey(position: THREE.Vector3): string {
    // Round position to reduce cache fragmentation
    const x = Math.round(position.x * 2) / 2;
    const y = Math.round(position.y * 2) / 2;
    const z = Math.round(position.z * 2) / 2;
    return `${x},${y},${z}`;
  }

  private cacheAnalysisResult(position: THREE.Vector3, result: EnvironmentAnalysisResult): void {
    const cacheKey = this.generateCacheKey(position);
    this.analysisCache.set(cacheKey, result);
    
    // Limit cache size
    if (this.analysisCache.size > this.options.maxCacheSize) {
      const firstKey = this.analysisCache.keys().next().value;
      this.analysisCache.delete(firstKey);
    }
  }

  private isCacheValid(result: EnvironmentAnalysisResult): boolean {
    const maxAge = 30000; // 30 seconds
    return Date.now() - result.analysisTimestamp < maxAge;
  }

  clearAnalysisCache(): void {
    this.analysisCache.clear();
  }

  // Auto-cleanup and maintenance
  private setupAutoCleanup(): void {
    if (this.options.enableAutoCleanup) {
      this.autoAnalysisTimer = setInterval(() => {
        this.performMaintenance();
      }, this.options.autoAnalysisInterval);
    }
  }

  private performMaintenance(): void {
    // Clean up expired sessions
    const now = Date.now();
    for (const [playerId, session] of this.activeSessions.entries()) {
      if (now > session.transformationState.endTime) {
        this.deactivateCamouflage(playerId);
      }
    }

    // Clean up expired cache entries
    for (const [key, result] of this.analysisCache.entries()) {
      if (!this.isCacheValid(result)) {
        this.analysisCache.delete(key);
      }
    }

    // Clean up expired generated options
    this.camouflageGenerator.cleanupExpiredOptions();
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emitEvent(event: string, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }

  // Statistics and debugging
  getStatistics(): {
    activeSessions: number;
    cacheSize: number;
    totalAnalyses: number;
    averageEnvironmentScore: number;
    generationStats: any;
  } {
    const activeSessions = this.activeSessions.size;
    const cacheSize = this.analysisCache.size;
    const totalAnalyses = this.analysisCache.size;
    
    const environmentScores = Array.from(this.analysisCache.values())
      .map(result => result.environmentScore);
    const averageEnvironmentScore = environmentScores.length > 0
      ? environmentScores.reduce((sum, score) => sum + score, 0) / environmentScores.length
      : 0;

    const generationStats = this.camouflageGenerator.getGenerationStats();

    return {
      activeSessions,
      cacheSize,
      totalAnalyses,
      averageEnvironmentScore,
      generationStats
    };
  }

  getDebugInfo(playerId?: string): any {
    const debugInfo: any = {
      statistics: this.getStatistics(),
      activeSessions: Array.from(this.activeSessions.keys()),
      cacheKeys: Array.from(this.analysisCache.keys())
    };

    if (playerId) {
      debugInfo.playerSession = this.getActiveSession(playerId);
      debugInfo.transformationState = this.playerTransformer.getTransformationState(playerId);
    }

    return debugInfo;
  }

  // Configuration updates
  updateEnvironmentAnalyzerOptions(options: any): void {
    // Update environment analyzer options
    try {
      if (options.analysisRadius !== undefined && typeof (this.environmentAnalyzer as any).updateAnalysisRadius === 'function') {
        (this.environmentAnalyzer as any).updateAnalysisRadius(options.analysisRadius);
      }
      if (options.minBelievabilityScore !== undefined && typeof (this.environmentAnalyzer as any).setMinBelievabilityScore === 'function') {
        (this.environmentAnalyzer as any).setMinBelievabilityScore(options.minBelievabilityScore);
      }
    } catch (error) {
      console.warn('Failed to update environment analyzer options:', error);
    }
  }

  updateCamouflageGeneratorOptions(options: any): void {
    try {
      if (typeof (this.camouflageGenerator as any).updateOptions === 'function') {
        (this.camouflageGenerator as any).updateOptions(options);
      }
    } catch (error) {
      console.warn('Failed to update camouflage generator options:', error);
    }
  }

  // Disposal
  dispose(): void {
    // Clear auto-cleanup timer
    if (this.autoAnalysisTimer) {
      clearInterval(this.autoAnalysisTimer);
      this.autoAnalysisTimer = null;
    }

    // Deactivate all camouflages
    for (const playerId of this.activeSessions.keys()) {
      this.deactivateCamouflage(playerId);
    }

    // Dispose components
    this.environmentAnalyzer.dispose();
    this.camouflageGenerator.dispose();
    this.playerTransformer.dispose();

    // Clear data
    this.activeSessions.clear();
    this.analysisCache.clear();
    this.eventListeners.clear();
  }
}