import { GameSession, GameSettings, Player, GameEvent } from '@/types';
import { NetworkManager } from '@/network';
import { PlayerManager } from '@/multiplayer';

export interface SessionEvents {
  sessionCreated: (session: GameSession) => void;
  sessionJoined: (session: GameSession) => void;
  sessionLeft: () => void;
  sessionUpdated: (session: GameSession) => void;
  sessionEnded: (session: GameSession) => void;
  playerJoinedSession: (player: Player) => void;
  playerLeftSession: (playerId: string) => void;
  sessionError: (error: string) => void;
}

export type SessionEventName = keyof SessionEvents;
export type SessionEventHandler<T extends SessionEventName> = SessionEvents[T];

export interface SessionConfig {
  maxPlayers: number;
  isPrivate: boolean;
  allowSpectators: boolean;
  autoStart: boolean;
  minPlayersToStart: number;
}

export class SessionManager {
  private networkManager: NetworkManager;
  private playerManager: PlayerManager;
  private currentSession: GameSession | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private isHost: boolean = false;
  private sessionConfig: SessionConfig;

  constructor(networkManager: NetworkManager, playerManager: PlayerManager) {
    this.networkManager = networkManager;
    this.playerManager = playerManager;
    this.sessionConfig = {
      maxPlayers: 8,
      isPrivate: false,
      allowSpectators: true,
      autoStart: false,
      minPlayersToStart: 2
    };

    this.setupNetworkEventHandlers();
  }

  private setupNetworkEventHandlers(): void {
    this.networkManager.on('roomJoined', (roomCode: string) => {
      this.handleRoomJoined(roomCode);
    });

    this.networkManager.on('roomLeft', () => {
      this.handleRoomLeft();
    });

    this.networkManager.on('roomError', (error: string) => {
      this.emitToHandlers('sessionError', error);
    });

    this.networkManager.on('playerJoined', (player: Player) => {
      this.handlePlayerJoinedSession(player);
    });

    this.networkManager.on('playerLeft', (playerId: string) => {
      this.handlePlayerLeftSession(playerId);
    });
  }

  public async createSession(settings: GameSettings, config?: Partial<SessionConfig>): Promise<GameSession> {
    const localPlayerId = this.playerManager.getLocalPlayerId();
    if (!localPlayerId) {
      throw new Error('No local player set');
    }

    // Update session config
    if (config) {
      this.sessionConfig = { ...this.sessionConfig, ...config };
    }

    // Generate room code
    const roomCode = this.generateRoomCode();

    // Create session
    const session: GameSession = {
      id: this.generateSessionId(),
      roomCode,
      mapId: settings.mapId,
      players: [],
      gameState: {
        id: this.generateSessionId(),
        phase: 'waiting',
        players: [],
        timeRemaining: 0,
        settings,
        startTime: new Date(),
        events: []
      },
      settings,
      startTime: new Date(),
      duration: 0,
      events: [],
      createdBy: localPlayerId,
      isPrivate: this.sessionConfig.isPrivate,
      maxPlayers: this.sessionConfig.maxPlayers
    };

    this.currentSession = session;
    this.isHost = true;

    // Join the room on network
    try {
      await this.networkManager.joinRoom(roomCode);
      this.emitToHandlers('sessionCreated', session);
      console.log(`Created session ${session.id} with room code ${roomCode}`);
      return session;
    } catch (error) {
      this.currentSession = null;
      this.isHost = false;
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  public async joinSession(roomCode: string): Promise<GameSession> {
    if (this.currentSession) {
      throw new Error('Already in a session');
    }

    try {
      await this.networkManager.joinRoom(roomCode);
      // Session will be set when we receive room joined event
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for session data'));
        }, 10000);

        const handler = (session: GameSession) => {
          clearTimeout(timeout);
          this.off('sessionJoined', handler);
          resolve(session);
        };

        this.on('sessionJoined', handler);
      });
    } catch (error) {
      throw new Error(`Failed to join session: ${error}`);
    }
  }

  public leaveSession(): void {
    if (!this.currentSession) {
      console.warn('Not in a session');
      return;
    }

    const session = this.currentSession;
    this.currentSession = null;
    this.isHost = false;

    this.networkManager.leaveRoom();
    this.emitToHandlers('sessionLeft');
    
    console.log(`Left session ${session.id}`);
  }

  public updateSessionSettings(settings: Partial<GameSettings>): boolean {
    if (!this.isHost || !this.currentSession) {
      console.warn('Only host can update session settings');
      return false;
    }

    this.currentSession.settings = { ...this.currentSession.settings, ...settings };
    this.currentSession.gameState.settings = this.currentSession.settings;

    // Broadcast update (would be handled by network layer)
    this.emitToHandlers('sessionUpdated', this.currentSession);
    
    console.log('Session settings updated');
    return true;
  }

  public kickPlayer(playerId: string): boolean {
    if (!this.isHost || !this.currentSession) {
      console.warn('Only host can kick players');
      return false;
    }

    const playerIndex = this.currentSession.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      console.warn('Player not found in session');
      return false;
    }

    // Remove from session
    this.currentSession.players.splice(playerIndex, 1);
    this.currentSession.gameState.players = this.currentSession.players;

    // This would be handled by network layer to actually kick the player
    console.log(`Kicked player ${playerId} from session`);
    return true;
  }

  public transferHost(newHostId: string): boolean {
    if (!this.isHost || !this.currentSession) {
      console.warn('Only current host can transfer host');
      return false;
    }

    const newHost = this.currentSession.players.find(p => p.id === newHostId);
    if (!newHost) {
      console.warn('New host not found in session');
      return false;
    }

    this.currentSession.createdBy = newHostId;
    this.isHost = false;

    // This would be handled by network layer
    console.log(`Transferred host to ${newHost.username}`);
    return true;
  }

  private handleRoomJoined(roomCode: string): void {
    if (!this.currentSession) {
      // We joined someone else's session
      // In a real implementation, we'd receive session data from the host
      const mockSession: GameSession = {
        id: 'received_session',
        roomCode,
        mapId: 'default',
        players: [],
        gameState: {
          id: 'received_state',
          phase: 'waiting',
          players: [],
          timeRemaining: 0,
          settings: {
            maxPlayers: 8,
            hidingTime: 60,
            seekingTime: 180,
            mapId: 'default'
          },
          startTime: new Date(),
          events: []
        },
        settings: {
          maxPlayers: 8,
          hidingTime: 60,
          seekingTime: 180,
          mapId: 'default'
        },
        startTime: new Date(),
        duration: 0,
        events: [],
        createdBy: 'unknown',
        isPrivate: false,
        maxPlayers: 8
      };

      this.currentSession = mockSession;
      this.emitToHandlers('sessionJoined', mockSession);
    }
  }

  private handleRoomLeft(): void {
    if (this.currentSession) {
      const session = this.currentSession;
      this.currentSession = null;
      this.isHost = false;
      this.emitToHandlers('sessionLeft');
    }
  }

  private handlePlayerJoinedSession(player: Player): void {
    if (!this.currentSession) return;

    // Check if player already in session
    if (this.currentSession.players.some(p => p.id === player.id)) {
      return;
    }

    // Check max players
    if (this.currentSession.players.length >= this.currentSession.maxPlayers) {
      console.warn('Session is full');
      return;
    }

    // Add player to session
    this.currentSession.players.push(player);
    this.currentSession.gameState.players = this.currentSession.players;

    // Add join event
    const joinEvent: GameEvent = {
      id: this.generateEventId(),
      type: 'player_joined',
      playerId: player.id,
      timestamp: new Date(),
      data: { username: player.username }
    };

    this.currentSession.events.push(joinEvent);
    this.currentSession.gameState.events.push(joinEvent);

    this.emitToHandlers('playerJoinedSession', player);
    this.emitToHandlers('sessionUpdated', this.currentSession);

    console.log(`Player ${player.username} joined session`);

    // Auto-start if enabled and minimum players reached
    if (this.isHost && 
        this.sessionConfig.autoStart && 
        this.currentSession.players.length >= this.sessionConfig.minPlayersToStart &&
        this.currentSession.gameState.phase === 'waiting') {
      // This would trigger game start
      console.log('Auto-starting game');
    }
  }

  private handlePlayerLeftSession(playerId: string): void {
    if (!this.currentSession) return;

    const playerIndex = this.currentSession.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const player = this.currentSession.players[playerIndex];
    this.currentSession.players.splice(playerIndex, 1);
    this.currentSession.gameState.players = this.currentSession.players;

    // Add leave event
    const leaveEvent: GameEvent = {
      id: this.generateEventId(),
      type: 'player_left',
      playerId,
      timestamp: new Date(),
      data: { username: player.username }
    };

    this.currentSession.events.push(leaveEvent);
    this.currentSession.gameState.events.push(leaveEvent);

    this.emitToHandlers('playerLeftSession', playerId);
    this.emitToHandlers('sessionUpdated', this.currentSession);

    console.log(`Player ${player.username} left session`);

    // Handle host leaving
    if (this.currentSession.createdBy === playerId && this.currentSession.players.length > 0) {
      // Transfer host to first remaining player
      const newHost = this.currentSession.players[0];
      this.currentSession.createdBy = newHost.id;
      
      if (this.playerManager.getLocalPlayerId() === newHost.id) {
        this.isHost = true;
        console.log('You are now the host');
      }
    }
  }

  // Getters
  public getCurrentSession(): GameSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  public isInSession(): boolean {
    return this.currentSession !== null;
  }

  public isSessionHost(): boolean {
    return this.isHost;
  }

  public getSessionPlayerCount(): number {
    return this.currentSession?.players.length || 0;
  }

  public canStartGame(): boolean {
    return this.isHost && 
           this.currentSession !== null && 
           this.currentSession.players.length >= this.sessionConfig.minPlayersToStart &&
           this.currentSession.gameState.phase === 'waiting';
  }

  public getSessionConfig(): SessionConfig {
    return { ...this.sessionConfig };
  }

  public updateSessionConfig(config: Partial<SessionConfig>): void {
    this.sessionConfig = { ...this.sessionConfig, ...config };
  }

  // Utility methods
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }

  private generateEventId(): string {
    return 'event_' + Math.random().toString(36).substring(2, 15);
  }

  // Event handling
  public on<T extends SessionEventName>(
    eventName: T,
    handler: SessionEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends SessionEventName>(
    eventName: T,
    handler: SessionEventHandler<T>
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
          console.error(`Error in session event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public dispose(): void {
    if (this.currentSession) {
      this.leaveSession();
    }
    this.eventHandlers.clear();
  }
}