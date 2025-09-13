import { SocketManager, ConnectionState } from './SocketManager';
import { Player, Vector3, GameState } from '@/types';

export interface NetworkEvents {
  connectionStateChanged: (state: ConnectionState) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  playerPositionUpdated: (playerId: string, position: Vector3, rotation?: number) => void;
  playerRoleChanged: (playerId: string, role: 'hider' | 'seeker') => void;
  playerCamouflageChanged: (playerId: string, isActive: boolean, objectType?: string) => void;
  gameStateUpdated: (gameState: GameState) => void;
  gameStarted: () => void;
  gameEnded: (winner: 'hiders' | 'seekers') => void;
  phaseChanged: (phase: 'waiting' | 'hiding' | 'seeking' | 'ended') => void;
  roomJoined: (roomCode: string) => void;
  roomLeft: () => void;
  roomError: (error: string) => void;
  chatMessage: (playerId: string, message: string) => void;
}

export type NetworkEventName = keyof NetworkEvents;
export type NetworkEventHandler<T extends NetworkEventName> = NetworkEvents[T];

export class NetworkManager {
  private socketManager: SocketManager;
  private eventHandlers: Map<string, Function[]> = new Map();
  private currentRoomCode: string | null = null;
  private playerId: string | null = null;
  private isInitialized: boolean = false;

  constructor(serverUrl?: string) {
    this.socketManager = new SocketManager(serverUrl);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.socketManager.connect();
      this.setupSocketEventHandlers();
      this.isInitialized = true;
      this.emitToHandlers('connectionStateChanged', this.socketManager.getConnectionState());
    } catch (error) {
      console.error('Failed to initialize network manager:', error);
      throw error;
    }
  }

  private setupSocketEventHandlers(): void {
    // Connection events
    this.socketManager.on('connect', () => {
      this.emitToHandlers('connectionStateChanged', ConnectionState.CONNECTED);
    });

    this.socketManager.on('disconnect', (reason) => {
      this.emitToHandlers('connectionStateChanged', ConnectionState.DISCONNECTED);
    });

    this.socketManager.on('connect_error', (error) => {
      this.emitToHandlers('connectionStateChanged', ConnectionState.ERROR);
    });

    // Player events
    this.socketManager.on('player_joined', (player) => {
      this.emitToHandlers('playerJoined', player);
    });

    this.socketManager.on('player_left', (playerId) => {
      this.emitToHandlers('playerLeft', playerId);
    });

    this.socketManager.on('player_position_update', (data) => {
      this.emitToHandlers('playerPositionUpdated', data.playerId, data.position, data.rotation);
    });

    this.socketManager.on('player_role_changed', (data) => {
      this.emitToHandlers('playerRoleChanged', data.playerId, data.role);
    });

    this.socketManager.on('player_camouflage_changed', (data) => {
      this.emitToHandlers('playerCamouflageChanged', data.playerId, data.isActive, data.objectType);
    });

    // Game events
    this.socketManager.on('game_state_update', (gameState) => {
      this.emitToHandlers('gameStateUpdated', gameState);
    });

    this.socketManager.on('game_started', () => {
      this.emitToHandlers('gameStarted');
    });

    this.socketManager.on('game_ended', (winner) => {
      this.emitToHandlers('gameEnded', winner);
    });

    this.socketManager.on('phase_changed', (phase) => {
      this.emitToHandlers('phaseChanged', phase);
    });

    // Room events
    this.socketManager.on('room_joined', (roomCode) => {
      this.currentRoomCode = roomCode;
      this.emitToHandlers('roomJoined', roomCode);
    });

    this.socketManager.on('room_left', () => {
      this.currentRoomCode = null;
      this.emitToHandlers('roomLeft');
    });

    this.socketManager.on('room_error', (error) => {
      this.emitToHandlers('roomError', error);
    });
  }

  public on<T extends NetworkEventName>(
    eventName: T,
    handler: NetworkEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends NetworkEventName>(
    eventName: T,
    handler: NetworkEventHandler<T>
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
          console.error(`Error in network event handler for ${eventName}:`, error);
        }
      });
    }
  }

  // Connection management
  public async connect(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  public disconnect(): void {
    this.socketManager.disconnect();
    this.currentRoomCode = null;
    this.playerId = null;
    this.isInitialized = false;
  }

  public getConnectionState(): ConnectionState {
    return this.socketManager.getConnectionState();
  }

  public isConnected(): boolean {
    return this.socketManager.isConnected();
  }

  // Room management
  public async joinRoom(roomCode: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server');
    }
    this.socketManager.joinRoom(roomCode);
  }

  public leaveRoom(): void {
    if (this.currentRoomCode) {
      this.socketManager.leaveRoom();
    }
  }

  public getCurrentRoomCode(): string | null {
    return this.currentRoomCode;
  }

  // Player actions
  public updatePosition(position: Vector3, rotation?: number): void {
    if (!this.isConnected()) {
      console.warn('Cannot update position: Not connected to server');
      return;
    }
    this.socketManager.updatePlayerPosition(position, rotation);
  }

  public updateCamouflage(isActive: boolean, objectType?: string): void {
    if (!this.isConnected()) {
      console.warn('Cannot update camouflage: Not connected to server');
      return;
    }
    this.socketManager.updatePlayerCamouflage(isActive, objectType);
  }

  public sendChatMessage(message: string): void {
    if (!this.isConnected()) {
      console.warn('Cannot send chat message: Not connected to server');
      return;
    }
    this.socketManager.sendChatMessage(message);
  }

  // Game actions
  public startGame(): void {
    if (!this.isConnected()) {
      console.warn('Cannot start game: Not connected to server');
      return;
    }
    this.socketManager.startGame();
  }

  public endGame(): void {
    if (!this.isConnected()) {
      console.warn('Cannot end game: Not connected to server');
      return;
    }
    this.socketManager.endGame();
  }

  // Utility methods
  public setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  public getPlayerId(): string | null {
    return this.playerId;
  }

  public getSocketManager(): SocketManager {
    return this.socketManager;
  }
}