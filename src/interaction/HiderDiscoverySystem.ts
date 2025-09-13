import * as THREE from 'three';
import { Player } from '../types';
import { InteractionDetector, InteractionResult } from './InteractionDetector';

export interface DiscoveryEvent {
  id: string;
  discoveredPlayer: Player;
  discovererPlayer: Player;
  discoveryMethod: 'interaction' | 'proximity' | 'movement' | 'timeout';
  position: THREE.Vector3;
  timestamp: number;
  confidence: number;
}

export interface DiscoveryNotification {
  type: 'player_discovered' | 'discovery_attempt' | 'false_positive' | 'suspicion_raised';
  event: DiscoveryEvent;
  targetPlayers: string[]; // Who should receive this notification
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface HiderDiscoveryOptions {
  enableProximityDiscovery?: boolean;
  proximityDiscoveryRadius?: number;
  proximityDiscoveryTime?: number;
  enableMovementDetection?: boolean;
  movementSensitivity?: number;
  enableTimeoutDiscovery?: boolean;
  maxCamouflageTime?: number;
  notificationDelay?: number;
}

export class HiderDiscoverySystem {
  private interactionDetector: InteractionDetector;
  private options: Required<HiderDiscoveryOptions>;
  private discoveredPlayers: Set<string> = new Set();
  private discoveryEvents: DiscoveryEvent[] = [];
  private notificationCallbacks: Map<string, Function[]> = new Map();
  private proximityTimers: Map<string, NodeJS.Timeout> = new Map();
  private playerPositions: Map<string, THREE.Vector3> = new Map();
  private lastMovementTime: Map<string, number> = new Map();

  constructor(
    interactionDetector: InteractionDetector,
    options: HiderDiscoveryOptions = {}
  ) {
    this.interactionDetector = interactionDetector;
    this.options = {
      enableProximityDiscovery: options.enableProximityDiscovery !== false,
      proximityDiscoveryRadius: options.proximityDiscoveryRadius || 1.0,
      proximityDiscoveryTime: options.proximityDiscoveryTime || 3000,
      enableMovementDetection: options.enableMovementDetection !== false,
      movementSensitivity: options.movementSensitivity || 0.5,
      enableTimeoutDiscovery: options.enableTimeoutDiscovery || false,
      maxCamouflageTime: options.maxCamouflageTime || 60000,
      notificationDelay: options.notificationDelay || 500
    };

    this.setupInteractionCallbacks();
  }

  private setupInteractionCallbacks(): void {
    this.interactionDetector.addDiscoveryCallback((result: InteractionResult) => {
      if (result.success && result.discoveredPlayer) {
        this.processDiscovery(
          result.discoveredPlayer,
          result.target.position,
          'interaction',
          result.confidence
        );
      }
    });
  }

  // Player tracking
  updatePlayerPosition(playerId: string, position: THREE.Vector3, isSeeker: boolean = false): void {
    const previousPosition = this.playerPositions.get(playerId);
    this.playerPositions.set(playerId, position.clone());

    // Check for movement-based discovery
    if (previousPosition && this.options.enableMovementDetection && !isSeeker) {
      this.checkMovementDiscovery(playerId, previousPosition, position);
    }

    // Update proximity detection for seekers
    if (isSeeker) {
      this.updateProximityDetection(playerId, position);
    }
  }

  private checkMovementDiscovery(
    playerId: string, 
    previousPosition: THREE.Vector3, 
    currentPosition: THREE.Vector3
  ): void {
    const distance = previousPosition.distanceTo(currentPosition);
    
    if (distance > this.options.movementSensitivity) {
      this.lastMovementTime.set(playerId, Date.now());
      
      // If player is camouflaged and moves too much, increase discovery chance
      const camouflageTargets = this.interactionDetector.getCamouflageTargets();
      const camouflageTarget = camouflageTargets.find(t => t.id === playerId);
      
      if (camouflageTarget && camouflageTarget.player) {
        // Increase discovery chance based on movement
        const movementPenalty = Math.min(0.3, distance * 0.1);
        
        // Check if any seekers are nearby
        this.checkNearbySeekersForMovement(playerId, currentPosition, movementPenalty);
      }
    }
  }

  private checkNearbySeekersForMovement(
    hiderId: string, 
    hiderPosition: THREE.Vector3, 
    movementPenalty: number
  ): void {
    for (const [seekerId, seekerPosition] of this.playerPositions.entries()) {
      if (seekerId === hiderId) continue;
      
      const distance = seekerPosition.distanceTo(hiderPosition);
      
      if (distance <= this.options.proximityDiscoveryRadius * 2) {
        // Calculate discovery chance based on movement and proximity
        const discoveryChance = movementPenalty * (1 - distance / (this.options.proximityDiscoveryRadius * 2));
        
        if (Math.random() < discoveryChance) {
          const hiderTarget = this.interactionDetector.getCamouflageTargets().find(t => t.id === hiderId);
          if (hiderTarget?.player) {
            this.processDiscovery(
              hiderTarget.player,
              hiderPosition,
              'movement',
              discoveryChance
            );
          }
        }
      }
    }
  }

  private updateProximityDetection(seekerId: string, seekerPosition: THREE.Vector3): void {
    if (!this.options.enableProximityDiscovery) return;

    const camouflageTargets = this.interactionDetector.getCamouflageTargets();
    
    for (const target of camouflageTargets) {
      const distance = seekerPosition.distanceTo(target.position);
      
      if (distance <= this.options.proximityDiscoveryRadius) {
        const timerId = `${seekerId}-${target.id}`;
        
        if (!this.proximityTimers.has(timerId)) {
          // Start proximity timer
          const timer = setTimeout(() => {
            if (target.player) {
              this.processDiscovery(
                target.player,
                target.position,
                'proximity',
                0.7 // Medium confidence for proximity discovery
              );
            }
            this.proximityTimers.delete(timerId);
          }, this.options.proximityDiscoveryTime);
          
          this.proximityTimers.set(timerId, timer);
        }
      } else {
        // Cancel proximity timer if seeker moves away
        const timerId = `${seekerId}-${target.id}`;
        const timer = this.proximityTimers.get(timerId);
        if (timer) {
          clearTimeout(timer);
          this.proximityTimers.delete(timerId);
        }
      }
    }
  }

  // Discovery processing
  private processDiscovery(
    discoveredPlayer: Player,
    position: THREE.Vector3,
    method: DiscoveryEvent['discoveryMethod'],
    confidence: number,
    discovererPlayerId?: string
  ): void {
    // Check if player is already discovered
    if (this.discoveredPlayers.has(discoveredPlayer.id)) {
      return;
    }

    // Mark player as discovered
    this.discoveredPlayers.add(discoveredPlayer.id);

    // Create discovery event
    const discoveryEvent: DiscoveryEvent = {
      id: `discovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      discoveredPlayer,
      discovererPlayer: discovererPlayerId ? this.getPlayerById(discovererPlayerId) : discoveredPlayer,
      discoveryMethod: method,
      position: position.clone(),
      timestamp: Date.now(),
      confidence
    };

    this.discoveryEvents.push(discoveryEvent);

    // Send notifications
    this.sendDiscoveryNotifications(discoveryEvent);

    // Clean up camouflage target
    this.interactionDetector.unregisterCamouflagePlayer(discoveredPlayer.id);
  }

  private getPlayerById(playerId: string): Player {
    // This would typically come from a player manager
    // For now, return a basic player object
    return {
      id: playerId,
      username: `Player_${playerId}`,
      role: 'seeker',
      position: this.playerPositions.get(playerId) || new THREE.Vector3(),
      avatar: { model: 'default', skin: 'default', accessories: [] },
      camouflageState: { isActive: false, restrictions: [] }
    };
  }

  // Notification system
  private sendDiscoveryNotifications(event: DiscoveryEvent): void {
    const notifications: DiscoveryNotification[] = [];

    // Notification to all players about discovery
    notifications.push({
      type: 'player_discovered',
      event,
      targetPlayers: ['all'],
      priority: 'high'
    });

    // Send notifications with delay for dramatic effect
    setTimeout(() => {
      notifications.forEach(notification => {
        this.broadcastNotification(notification);
      });
    }, this.options.notificationDelay);
  }

  private broadcastNotification(notification: DiscoveryNotification): void {
    const callbacks = this.notificationCallbacks.get(notification.type) || [];
    
    callbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Notification callback error:', error);
      }
    });

    // Also broadcast to 'all' listeners
    const allCallbacks = this.notificationCallbacks.get('all') || [];
    allCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('All notification callback error:', error);
      }
    });
  }

  // Discovery attempts (for false positives and suspicion)
  recordDiscoveryAttempt(
    seekerPlayerId: string,
    targetPosition: THREE.Vector3,
    wasSuccessful: boolean,
    confidence: number
  ): void {
    const seekerPlayer = this.getPlayerById(seekerPlayerId);
    
    const event: DiscoveryEvent = {
      id: `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      discoveredPlayer: seekerPlayer, // Placeholder
      discovererPlayer: seekerPlayer,
      discoveryMethod: 'interaction',
      position: targetPosition.clone(),
      timestamp: Date.now(),
      confidence
    };

    const notificationType = wasSuccessful ? 'discovery_attempt' : 
                           confidence > 0.5 ? 'suspicion_raised' : 'false_positive';

    const notification: DiscoveryNotification = {
      type: notificationType,
      event,
      targetPlayers: [seekerPlayerId],
      priority: wasSuccessful ? 'medium' : 'low'
    };

    this.broadcastNotification(notification);
  }

  // Callback management
  addNotificationCallback(
    type: DiscoveryNotification['type'] | 'all',
    callback: (notification: DiscoveryNotification) => void
  ): void {
    if (!this.notificationCallbacks.has(type)) {
      this.notificationCallbacks.set(type, []);
    }
    this.notificationCallbacks.get(type)!.push(callback);
  }

  removeNotificationCallback(type: DiscoveryNotification['type'] | 'all', callback: Function): void {
    const callbacks = this.notificationCallbacks.get(type);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Query methods
  isPlayerDiscovered(playerId: string): boolean {
    return this.discoveredPlayers.has(playerId);
  }

  getDiscoveredPlayers(): string[] {
    return Array.from(this.discoveredPlayers);
  }

  getDiscoveryEvents(): DiscoveryEvent[] {
    return [...this.discoveryEvents];
  }

  getRecentDiscoveries(timeWindow: number = 30000): DiscoveryEvent[] {
    const cutoff = Date.now() - timeWindow;
    return this.discoveryEvents.filter(event => event.timestamp >= cutoff);
  }

  getDiscoveryStatistics(): {
    totalDiscoveries: number;
    discoveryMethods: Record<string, number>;
    averageConfidence: number;
    recentDiscoveryRate: number;
  } {
    const total = this.discoveryEvents.length;
    const methods: Record<string, number> = {};
    let totalConfidence = 0;

    this.discoveryEvents.forEach(event => {
      methods[event.discoveryMethod] = (methods[event.discoveryMethod] || 0) + 1;
      totalConfidence += event.confidence;
    });

    const recentEvents = this.getRecentDiscoveries(60000); // Last minute
    const recentRate = recentEvents.length / 60; // Per second

    return {
      totalDiscoveries: total,
      discoveryMethods: methods,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
      recentDiscoveryRate: recentRate
    };
  }

  // Manual discovery (for admin/testing)
  forceDiscovery(playerId: string, discovererPlayerId?: string): boolean {
    const camouflageTargets = this.interactionDetector.getCamouflageTargets();
    const target = camouflageTargets.find(t => t.id === playerId);
    
    if (target?.player) {
      this.processDiscovery(
        target.player,
        target.position,
        'interaction',
        1.0,
        discovererPlayerId
      );
      return true;
    }
    
    return false;
  }

  // Reset discovery state
  resetPlayerDiscovery(playerId: string): void {
    this.discoveredPlayers.delete(playerId);
    
    // Remove related events (optional)
    this.discoveryEvents = this.discoveryEvents.filter(
      event => event.discoveredPlayer.id !== playerId
    );
  }

  resetAllDiscoveries(): void {
    this.discoveredPlayers.clear();
    this.discoveryEvents = [];
    
    // Clear proximity timers
    for (const timer of this.proximityTimers.values()) {
      clearTimeout(timer);
    }
    this.proximityTimers.clear();
  }

  // Configuration updates
  updateOptions(newOptions: Partial<HiderDiscoveryOptions>): void {
    Object.assign(this.options, newOptions);
  }

  getOptions(): HiderDiscoveryOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    // Clear all timers
    for (const timer of this.proximityTimers.values()) {
      clearTimeout(timer);
    }
    
    this.proximityTimers.clear();
    this.discoveredPlayers.clear();
    this.discoveryEvents = [];
    this.notificationCallbacks.clear();
    this.playerPositions.clear();
    this.lastMovementTime.clear();
  }
}