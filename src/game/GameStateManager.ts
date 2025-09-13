import { GameState, GameSession, GameSettings, Player, Vector3 } from '@/types';
import { PlayerManager } from '@/multiplayer';
import { NetworkManager } from '@/network';

export interface GameStateEvents {
  stateChanged: (newState: GameState, previousState: GameState) => void;
  phaseChanged: (phase: 'waiting' | 'hiding' | 'seeking' | 'ended', timeRemaining: number) => void;
  gameStarted: (gameState: GameState) => void;
  gameEnded: (winner: 'hiders' | 'seekers', gameState: GameState) => void;
  playerFound: (seekerId: string, hiderId: string) => void;
  timerUpdate: (timeRemaining: number, phase: 'hiding' | 'seeking') => void;
}

export type GameStateEventName = keyof GameStateEvents;
export type GameStateEventHandler<T extends GameStateEventName> = GameStateEvents[T];

export class GameStateManager {
  private playerManager: PlayerManager;
  private networkManager: NetworkManager;
  private currentState: GameState | null = null;
  private currentSession: GameSession | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private gameTimer: NodeJS.Timeout | null = null;
  private isHost: boolean = false;
  private isInitialized: boolean = false;

  constructor(playerManager: PlayerManager, networkManager: NetworkManager) {
    this.playerManager = playerManager;
    this.networkManager = networkManager;
  }

  public initialize(isHost: boolean = false): void {
    if (this.isInitialized) return;

    this.isHost = isHost;
    this.setupNetworkEventHandlers();
    this.isInitialized = true;
  }

  private setupNetworkEventHandlers(): void {
    this.networkManager.on('gameStateUpdated', (gameState: GameState) => {
      this.handleGameStateUpdate(gameState);
    });

    this.networkManager.on('gameStarted', () => {
      this.handleGameStarted();
    });

    this.networkManager.on('gameEnded', (winner: 'hiders' | 'seekers') => {
      this.handleGameEnded(winner);
    });

    this.networkManager.on('phaseChanged', (phase: 'waiting' | 'hiding' | 'seeking' | 'ended') => {
      this.handlePhaseChanged(phase);
    });
  }

  public createGameSession(settings: GameSettings, roomCode: string): GameSession {
    const sessionId = this.generateSessionId();
    const localPlayerId = this.playerManager.getLocalPlayerId();
    
    if (!localPlayerId) {
      throw new Error('No local player set');
    }

    const session: GameSession = {
      id: sessionId,
      roomCode,
      mapId: settings.mapId,
      players: [],
      gameState: this.createInitialGameState(sessionId, settings),
      settings,
      startTime: new Date(),
      duration: 0,
      events: [],
      createdBy: localPlayerId,
      isPrivate: false,
      maxPlayers: settings.maxPlayers
    };

    this.currentSession = session;
    this.currentState = session.gameState;

    console.log(`Created game session ${sessionId} with room code ${roomCode}`);
    return session;
  }

  private createInitialGameState(sessionId: string, settings: GameSettings): GameState {
    return {
      id: sessionId,
      phase: 'waiting',
      players: [],
      timeRemaining: 0,
      settings,
      startTime: new Date(),
      events: []
    };
  }

  public startGame(): boolean {
    if (!this.isHost) {
      console.warn('Only the host can start the game');
      return false;
    }

    if (!this.currentState || this.currentState.phase !== 'waiting') {
      console.warn('Cannot start game: invalid state');
      return false;
    }

    const players = this.playerManager.getAllPlayers();
    if (players.length < 2) {
      console.warn('Cannot start game: need at least 2 players');
      return false;
    }

    // Update game state
    const previousState = { ...this.currentState };
    this.currentState.phase = 'hiding';
    this.currentState.timeRemaining = this.currentState.settings.hidingTime;
    this.currentState.players = players;
    this.currentState.startTime = new Date();

    // Start hiding phase timer
    this.startPhaseTimer('hiding', this.currentState.settings.hidingTime);

    // Notify network
    this.networkManager.startGame();

    // Emit events
    this.emitToHandlers('stateChanged', this.currentState, previousState);
    this.emitToHandlers('phaseChanged', 'hiding', this.currentState.timeRemaining);
    this.emitToHandlers('gameStarted', this.currentState);

    console.log('Game started - hiding phase begins');
    return true;
  }

  public endGame(winner?: 'hiders' | 'seekers'): void {
    if (!this.currentState) return;

    const previousState = { ...this.currentState };
    this.currentState.phase = 'ended';
    this.currentState.timeRemaining = 0;

    // Stop any running timers
    this.stopTimer();

    // Determine winner if not provided
    const finalWinner = winner || this.determineWinner();

    // Update session duration
    if (this.currentSession) {
      this.currentSession.duration = Date.now() - this.currentSession.startTime.getTime();
    }

    // Notify network if host
    if (this.isHost) {
      this.networkManager.endGame();
    }

    // Emit events
    this.emitToHandlers('stateChanged', this.currentState, previousState);
    this.emitToHandlers('phaseChanged', 'ended', 0);
    this.emitToHandlers('gameEnded', finalWinner, this.currentState);

    console.log(`Game ended - winner: ${finalWinner}`);
  }

  private determineWinner(): 'hiders' | 'seekers' {
    if (!this.currentState) return 'seekers';

    const hiders = this.playerManager.getPlayersByRole('hider');
    const foundHiders = hiders.filter(player => 
      this.currentState!.events.some(event => 
        event.type === 'player_found' && event.playerId === player.id
      )
    );

    // If all hiders are found, seekers win
    if (foundHiders.length === hiders.length) {
      return 'seekers';
    }

    // If time runs out and some hiders are still hidden, hiders win
    return 'hiders';
  }

  private startPhaseTimer(phase: 'hiding' | 'seeking', duration: number): void {
    this.stopTimer();

    let timeRemaining = duration;
    
    this.gameTimer = setInterval(() => {
      timeRemaining--;
      
      if (this.currentState) {
        this.currentState.timeRemaining = timeRemaining;
      }

      // Emit timer update
      this.emitToHandlers('timerUpdate', timeRemaining, phase);

      // Check if time is up
      if (timeRemaining <= 0) {
        this.handlePhaseTimeout(phase);
      }
    }, 1000);
  }

  private handlePhaseTimeout(phase: 'hiding' | 'seeking'): void {
    this.stopTimer();

    if (!this.currentState) return;

    if (phase === 'hiding') {
      // Switch to seeking phase
      const previousState = { ...this.currentState };
      this.currentState.phase = 'seeking';
      this.currentState.timeRemaining = this.currentState.settings.seekingTime;

      this.startPhaseTimer('seeking', this.currentState.settings.seekingTime);

      this.emitToHandlers('stateChanged', this.currentState, previousState);
      this.emitToHandlers('phaseChanged', 'seeking', this.currentState.timeRemaining);

      console.log('Hiding phase ended - seeking phase begins');
    } else if (phase === 'seeking') {
      // Game ends - hiders win if not all found
      this.endGame('hiders');
    }
  }

  private stopTimer(): void {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }

  public reportPlayerFound(seekerId: string, hiderId: string): boolean {
    if (!this.currentState || this.currentState.phase !== 'seeking') {
      console.warn('Cannot report player found: not in seeking phase');
      return false;
    }

    const seeker = this.playerManager.getPlayer(seekerId);
    const hider = this.playerManager.getPlayer(hiderId);

    if (!seeker || !hider) {
      console.warn('Invalid player IDs for found report');
      return false;
    }

    if (seeker.role !== 'seeker' || hider.role !== 'hider') {
      console.warn('Invalid roles for found report');
      return false;
    }

    // Add event to game state
    const foundEvent = {
      id: this.generateEventId(),
      type: 'player_found' as const,
      playerId: hiderId,
      timestamp: new Date(),
      data: { seekerId, hiderId }
    };

    this.currentState.events.push(foundEvent);

    // Emit event
    this.emitToHandlers('playerFound', seekerId, hiderId);

    // Check if all hiders are found
    const hiders = this.playerManager.getPlayersByRole('hider');
    const foundHiders = hiders.filter(player => 
      this.currentState!.events.some(event => 
        event.type === 'player_found' && event.playerId === player.id
      )
    );

    if (foundHiders.length === hiders.length) {
      // All hiders found - seekers win
      this.endGame('seekers');
    }

    console.log(`Player ${hider.username} found by ${seeker.username}`);
    return true;
  }

  private handleGameStateUpdate(gameState: GameState): void {
    if (!this.currentState) {
      this.currentState = gameState;
      return;
    }

    const previousState = { ...this.currentState };
    this.currentState = gameState;

    // Handle phase changes
    if (previousState.phase !== gameState.phase) {
      this.emitToHandlers('phaseChanged', gameState.phase, gameState.timeRemaining);
    }

    this.emitToHandlers('stateChanged', gameState, previousState);
  }

  private handleGameStarted(): void {
    if (this.currentState) {
      this.emitToHandlers('gameStarted', this.currentState);
    }
  }

  private handleGameEnded(winner: 'hiders' | 'seekers'): void {
    if (this.currentState) {
      this.currentState.phase = 'ended';
      this.stopTimer();
      this.emitToHandlers('gameEnded', winner, this.currentState);
    }
  }

  private handlePhaseChanged(phase: 'waiting' | 'hiding' | 'seeking' | 'ended'): void {
    if (this.currentState) {
      this.currentState.phase = phase;
      this.emitToHandlers('phaseChanged', phase, this.currentState.timeRemaining);
    }
  }

  // Getters
  public getCurrentState(): GameState | null {
    return this.currentState ? { ...this.currentState } : null;
  }

  public getCurrentSession(): GameSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  public getCurrentPhase(): 'waiting' | 'hiding' | 'seeking' | 'ended' | null {
    return this.currentState?.phase || null;
  }

  public getTimeRemaining(): number {
    return this.currentState?.timeRemaining || 0;
  }

  public isGameActive(): boolean {
    return this.currentState?.phase === 'hiding' || this.currentState?.phase === 'seeking';
  }

  public isWaitingForPlayers(): boolean {
    return this.currentState?.phase === 'waiting';
  }

  public isGameEnded(): boolean {
    return this.currentState?.phase === 'ended';
  }

  public getGameDuration(): number {
    if (!this.currentState) return 0;
    return Date.now() - this.currentState.startTime.getTime();
  }

  // Utility methods
  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }

  private generateEventId(): string {
    return 'event_' + Math.random().toString(36).substring(2, 15);
  }

  // Event handling
  public on<T extends GameStateEventName>(
    eventName: T,
    handler: GameStateEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends GameStateEventName>(
    eventName: T,
    handler: GameStateEventHandler<T>
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
          console.error(`Error in game state event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public dispose(): void {
    this.stopTimer();
    this.eventHandlers.clear();
    this.currentState = null;
    this.currentSession = null;
    this.isInitialized = false;
  }
}