import { Player, Vector3 } from '@/types';
import { PlayerManager } from './PlayerManager';

export interface SyncData {
  playerId: string;
  position: Vector3;
  rotation?: number;
  timestamp: number;
}

export interface InterpolationTarget {
  position: Vector3;
  rotation?: number;
  timestamp: number;
}

export class PlayerSynchronizer {
  private playerManager: PlayerManager;
  private syncBuffer: Map<string, SyncData[]> = new Map();
  private interpolationTargets: Map<string, InterpolationTarget> = new Map();
  private maxBufferSize: number = 10;
  private interpolationDelay: number = 100; // ms
  private updateInterval: number = 16; // ~60fps
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(playerManager: PlayerManager) {
    this.playerManager = playerManager;
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.update();
    }, this.updateInterval);
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public addSyncData(playerId: string, position: Vector3, rotation?: number): void {
    const syncData: SyncData = {
      playerId,
      position: { ...position },
      rotation,
      timestamp: Date.now()
    };

    // Get or create buffer for this player
    if (!this.syncBuffer.has(playerId)) {
      this.syncBuffer.set(playerId, []);
    }

    const buffer = this.syncBuffer.get(playerId)!;
    buffer.push(syncData);

    // Keep buffer size manageable
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // Sort by timestamp (should already be in order, but just in case)
    buffer.sort((a, b) => a.timestamp - b.timestamp);
  }

  private update(): void {
    const currentTime = Date.now();
    const targetTime = currentTime - this.interpolationDelay;

    for (const [playerId, buffer] of this.syncBuffer.entries()) {
      if (buffer.length < 2) continue;

      // Skip local player (we don't interpolate our own movement)
      if (playerId === this.playerManager.getLocalPlayerId()) continue;

      const interpolatedData = this.interpolatePosition(buffer, targetTime);
      if (interpolatedData) {
        this.updatePlayerPosition(playerId, interpolatedData.position, interpolatedData.rotation);
      }
    }
  }

  private interpolatePosition(buffer: SyncData[], targetTime: number): InterpolationTarget | null {
    // Find the two data points to interpolate between
    let beforeData: SyncData | null = null;
    let afterData: SyncData | null = null;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= targetTime && buffer[i + 1].timestamp >= targetTime) {
        beforeData = buffer[i];
        afterData = buffer[i + 1];
        break;
      }
    }

    // If we don't have suitable data points, use the latest
    if (!beforeData || !afterData) {
      const latest = buffer[buffer.length - 1];
      return {
        position: latest.position,
        rotation: latest.rotation,
        timestamp: latest.timestamp
      };
    }

    // Calculate interpolation factor
    const timeDiff = afterData.timestamp - beforeData.timestamp;
    const factor = timeDiff > 0 ? (targetTime - beforeData.timestamp) / timeDiff : 0;

    // Interpolate position
    const interpolatedPosition: Vector3 = {
      x: this.lerp(beforeData.position.x, afterData.position.x, factor),
      y: this.lerp(beforeData.position.y, afterData.position.y, factor),
      z: this.lerp(beforeData.position.z, afterData.position.z, factor)
    };

    // Interpolate rotation if available
    let interpolatedRotation: number | undefined;
    if (beforeData.rotation !== undefined && afterData.rotation !== undefined) {
      interpolatedRotation = this.lerpAngle(beforeData.rotation, afterData.rotation, factor);
    }

    return {
      position: interpolatedPosition,
      rotation: interpolatedRotation,
      timestamp: targetTime
    };
  }

  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * Math.max(0, Math.min(1, factor));
  }

  private lerpAngle(start: number, end: number, factor: number): number {
    // Handle angle wrapping for smooth rotation interpolation
    let diff = end - start;
    
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    
    return start + diff * Math.max(0, Math.min(1, factor));
  }

  private updatePlayerPosition(playerId: string, position: Vector3, rotation?: number): void {
    // Update the player manager (which will update the 3D engine)
    const player = this.playerManager.getPlayer(playerId);
    if (player) {
      player.position = position;
      // We bypass the network update since this is interpolated data
      this.playerManager['gameEngine'].updatePlayerPosition(playerId, position);
      if (rotation !== undefined) {
        this.playerManager['gameEngine'].updatePlayerRotation(playerId, rotation);
      }
    }
  }

  // Prediction for local player (client-side prediction)
  public predictLocalPlayerMovement(playerId: string, velocity: Vector3, deltaTime: number): Vector3 {
    const player = this.playerManager.getPlayer(playerId);
    if (!player) {
      return { x: 0, y: 0, z: 0 };
    }

    // Simple linear prediction
    return {
      x: player.position.x + velocity.x * deltaTime,
      y: player.position.y + velocity.y * deltaTime,
      z: player.position.z + velocity.z * deltaTime
    };
  }

  // Lag compensation - estimate where a player was at a given time
  public getPlayerPositionAtTime(playerId: string, timestamp: number): Vector3 | null {
    const buffer = this.syncBuffer.get(playerId);
    if (!buffer || buffer.length === 0) {
      const player = this.playerManager.getPlayer(playerId);
      return player ? player.position : null;
    }

    // Find the closest data point to the requested timestamp
    let closestData = buffer[0];
    let minTimeDiff = Math.abs(buffer[0].timestamp - timestamp);

    for (const data of buffer) {
      const timeDiff = Math.abs(data.timestamp - timestamp);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestData = data;
      }
    }

    return closestData.position;
  }

  // Clean up old data
  public cleanupOldData(maxAge: number = 5000): void {
    const cutoffTime = Date.now() - maxAge;

    for (const [playerId, buffer] of this.syncBuffer.entries()) {
      // Remove old entries
      const filteredBuffer = buffer.filter(data => data.timestamp > cutoffTime);
      
      if (filteredBuffer.length === 0) {
        this.syncBuffer.delete(playerId);
      } else {
        this.syncBuffer.set(playerId, filteredBuffer);
      }
    }
  }

  // Get synchronization statistics
  public getSyncStats(playerId: string): {
    bufferSize: number;
    latestTimestamp: number;
    oldestTimestamp: number;
    averageDelay: number;
  } | null {
    const buffer = this.syncBuffer.get(playerId);
    if (!buffer || buffer.length === 0) return null;

    const currentTime = Date.now();
    const delays = buffer.map(data => currentTime - data.timestamp);
    const averageDelay = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;

    return {
      bufferSize: buffer.length,
      latestTimestamp: buffer[buffer.length - 1].timestamp,
      oldestTimestamp: buffer[0].timestamp,
      averageDelay
    };
  }

  public dispose(): void {
    this.stop();
    this.syncBuffer.clear();
    this.interpolationTargets.clear();
  }
}