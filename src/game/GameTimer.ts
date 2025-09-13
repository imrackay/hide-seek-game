export interface TimerEvents {
  tick: (timeRemaining: number, totalTime: number) => void;
  warning: (timeRemaining: number) => void;
  finished: () => void;
  paused: () => void;
  resumed: () => void;
  reset: () => void;
}

export type TimerEventName = keyof TimerEvents;
export type TimerEventHandler<T extends TimerEventName> = TimerEvents[T];

export interface TimerConfig {
  duration: number; // in seconds
  warningThreshold: number; // seconds before end to emit warning
  tickInterval: number; // milliseconds between ticks
  autoStart: boolean;
}

export class GameTimer {
  private config: TimerConfig;
  private timeRemaining: number;
  private totalTime: number;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private warningEmitted: boolean = false;

  constructor(config: Partial<TimerConfig> = {}) {
    this.config = {
      duration: 60,
      warningThreshold: 10,
      tickInterval: 1000,
      autoStart: false,
      ...config
    };

    this.totalTime = this.config.duration;
    this.timeRemaining = this.config.duration;

    if (this.config.autoStart) {
      this.start();
    }
  }

  public start(): void {
    if (this.isRunning && !this.isPaused) return;

    this.isRunning = true;
    this.isPaused = false;
    this.warningEmitted = false;

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.config.tickInterval);

    console.log(`Timer started: ${this.timeRemaining}s remaining`);
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.clearInterval();
    this.emitToHandlers('paused');

    console.log(`Timer paused: ${this.timeRemaining}s remaining`);
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.config.tickInterval);

    this.emitToHandlers('resumed');
    console.log(`Timer resumed: ${this.timeRemaining}s remaining`);
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.clearInterval();

    console.log('Timer stopped');
  }

  public reset(newDuration?: number): void {
    this.stop();
    
    if (newDuration !== undefined) {
      this.config.duration = newDuration;
      this.totalTime = newDuration;
    }
    
    this.timeRemaining = this.config.duration;
    this.warningEmitted = false;
    this.emitToHandlers('reset');

    console.log(`Timer reset to ${this.timeRemaining}s`);
  }

  private tick(): void {
    if (this.isPaused) return;

    this.timeRemaining = Math.max(0, this.timeRemaining - 1);

    // Emit tick event
    this.emitToHandlers('tick', this.timeRemaining, this.totalTime);

    // Check for warning threshold
    if (!this.warningEmitted && this.timeRemaining <= this.config.warningThreshold && this.timeRemaining > 0) {
      this.warningEmitted = true;
      this.emitToHandlers('warning', this.timeRemaining);
    }

    // Check if finished
    if (this.timeRemaining <= 0) {
      this.stop();
      this.emitToHandlers('finished');
    }
  }

  private clearInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Getters
  public getTimeRemaining(): number {
    return this.timeRemaining;
  }

  public getTotalTime(): number {
    return this.totalTime;
  }

  public getProgress(): number {
    return this.totalTime > 0 ? (this.totalTime - this.timeRemaining) / this.totalTime : 0;
  }

  public getProgressPercent(): number {
    return Math.round(this.getProgress() * 100);
  }

  public isActive(): boolean {
    return this.isRunning && !this.isPaused;
  }

  public isFinished(): boolean {
    return this.timeRemaining <= 0;
  }

  public getConfig(): TimerConfig {
    return { ...this.config };
  }

  // Time formatting utilities
  public formatTime(seconds?: number): string {
    const time = seconds !== undefined ? seconds : this.timeRemaining;
    const minutes = Math.floor(time / 60);
    const remainingSeconds = time % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  public formatTimeDetailed(seconds?: number): string {
    const time = seconds !== undefined ? seconds : this.timeRemaining;
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const remainingSeconds = time % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Configuration updates
  public updateConfig(newConfig: Partial<TimerConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    // Update total time if duration changed
    if (newConfig.duration !== undefined) {
      this.totalTime = newConfig.duration;
      // Only reset remaining time if timer wasn't running
      if (!wasRunning) {
        this.timeRemaining = newConfig.duration;
      }
    }

    if (wasRunning && this.config.autoStart) {
      this.start();
    }
  }

  public setDuration(duration: number): void {
    this.updateConfig({ duration });
  }

  public setWarningThreshold(threshold: number): void {
    this.updateConfig({ warningThreshold: threshold });
    // Reset warning flag if new threshold is higher than current time
    if (threshold > this.timeRemaining) {
      this.warningEmitted = false;
    }
  }

  public addTime(seconds: number): void {
    this.timeRemaining = Math.max(0, this.timeRemaining + seconds);
    this.totalTime = Math.max(this.totalTime, this.timeRemaining);
    
    // Reset warning if we're now above threshold
    if (this.timeRemaining > this.config.warningThreshold) {
      this.warningEmitted = false;
    }

    console.log(`Added ${seconds}s to timer: ${this.timeRemaining}s remaining`);
  }

  public subtractTime(seconds: number): void {
    this.timeRemaining = Math.max(0, this.timeRemaining - seconds);
    
    // Check for immediate warning
    if (!this.warningEmitted && this.timeRemaining <= this.config.warningThreshold && this.timeRemaining > 0) {
      this.warningEmitted = true;
      this.emitToHandlers('warning', this.timeRemaining);
    }

    // Check for immediate finish
    if (this.timeRemaining <= 0 && this.isRunning) {
      this.stop();
      this.emitToHandlers('finished');
    }

    console.log(`Subtracted ${seconds}s from timer: ${this.timeRemaining}s remaining`);
  }

  // Event handling
  public on<T extends TimerEventName>(
    eventName: T,
    handler: TimerEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  public off<T extends TimerEventName>(
    eventName: T,
    handler: TimerEventHandler<T>
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
          console.error(`Error in timer event handler for ${eventName}:`, error);
        }
      });
    }
  }

  public dispose(): void {
    this.stop();
    this.eventHandlers.clear();
  }
}