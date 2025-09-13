import { Player, Vector3 } from '@/types';
import { GameEngine } from '@/engine';
import { NetworkManager } from '@/network';

export interface PlayerManagerEvents {
  playerSpawned: (player: Player) => void;
  playerDespawned: (playerId: string) => void;
  playerMoved: (playerId: string, position: Vector3, rotation?: number) => void;
  playerRoleChanged: (playerId: string, role: 'hider' | 'seeker') => void;
  playerCamouflageChanged: (playerId: string, isActive: boolean, objectType?: string) => void;
}

export type PlayerManagerEventName = keyof PlayerManagerEvents;
export type PlayerManagerEventHandler<T extends PlayerManagerEventName> = PlayerManagerEvents[T];

export class PlayerManager {
  private gameEngine: GameEngine;
  private networkManager: NetworkManager;
  private players: Map<string, Player> = new Map();
  private localPlayerId: string | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private spawnPoints: Vector3[] = [];
  private isInitialized: boolean = false;

  constructor(gameEngine: GameEngine, networkManager: NetworkManager) {
    this.gameEngine = gameEngine;
    this.networkManager = networkManager;
    this.setupDefaultSpawnPoints();
  }

  public initialize(): void {
    if (this.isInitialized) return;

    this.setupNetworkEventHandlers();
    this.isInitialized = true;
  }

  private setupDefaultSpawnPoints(): void {
    // Create spawn points in a circle around the center
    const radius = 15;
    const numPoints = 8;
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      this.spawnPoints.push({
        x: Math.cos(angle) * radius,
        y: 0,
        z: Math.sin(angle) * radius
      });
    }
  }

  private setupNetworkEventHandlers(): void {
    this.networkManager.on('playerJoined', (player: Player) => {
      this.handlePlayerJoined(player);
    });

    this.networkManager.on('playerLeft', (playerId: string) => {
      this.handlePlayerLeft(playerId);
    });

    this.networkManager.on('playerPositionUpdated', (playerId: string, position: Vector3, rotation?: number) => {
      this.handlePlayerPositionUpdate(playerId, position, rotation);
    });

    this.networkManager.on('playerRoleChanged', (playerId: string, role: 'hider' | 'seeker') => {
      this.handlePlayerRoleChange(playerId, role);
    });

    this.networkManager.on('playerCamouflageChanged', (playerId: string, isActive: boolean, objectType?: string) => {
      this.handlePlayerCamouflageChange(playerId, isActive, objectType);
    });
  }

  private handlePlayerJoined(player: Player): void {
    if (this.players.has(player.id)) {
      console.warn(`Player ${player.id} already exists`);
      return;
    }

    // Assign spawn point
    const spawnPoint = this.getAvailableSpawnPoint();
    player.position = spawnPoint;

    // Add to local tracking
    this.players.set(player.id, player);

    // Add to 3D engine
    this.gameEngine.addPlayer(player);

    console.log(`Player ${player.username} joined at position`, spawnPoint);
    this.emitToHandlers('playerSpawned', player);
  }

  private handlePlayerLeft(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found`);
      return;
    }

    // Remove from 3D engine
    this.gameEngine.removePlayer(playerId);

    // Remove from local tracking
    this.players.delete(playerId);

    console.log(`Player ${player.username} left`);
    this.emitToHandlers('playerDespawned', playerId);
  }

  private handlePlayerPositionUpdate(playerId: string, position: Vector3, rotation?: number): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found for position update`);
      return;
    }

    // Update local player data
    player.position = position;

    // Update 3D engine
    this.gameEngine.updatePlayerPosition(playerId, position);
    if (rotation !== undefined) {
      this.gameEngine.updatePlayerRotation(playerId, rotation);
    }

    this.emitToHandlers('playerMoved', playerId, position, rotation);
  }

  private handlePlayerRoleChange(playerId: string, role: 'hider' | 'seeker'): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found for role change`);
      return;
    }

    // Update local player data
    player.role = role;

    // Update 3D engine (this will change avatar color)
    const avatar = this.gameEngine['players'].get(playerId);
    if (avatar) {
      avatar.setRole(role);
    }

    this.emitToHandlers('playerRoleChanged', playerId, role);
  }

  private handlePlayerCamouflageChange(playerId: string, isActive: boolean, objectType?: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found for camouflage change`);
      return;
    }

    // Update local player data
    player.camouflageState.isActive = isActive;
    player.camouflageState.objectType = objectType || '';

    // Update 3D engine
    this.gameEngine.setPlayerCamouflage(playerId, isActive, objectType);

    this.emitToHandlers('playerCamouflageChanged', playerId, isActive, objectType);
  }

  private getAvailableSpawnPoint(): Vector3 {
    // Find spawn point that's not too close to existing players
    const minDistance = 5;
    
    for (const spawnPoint of this.spawnPoints) {
      let tooClose = false;
      
      for (const player of this.players.values()) {
        const distance = this.calculateDistance(spawnPoint, player.position);
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        return { ...spawnPoint };
      }
    }
    
    // If all spawn points are occupied, use a random one
    const randomIndex = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[randomIndex] };
  }

  private calculateDistance(pos1: Vector3, pos2: Vector3): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Public methods for local player management
  public setLocalPlayer(playerId: string): void {
    this.localPlayerId = playerId;
    this.networkManager.setPlayerId(playerId);
  }

  public getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  public getLocalPlayer(): Player | null {
    if (!this.localPlayerId) return null;
    return this.players.get(this.localPlayerId) || null;
  }

  public getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  public getPlayer(playerId: string): Player | null {
    return this.players.get(playerId) || null;
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public getPlayersByRole(role: 'hider' | 'seeker'): Player[] {
    return Array.from(this.players.values()).filter(player => player.role === role);
  }

  // Local player actions (will be sent to network)
  public moveLocalPlayer(position: Vector3, rotation?: number): void {
    if (!this.localPlayerId) {
      console.warn('No local player set');
      return;
    }

    const player = this.players.get(this.localPlayerId);
    if (!player) {
      console.warn('Local player not found');
      return;
    }

    // Update local immediately for responsiveness
    player.position = position;
    this.gameEngine.updatePlayerPosition(this.localPlayerId, position);
    if (rotation !== undefined) {
      this.gameEngine.updatePlayerRotation(this.localPlayerId, rotation);
    }

    // Send to network
    this.networkManager.updatePosition(position, rotation);
  }

  public setLocalPlayerCamouflage(isActive: boolean, objectType?: string): void {
    if (!this.localPlayerId) {
      console.warn('No local player set');
      return;
    }

    const player = this.players.get(this.localPlayerId);
    if (!player) {
      console.warn('Local player not found');
      return;
    }

    // Update local immediately
    player.camouflageState.isActive = isActive;
    player.camouflageState.objectType = objectType || '';
    this.gameEngine.setPlayerCamouflage(this.localPlayerId, isActive, objectType);

    // Send to network
    this.networkManager.updateCamouflage(isActive, objectType);
  }

  // Role assignment (typically done by game host)
  public assignPlayerRole(playerId: string, role: 'hider' | 'seeker'): void {
    const player = this.players.get(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found for role assignment`);
      return;
    }

    // This would typically be sent through a different network event
    // For now, we'll update locally and assume it gets synchronized
    this.handlePlayerRoleChange(playerId, role);
  }

  // Spawn point management
  public addSpawnPoint(position: Vector3): void {
    this.spawnPoints.push({ ...position });
  }

  public removeSpawnPoint(index: number): void {
    if (index >= 0 && index < this.spawnPoints.length) {
      this.spawnPoints.splice(index, 1);
    }
  }

  public getSpawnPoints(): Vector3[] {
    return [...this.spawnPoints];
  }

  // Event handling
  public on<T extends PlayerManagerEventName>(
    eventName: T,
    handler: PlayerManagerEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends PlayerManagerEventName>(
    eventName: T,
    handler: PlayerManagerEventHandler<T>
  ): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emitToHandlers(eventName: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in player manager event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public dispose(): void {
    // Remove all players from 3D engine
    for (const playerId of this.players.keys()) {
      this.gameEngine.removePlayer(playerId);
    }

    // Clear local data
    this.players.clear();
    this.eventHandlers.clear();
    this.localPlayerId = null;
    this.isInitialized = false;
  }
}