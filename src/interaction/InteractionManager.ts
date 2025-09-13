import * as THREE from 'three';
import { InteractionDetector, InteractionResult, InteractionTarget } from './InteractionDetector';
import { HiderDiscoverySystem, DiscoveryEvent, DiscoveryNotification } from './HiderDiscoverySystem';
import { MovementRestrictionManager, MovementState, MovementViolation } from './MovementRestrictionManager';
import { Player, CamouflageOption } from '../types';

export interface InteractionManagerOptions {
  interactionDetector?: any;
  hiderDiscoverySystem?: any;
  movementRestrictionManager?: any;
  enableAutoCleanup?: boolean;
  cleanupInterval?: number;
}

export interface InteractionSession {
  sessionId: string;
  seekerPlayerId: string;
  targetId: string;
  startTime: number;
  isActive: boolean;
  result?: InteractionResult;
}

export class InteractionManager {
  private scene: THREE.Scene;
  private interactionDetector: InteractionDetector;
  private hiderDiscoverySystem: HiderDiscoverySystem;
  private movementRestrictionManager: MovementRestrictionManager;
  private options: Required<InteractionManagerOptions>;
  
  private activeSessions: Map<string, InteractionSession> = new Map();
  private playerRoles: Map<string, 'hider' | 'seeker'> = new Map();
  private eventCallbacks: Map<string, Function[]> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(scene: THREE.Scene, options: InteractionManagerOptions = {}) {
    this.scene = scene;
    
    // Initialize components
    this.interactionDetector = options.interactionDetector || new InteractionDetector(scene);
    this.hiderDiscoverySystem = options.hiderDiscoverySystem || new HiderDiscoverySystem(this.interactionDetector);
    this.movementRestrictionManager = options.movementRestrictionManager || new MovementRestrictionManager();
    
    this.options = {
      interactionDetector: options.interactionDetector,
      hiderDiscoverySystem: options.hiderDiscoverySystem,
      movementRestrictionManager: options.movementRestrictionManager,
      enableAutoCleanup: options.enableAutoCleanup !== false,
      cleanupInterval: options.cleanupInterval || 30000
    };

    this.setupEventHandlers();
    this.startAutoCleanup();
  }

  private setupEventHandlers(): void {
    // Listen for discovery events
    this.hiderDiscoverySystem.addNotificationCallback('all', (notification: DiscoveryNotification) => {
      this.handleDiscoveryNotification(notification);
    });

    // Listen for movement violations
    this.movementRestrictionManager.addViolationCallback((violation: MovementViolation) => {
      this.handleMovementViolation(violation);
    });
  }

  private startAutoCleanup(): void {
    if (this.options.enableAutoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, this.options.cleanupInterval);
    }
  }

  // Player management
  registerPlayer(playerId: string, role: 'hider' | 'seeker', initialSpeed: number = 1.0): void {
    this.playerRoles.set(playerId, role);
    this.movementRestrictionManager.registerPlayer(playerId, initialSpeed);
  }

  unregisterPlayer(playerId: string): void {
    this.playerRoles.delete(playerId);
    this.movementRestrictionManager.unregisterPlayer(playerId);
    this.interactionDetector.unregisterCamouflagePlayer(playerId);
    
    // Cancel any active sessions
    this.cancelPlayerInteractions(playerId);
  }

  updatePlayerPosition(playerId: string, position: THREE.Vector3): void {
    const role = this.playerRoles.get(playerId);
    if (!role) return;

    // Update position in discovery system
    this.hiderDiscoverySystem.updatePlayerPosition(playerId, position, role === 'seeker');
    
    // Update interaction detector
    this.interactionDetector.updateTargetPosition(playerId, position);
  }

  // Camouflage management
  activatePlayerCamouflage(
    playerId: string, 
    player: Player, 
    camouflageData: CamouflageOption,
    playerMesh: THREE.Mesh
  ): void {
    // Register as camouflaged player
    this.interactionDetector.registerCamouflagePlayer(playerId, player, camouflageData, playerMesh);
    
    // Apply movement restrictions
    this.movementRestrictionManager.applyRestrictions(playerId, camouflageData.restrictions);
  }

  deactivatePlayerCamouflage(playerId: string): void {
    this.interactionDetector.unregisterCamouflagePlayer(playerId);
    this.movementRestrictionManager.removeRestrictions(playerId);
  }

  // Object registration
  registerInteractableObject(objectId: string, mesh: THREE.Mesh, isDecoy: boolean = false): void {
    this.interactionDetector.registerObject(objectId, mesh, isDecoy);
  }

  unregisterInteractableObject(objectId: string): void {
    this.interactionDetector.unregisterInteractionTarget(objectId);
  }

  // Interaction execution
  async startInteraction(seekerPlayerId: string, seekerPosition: THREE.Vector3, targetId?: string): Promise<InteractionResult> {
    const role = this.playerRoles.get(seekerPlayerId);
    if (role !== 'seeker') {
      throw new Error('Only seekers can initiate interactions');
    }

    // Find target if not specified
    let actualTargetId = targetId;
    if (!actualTargetId) {
      const nearestTarget = this.interactionDetector.getNearestInteractableTarget(seekerPosition, seekerPlayerId);
      if (!nearestTarget) {
        throw new Error('No interactable targets nearby');
      }
      actualTargetId = nearestTarget.id;
    }

    // Check if player is already interacting
    if (this.isPlayerInteracting(seekerPlayerId)) {
      throw new Error('Player is already interacting');
    }

    // Create session
    const sessionId = this.generateSessionId();
    const session: InteractionSession = {
      sessionId,
      seekerPlayerId,
      targetId: actualTargetId,
      startTime: Date.now(),
      isActive: true
    };

    this.activeSessions.set(sessionId, session);

    try {
      // Execute interaction
      const result = await this.interactionDetector.startInteraction(seekerPlayerId, seekerPosition, actualTargetId);
      
      // Update session
      session.result = result;
      session.isActive = false;

      // Record discovery attempt
      this.hiderDiscoverySystem.recordDiscoveryAttempt(
        seekerPlayerId,
        seekerPosition,
        result.success,
        result.confidence
      );

      // Emit events
      this.emitEvent('interaction_completed', { session, result });

      return result;

    } catch (error) {
      session.isActive = false;
      this.emitEvent('interaction_failed', { session, error });
      throw error;
    }
  }

  cancelInteraction(seekerPlayerId: string): boolean {
    const session = this.getActiveSessionByPlayer(seekerPlayerId);
    if (!session) return false;

    this.interactionDetector.cancelInteraction(seekerPlayerId);
    session.isActive = false;
    
    this.emitEvent('interaction_cancelled', { session });
    return true;
  }

  private cancelPlayerInteractions(playerId: string): void {
    const sessions = Array.from(this.activeSessions.values())
      .filter(session => session.seekerPlayerId === playerId && session.isActive);
    
    sessions.forEach(session => {
      this.cancelInteraction(session.seekerPlayerId);
    });
  }

  // Movement validation
  validatePlayerMovement(
    playerId: string, 
    currentPosition: THREE.Vector3, 
    targetPosition: THREE.Vector3, 
    deltaTime: number
  ): {
    isValid: boolean;
    correctedPosition: THREE.Vector3;
    violations: MovementViolation[];
  } {
    return this.movementRestrictionManager.validateMovement(
      playerId, 
      currentPosition, 
      targetPosition, 
      deltaTime
    );
  }

  // Query methods
  getInteractableTargets(playerPosition: THREE.Vector3, playerId: string): InteractionTarget[] {
    return this.interactionDetector.getInteractableTargets(playerPosition, playerId);
  }

  getNearestInteractableTarget(playerPosition: THREE.Vector3, playerId: string): InteractionTarget | null {
    return this.interactionDetector.getNearestInteractableTarget(playerPosition, playerId);
  }

  getProximityHints(playerPosition: THREE.Vector3, playerId: string) {
    return this.interactionDetector.getProximityHints(playerPosition, playerId);
  }

  isPlayerInteracting(playerId: string): boolean {
    return this.getActiveSessionByPlayer(playerId) !== null;
  }

  isPlayerDiscovered(playerId: string): boolean {
    return this.hiderDiscoverySystem.isPlayerDiscovered(playerId);
  }

  getPlayerMovementState(playerId: string): MovementState | null {
    return this.movementRestrictionManager.getPlayerState(playerId);
  }

  getDiscoveredPlayers(): string[] {
    return this.hiderDiscoverySystem.getDiscoveredPlayers();
  }

  getRecentDiscoveries(timeWindow?: number): DiscoveryEvent[] {
    return this.hiderDiscoverySystem.getRecentDiscoveries(timeWindow);
  }

  // Session management
  private getActiveSessionByPlayer(playerId: string): InteractionSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.seekerPlayerId === playerId && session.isActive) {
        return session;
      }
    }
    return null;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getActiveSessions(): InteractionSession[] {
    return Array.from(this.activeSessions.values()).filter(session => session.isActive);
  }

  getSessionHistory(playerId?: string): InteractionSession[] {
    const sessions = Array.from(this.activeSessions.values());
    
    if (playerId) {
      return sessions.filter(session => session.seekerPlayerId === playerId);
    }
    
    return sessions;
  }

  // Event handling
  private handleDiscoveryNotification(notification: DiscoveryNotification): void {
    this.emitEvent('player_discovery', notification);
    
    if (notification.type === 'player_discovered') {
      // Additional handling for player discovery
      const playerId = notification.event.discoveredPlayer.id;
      this.deactivatePlayerCamouflage(playerId);
    }
  }

  private handleMovementViolation(violation: MovementViolation): void {
    this.emitEvent('movement_violation', violation);
    
    // Potentially trigger discovery based on violation severity
    if (violation.severity === 'critical') {
      const role = this.playerRoles.get(violation.playerId);
      if (role === 'hider') {
        // Force discovery for critical violations
        this.hiderDiscoverySystem.forceDiscovery(violation.playerId);
      }
    }
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitEvent(event: string, data: any): void {
    const callbacks = this.eventCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event callback error for ${event}:`, error);
      }
    });
  }

  // Statistics
  getStatistics(): {
    totalInteractions: number;
    activeInteractions: number;
    discoveredPlayers: number;
    totalViolations: number;
    interactionSuccessRate: number;
    averageInteractionTime: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const completedSessions = sessions.filter(s => !s.isActive && s.result);
    const successfulSessions = completedSessions.filter(s => s.result?.success);
    
    const totalInteractionTime = completedSessions.reduce((sum, session) => {
      if (session.result) {
        return sum + (session.result.timestamp - session.startTime);
      }
      return sum;
    }, 0);

    const violationStats = this.movementRestrictionManager.getViolationStatistics();

    return {
      totalInteractions: sessions.length,
      activeInteractions: this.getActiveSessions().length,
      discoveredPlayers: this.getDiscoveredPlayers().length,
      totalViolations: violationStats.totalViolations,
      interactionSuccessRate: completedSessions.length > 0 ? successfulSessions.length / completedSessions.length : 0,
      averageInteractionTime: completedSessions.length > 0 ? totalInteractionTime / completedSessions.length : 0
    };
  }

  // Cleanup
  private performCleanup(): void {
    const now = Date.now();
    const maxSessionAge = 300000; // 5 minutes

    // Clean up old sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (!session.isActive && (now - session.startTime) > maxSessionAge) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Manual controls (for testing/admin)
  forceDiscovery(playerId: string, discovererPlayerId?: string): boolean {
    return this.hiderDiscoverySystem.forceDiscovery(playerId, discovererPlayerId);
  }

  resetPlayerDiscovery(playerId: string): void {
    this.hiderDiscoverySystem.resetPlayerDiscovery(playerId);
  }

  resetAllDiscoveries(): void {
    this.hiderDiscoverySystem.resetAllDiscoveries();
  }

  // Configuration updates
  updateInteractionDetectorOptions(options: any): void {
    this.interactionDetector.updateOptions(options);
  }

  updateHiderDiscoveryOptions(options: any): void {
    this.hiderDiscoverySystem.updateOptions(options);
  }

  updateMovementRestrictionOptions(options: any): void {
    this.movementRestrictionManager.updateOptions(options);
  }

  // Disposal
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cancel all active interactions
    for (const session of this.activeSessions.values()) {
      if (session.isActive) {
        this.cancelInteraction(session.seekerPlayerId);
      }
    }

    // Dispose components
    this.interactionDetector.dispose();
    this.hiderDiscoverySystem.dispose();
    this.movementRestrictionManager.dispose();

    // Clear data
    this.activeSessions.clear();
    this.playerRoles.clear();
    this.eventCallbacks.clear();
  }
}