import * as THREE from 'three';
import { SpawnPoint, Player } from '../types';

export interface SpawnPointManagerOptions {
  minDistanceBetweenPlayers?: number;
  maxSpawnAttempts?: number;
  preferredSpawnRadius?: number;
}

export class SpawnPointManager {
  private spawnPoints: SpawnPoint[] = [];
  private occupiedPositions: Map<string, THREE.Vector3> = new Map();
  private options: Required<SpawnPointManagerOptions>;

  constructor(options: SpawnPointManagerOptions = {}) {
    this.options = {
      minDistanceBetweenPlayers: options.minDistanceBetweenPlayers || 3,
      maxSpawnAttempts: options.maxSpawnAttempts || 10,
      preferredSpawnRadius: options.preferredSpawnRadius || 1
    };
  }

  setSpawnPoints(spawnPoints: SpawnPoint[]): void {
    this.spawnPoints = [...spawnPoints];
  }

  addSpawnPoint(spawnPoint: SpawnPoint): void {
    this.spawnPoints.push(spawnPoint);
  }

  removeSpawnPoint(id: string): boolean {
    const index = this.spawnPoints.findIndex(point => point.id === id);
    if (index !== -1) {
      this.spawnPoints.splice(index, 1);
      return true;
    }
    return false;
  }

  getSpawnPosition(playerId: string, playerType: 'hider' | 'seeker'): THREE.Vector3 | null {
    // Get available spawn points for player type
    const availablePoints = this.spawnPoints.filter(point => 
      point.type === playerType || point.type === 'any'
    );

    if (availablePoints.length === 0) {
      console.warn(`No spawn points available for type: ${playerType}`);
      return null;
    }

    // Try to find a good spawn position
    for (let attempt = 0; attempt < this.options.maxSpawnAttempts; attempt++) {
      const spawnPoint = this.selectSpawnPoint(availablePoints);
      const position = this.generatePositionNearSpawnPoint(spawnPoint);

      if (this.isPositionValid(position, playerId)) {
        this.occupiedPositions.set(playerId, position);
        return position;
      }
    }

    // Fallback: use any available spawn point
    const fallbackPoint = availablePoints[0];
    const fallbackPosition = new THREE.Vector3(
      fallbackPoint.position.x,
      fallbackPoint.position.y,
      fallbackPoint.position.z
    );
    
    this.occupiedPositions.set(playerId, fallbackPosition);
    return fallbackPosition;
  }

  private selectSpawnPoint(availablePoints: SpawnPoint[]): SpawnPoint {
    // Prefer spawn points that are farther from occupied positions
    let bestPoint = availablePoints[0];
    let maxMinDistance = 0;

    for (const point of availablePoints) {
      const pointPos = new THREE.Vector3(point.position.x, point.position.y, point.position.z);
      let minDistanceToOccupied = Infinity;

      for (const occupiedPos of this.occupiedPositions.values()) {
        const distance = pointPos.distanceTo(occupiedPos);
        minDistanceToOccupied = Math.min(minDistanceToOccupied, distance);
      }

      if (minDistanceToOccupied > maxMinDistance) {
        maxMinDistance = minDistanceToOccupied;
        bestPoint = point;
      }
    }

    return bestPoint;
  }

  private generatePositionNearSpawnPoint(spawnPoint: SpawnPoint): THREE.Vector3 {
    const basePos = new THREE.Vector3(
      spawnPoint.position.x,
      spawnPoint.position.y,
      spawnPoint.position.z
    );

    // Add some randomness within the preferred radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.options.preferredSpawnRadius;
    
    const offset = new THREE.Vector3(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance
    );

    return basePos.add(offset);
  }

  private isPositionValid(position: THREE.Vector3, playerId: string): boolean {
    // Check distance from other players
    for (const [otherId, otherPos] of this.occupiedPositions.entries()) {
      if (otherId !== playerId) {
        const distance = position.distanceTo(otherPos);
        if (distance < this.options.minDistanceBetweenPlayers) {
          return false;
        }
      }
    }

    return true;
  }

  releaseSpawnPosition(playerId: string): boolean {
    return this.occupiedPositions.delete(playerId);
  }

  getOccupiedPositions(): Map<string, THREE.Vector3> {
    return new Map(this.occupiedPositions);
  }

  clearOccupiedPositions(): void {
    this.occupiedPositions.clear();
  }

  getSpawnPointById(id: string): SpawnPoint | null {
    return this.spawnPoints.find(point => point.id === id) || null;
  }

  getSpawnPointsByType(type: 'hider' | 'seeker' | 'any'): SpawnPoint[] {
    return this.spawnPoints.filter(point => point.type === type);
  }

  getAllSpawnPoints(): SpawnPoint[] {
    return [...this.spawnPoints];
  }

  getSpawnPointsInRadius(center: THREE.Vector3, radius: number): SpawnPoint[] {
    return this.spawnPoints.filter(point => {
      const pointPos = new THREE.Vector3(point.position.x, point.position.y, point.position.z);
      return pointPos.distanceTo(center) <= radius;
    });
  }

  findNearestSpawnPoint(position: THREE.Vector3, type?: 'hider' | 'seeker' | 'any'): SpawnPoint | null {
    let filteredPoints = this.spawnPoints;
    
    if (type) {
      filteredPoints = this.spawnPoints.filter(point => point.type === type || point.type === 'any');
    }

    if (filteredPoints.length === 0) return null;

    let nearestPoint = filteredPoints[0];
    let minDistance = Infinity;

    for (const point of filteredPoints) {
      const pointPos = new THREE.Vector3(point.position.x, point.position.y, point.position.z);
      const distance = position.distanceTo(pointPos);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  validateSpawnPoints(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.spawnPoints.length === 0) {
      errors.push('No spawn points defined');
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const point of this.spawnPoints) {
      if (ids.has(point.id)) {
        errors.push(`Duplicate spawn point ID: ${point.id}`);
      }
      ids.add(point.id);
    }

    // Check for minimum spawn points per type
    const hiderPoints = this.getSpawnPointsByType('hider');
    const seekerPoints = this.getSpawnPointsByType('seeker');
    const anyPoints = this.getSpawnPointsByType('any');

    if (hiderPoints.length === 0 && anyPoints.length === 0) {
      errors.push('No spawn points available for hiders');
    }

    if (seekerPoints.length === 0 && anyPoints.length === 0) {
      errors.push('No spawn points available for seekers');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}