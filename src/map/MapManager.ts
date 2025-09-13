import * as THREE from 'three';
import { MapLoader, MapLoaderOptions } from './MapLoader';
import { SpawnPointManager, SpawnPointManagerOptions } from './SpawnPointManager';
import { CollisionDetector, CollisionDetectorOptions } from './CollisionDetector';
import { MapData, SpawnPoint } from '../types';

export interface MapManagerOptions {
  mapLoader?: MapLoaderOptions;
  spawnPointManager?: SpawnPointManagerOptions;
  collisionDetector?: CollisionDetectorOptions;
}

export class MapManager {
  private scene: THREE.Scene;
  private mapLoader: MapLoader;
  private spawnPointManager: SpawnPointManager;
  private collisionDetector: CollisionDetector;
  private currentMapData: MapData | null = null;
  private isLoaded = false;

  constructor(scene: THREE.Scene, options: MapManagerOptions = {}) {
    this.scene = scene;
    this.mapLoader = new MapLoader(scene);
    this.spawnPointManager = new SpawnPointManager(options.spawnPointManager);
    this.collisionDetector = new CollisionDetector(scene, options.collisionDetector);
  }

  async loadMap(mapData: MapData, options?: MapLoaderOptions): Promise<void> {
    try {
      // Load the map
      await this.mapLoader.loadMap(mapData, options);
      
      // Set up spawn points
      this.spawnPointManager.setSpawnPoints(mapData.spawnPoints);
      
      // Set up collision detection
      const collidableObjects = this.mapLoader.getCollidableObjects();
      this.collisionDetector.setCollidableObjects(collidableObjects);
      this.collisionDetector.setMapBounds(this.mapLoader.getMapBounds());
      
      this.currentMapData = mapData;
      this.isLoaded = true;
      
      console.log(`Map "${mapData.name}" loaded successfully`);
    } catch (error) {
      console.error('Failed to load map:', error);
      throw error;
    }
  }

  unloadMap(): void {
    this.mapLoader.clearMap();
    this.spawnPointManager.clearOccupiedPositions();
    this.collisionDetector.dispose();
    this.currentMapData = null;
    this.isLoaded = false;
  }

  // Spawn point management
  getSpawnPosition(playerId: string, playerType: 'hider' | 'seeker'): THREE.Vector3 | null {
    if (!this.isLoaded) {
      console.warn('Cannot get spawn position: no map loaded');
      return null;
    }
    
    return this.spawnPointManager.getSpawnPosition(playerId, playerType);
  }

  releaseSpawnPosition(playerId: string): boolean {
    return this.spawnPointManager.releaseSpawnPosition(playerId);
  }

  getRandomSpawnPoint(): SpawnPoint | null {
    return this.mapLoader.getRandomSpawnPoint();
  }

  // Collision detection
  checkMovementCollision(currentPosition: THREE.Vector3, targetPosition: THREE.Vector3) {
    return this.collisionDetector.checkMovementCollision(currentPosition, targetPosition);
  }

  isPositionValid(position: THREE.Vector3): boolean {
    return this.collisionDetector.isPositionValid(position);
  }

  getSafeMovementPosition(currentPosition: THREE.Vector3, targetPosition: THREE.Vector3): THREE.Vector3 {
    return this.collisionDetector.getSafeMovementPosition(currentPosition, targetPosition);
  }

  hasLineOfSight(fromPosition: THREE.Vector3, toPosition: THREE.Vector3, maxDistance?: number): boolean {
    return this.collisionDetector.hasLineOfSight(fromPosition, toPosition, maxDistance);
  }

  // Map information
  getCurrentMapData(): MapData | null {
    return this.currentMapData;
  }

  getMapBounds(): THREE.Box3 | null {
    if (!this.isLoaded) return null;
    return this.mapLoader.getMapBounds();
  }

  getCollidableObjects(): THREE.Mesh[] {
    if (!this.isLoaded) return [];
    return this.mapLoader.getCollidableObjects();
  }

  getCamouflageObjects(): THREE.Mesh[] {
    if (!this.isLoaded) return [];
    return this.mapLoader.getCamouflageObjects();
  }

  // Utility methods
  isMapLoaded(): boolean {
    return this.isLoaded;
  }

  getMapName(): string | null {
    return this.currentMapData?.name || null;
  }

  getSpawnPointsInRadius(center: THREE.Vector3, radius: number): SpawnPoint[] {
    return this.spawnPointManager.getSpawnPointsInRadius(center, radius);
  }

  findNearestSpawnPoint(position: THREE.Vector3, type?: 'hider' | 'seeker' | 'any'): SpawnPoint | null {
    return this.spawnPointManager.findNearestSpawnPoint(position, type);
  }

  getObjectsInRadius(center: THREE.Vector3, radius: number): THREE.Object3D[] {
    return this.collisionDetector.getObjectsInRadius(center, radius);
  }

  // Validation
  validateCurrentMap(): { valid: boolean; errors: string[] } {
    if (!this.currentMapData) {
      return { valid: false, errors: ['No map loaded'] };
    }

    const spawnPointValidation = this.spawnPointManager.validateSpawnPoints();
    const errors: string[] = [...spawnPointValidation.errors];

    // Additional map validation
    if (!this.currentMapData.ground) {
      errors.push('Map has no ground defined');
    }

    if (this.currentMapData.objects.length === 0) {
      errors.push('Map has no objects defined');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Debug methods
  visualizeSpawnPoints(): void {
    const spawnPoints = this.spawnPointManager.getAllSpawnPoints();
    
    for (const point of spawnPoints) {
      const geometry = new THREE.SphereGeometry(0.3, 8, 6);
      const color = point.type === 'hider' ? 0x00ff00 : 
                   point.type === 'seeker' ? 0xff0000 : 0x0000ff;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(point.position.x, point.position.y, point.position.z);
      sphere.userData = { isDebugObject: true, type: 'spawnPoint' };
      
      this.scene.add(sphere);
    }
  }

  clearDebugObjects(): void {
    const objectsToRemove: THREE.Object3D[] = [];
    
    if (this.scene.traverse) {
      this.scene.traverse((object) => {
        if (object.userData && object.userData.isDebugObject) {
          objectsToRemove.push(object);
        }
      });
    }

    for (const object of objectsToRemove) {
      this.scene.remove(object);
      
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
  }

  dispose(): void {
    this.unloadMap();
    this.clearDebugObjects();
  }
}