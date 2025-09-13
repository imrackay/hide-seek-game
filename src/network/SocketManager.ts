import { io, Socket } from 'socket.io-client';
import { Player, Vector3, GameState } from '@/types';

export interface SocketEvents {
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  
  // Player events
  player_joined: (player: Player) => void;
  player_left: (playerId: string) => void;
  player_position_update: (data: { playerId: string; position: Vector3; rotation?: number }) => void;
  player_role_changed: (data: { playerId: string; role: 'hider' | 'seeker' }) => void;
  player_camouflage_changed: (data: { playerId: string; isActive: boolean; objectType?: string }) => void;
  
  // Game events
  game_state_update: (gameState: GameState) => void;
  game_started: () => void;
  game_ended: (winner: 'hiders' | 'seekers') => void;
  phase_changed: (phase: 'waiting' | 'hiding' | 'seeking' | 'ended') => void;
  
  // Room events
  room_joined: (roomCode: string) => void;
  room_left: () => void;
  room_error: (error: string) => void;
}

export type SocketEventName = keyof SocketEvents;
export type SocketEventHandler<T extends SocketEventName> = SocketEvents[T];

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export class SocketManager {
  private socket: Socket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private eventHandlers: Map<string, Function[]> = new Map();
  private serverUrl: string;

  constructor(serverUrl: string = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.connectionState = ConnectionState.CONNECTING;

      this.socket = io(this.serverUrl, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        timeout: 10000,
      });

      this.setupEventListeners();

      this.socket.on('connect', () => {
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0;
        console.log('Connected to server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        this.connectionState = ConnectionState.ERROR;
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        this.connectionState = ConnectionState.DISCONNECTED;
        console.log('Disconnected from server:', reason);
        
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          this.handleReconnection();
        }
      });
    });
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Forward all events to registered handlers
    const eventNames: SocketEventName[] = [
      'connect', 'disconnect', 'connect_error',
      'player_joined', 'player_left', 'player_position_update', 
      'player_role_changed', 'player_camouflage_changed',
      'game_state_update', 'game_started', 'game_ended', 'phase_changed',
      'room_joined', 'room_left', 'room_error'
    ];

    eventNames.forEach(eventName => {
      this.socket!.on(eventName, (...args: any[]) => {
        this.emitToHandlers(eventName, ...args);
      });
    });
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.connectionState = ConnectionState.ERROR;
      console.error('Max reconnection attempts reached');
      return;
    }

    this.connectionState = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect().catch(() => {
        this.handleReconnection();
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionState = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
  }

  public emit(eventName: string, data?: any): void {
    if (this.socket && this.connectionState === ConnectionState.CONNECTED) {
      this.socket.emit(eventName, data);
    } else {
      console.warn(`Cannot emit ${eventName}: Socket not connected`);
    }
  }

  public on<T extends SocketEventName>(
    eventName: T, 
    handler: SocketEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends SocketEventName>(
    eventName: T, 
    handler: SocketEventHandler<T>
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
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  // Game-specific methods
  public joinRoom(roomCode: string): void {
    this.emit('join_room', { roomCode });
  }

  public leaveRoom(): void {
    this.emit('leave_room');
  }

  public updatePlayerPosition(position: Vector3, rotation?: number): void {
    this.emit('update_position', { position, rotation });
  }

  public updatePlayerCamouflage(isActive: boolean, objectType?: string): void {
    this.emit('update_camouflage', { isActive, objectType });
  }

  public sendChatMessage(message: string): void {
    this.emit('chat_message', { message });
  }

  public startGame(): void {
    this.emit('start_game');
  }

  public endGame(): void {
    this.emit('end_game');
  }
}