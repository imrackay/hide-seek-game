import { ConnectionState } from './SocketManager';

export interface ConnectionStateEvents {
  stateChanged: (state: ConnectionState, previousState: ConnectionState) => void;
  connected: () => void;
  disconnected: (reason?: string) => void;
  reconnecting: (attempt: number) => void;
  error: (error: Error) => void;
}

export type ConnectionStateEventName = keyof ConnectionStateEvents;
export type ConnectionStateEventHandler<T extends ConnectionStateEventName> = ConnectionStateEvents[T];

export class ConnectionStateManager {
  private currentState: ConnectionState = ConnectionState.DISCONNECTED;
  private previousState: ConnectionState = ConnectionState.DISCONNECTED;
  private eventHandlers: Map<string, Function[]> = new Map();
  private connectionHistory: Array<{ state: ConnectionState; timestamp: Date; reason?: string }> = [];
  private maxHistorySize: number = 50;

  constructor() {
    this.addToHistory(ConnectionState.DISCONNECTED);
  }

  public setState(newState: ConnectionState, reason?: string): void {
    if (newState === this.currentState) return;

    this.previousState = this.currentState;
    this.currentState = newState;
    this.addToHistory(newState, reason);

    // Emit specific state events
    switch (newState) {
      case ConnectionState.CONNECTED:
        this.emitToHandlers('connected');
        break;
      case ConnectionState.DISCONNECTED:
        this.emitToHandlers('disconnected', reason);
        break;
      case ConnectionState.RECONNECTING:
        const attempt = this.getReconnectionAttempt();
        this.emitToHandlers('reconnecting', attempt);
        break;
      case ConnectionState.ERROR:
        this.emitToHandlers('error', new Error(reason || 'Connection error'));
        break;
    }

    // Emit general state change event
    this.emitToHandlers('stateChanged', newState, this.previousState);
  }

  private addToHistory(state: ConnectionState, reason?: string): void {
    this.connectionHistory.push({
      state,
      timestamp: new Date(),
      reason
    });

    // Keep history size manageable
    if (this.connectionHistory.length > this.maxHistorySize) {
      this.connectionHistory.shift();
    }
  }

  private getReconnectionAttempt(): number {
    // Count recent reconnection attempts
    const recentReconnections = this.connectionHistory
      .filter(entry => 
        entry.state === ConnectionState.RECONNECTING &&
        Date.now() - entry.timestamp.getTime() < 60000 // Last minute
      );
    return recentReconnections.length;
  }

  public getCurrentState(): ConnectionState {
    return this.currentState;
  }

  public getPreviousState(): ConnectionState {
    return this.previousState;
  }

  public isConnected(): boolean {
    return this.currentState === ConnectionState.CONNECTED;
  }

  public isConnecting(): boolean {
    return this.currentState === ConnectionState.CONNECTING;
  }

  public isReconnecting(): boolean {
    return this.currentState === ConnectionState.RECONNECTING;
  }

  public hasError(): boolean {
    return this.currentState === ConnectionState.ERROR;
  }

  public getConnectionHistory(): Array<{ state: ConnectionState; timestamp: Date; reason?: string }> {
    return [...this.connectionHistory];
  }

  public getConnectionDuration(): number {
    const lastConnected = this.connectionHistory
      .reverse()
      .find(entry => entry.state === ConnectionState.CONNECTED);
    
    if (!lastConnected || !this.isConnected()) {
      return 0;
    }

    return Date.now() - lastConnected.timestamp.getTime();
  }

  public getLastDisconnectionReason(): string | undefined {
    const lastDisconnection = this.connectionHistory
      .reverse()
      .find(entry => entry.state === ConnectionState.DISCONNECTED);
    
    return lastDisconnection?.reason;
  }

  public on<T extends ConnectionStateEventName>(
    eventName: T,
    handler: ConnectionStateEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends ConnectionStateEventName>(
    eventName: T,
    handler: ConnectionStateEventHandler<T>
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
          console.error(`Error in connection state event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public reset(): void {
    this.currentState = ConnectionState.DISCONNECTED;
    this.previousState = ConnectionState.DISCONNECTED;
    this.connectionHistory = [];
    this.addToHistory(ConnectionState.DISCONNECTED);
  }

  public getStateDisplayName(state?: ConnectionState): string {
    const targetState = state || this.currentState;
    
    switch (targetState) {
      case ConnectionState.CONNECTED:
        return 'Connected';
      case ConnectionState.CONNECTING:
        return 'Connecting...';
      case ConnectionState.DISCONNECTED:
        return 'Disconnected';
      case ConnectionState.RECONNECTING:
        return 'Reconnecting...';
      case ConnectionState.ERROR:
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  }
}