import * as THREE from 'three';
import { MapData, SpawnPoint, MapObject } from '../types';

export interface MapLoaderOptions {
  enableShadows?: boolean;
  enableFog?: boolean;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
}

export class MapLoader {
  private scene: THREE.Scene;
  private loadedObjects: THREE.Object3D[] = [];
  private spawnPoints: SpawnPoint[] = [];
  private mapBounds: THREE.Box3 = new THREE.Box3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async loadMap(mapData: MapData, options: MapLoaderOptions = {}): Promise<void> {
    // Clear existing map
    this.clearMap();

    // Set up environment
    this.setupEnvironment(mapData, options);

    // Load ground
    this.createGround(mapData.ground);

    // Load objects
    for (const obj of mapData.objects) {
      await this.loadObject(obj);
    }

    // Set spawn points
    this.spawnPoints = [...mapData.spawnPoints];

    // Calculate map bounds
    this.calculateMapBounds();
  }

  private setupEnvironment(mapData: MapData, options: MapLoaderOptions): void {
    // Set background color
    if (mapData.environment.skyColor) {
      this.scene.background = new THREE.Color(mapData.environment.skyColor);
    }

    // Add fog if enabled
    if (options.enableFog) {
      const fogColor = options.fogColor || 0xcccccc;
      const fogNear = options.fogNear || 10;
      const fogFar = options.fogFar || 100;
      this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    }

    // Add lighting
    this.setupLighting(mapData.environment);
  }

  private setupLighting(environment: MapData['environment']): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(
      environment.ambientColor || 0x404040,
      environment.ambientIntensity || 0.4
    );
    this.scene.add(ambientLight);
    this.loadedObjects.push(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(
      environment.sunColor || 0xffffff,
      environment.sunIntensity || 0.8
    );
    
    const sunPosition = environment.sunPosition || { x: 10, y: 20, z: 10 };
    directionalLight.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
    directionalLight.castShadow = true;
    
    // Shadow settings
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;

    this.scene.add(directionalLight);
    this.loadedObjects.push(directionalLight);
  }

  private createGround(groundData: MapData['ground']): void {
    const geometry = new THREE.PlaneGeometry(groundData.width, groundData.height);
    const material = new THREE.MeshLambertMaterial({ 
      color: groundData.color || 0x90EE90 
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundData.y || 0;
    ground.receiveShadow = true;
    ground.userData = { type: 'ground', collidable: false };

    this.scene.add(ground);
    this.loadedObjects.push(ground);
  }

  private async loadObject(objData: MapObject): Promise<void> {
    let mesh: THREE.Mesh;

    // Create basic geometric objects
    switch (objData.type) {
      case 'box':
        mesh = this.createBox(objData);
        break;
      case 'sphere':
        mesh = this.createSphere(objData);
        break;
      case 'cylinder':
        mesh = this.createCylinder(objData);
        break;
      case 'wall':
        mesh = this.createWall(objData);
        break;
      default:
        console.warn(`Unknown object type: ${objData.type}`);
        return;
    }

    // Set position, rotation, scale
    mesh.position.set(objData.position.x, objData.position.y, objData.position.z);
    
    if (objData.rotation) {
      mesh.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
    }
    
    if (objData.scale) {
      mesh.scale.set(objData.scale.x, objData.scale.y, objData.scale.z);
    }

    // Set object properties
    mesh.castShadow = objData.castShadow !== false;
    mesh.receiveShadow = objData.receiveShadow !== false;
    mesh.userData = {
      id: objData.id,
      type: objData.type,
      collidable: objData.collidable !== false,
      canCamouflage: objData.canCamouflage === true
    };

    this.scene.add(mesh);
    this.loadedObjects.push(mesh);
  }

  private createBox(objData: MapObject): THREE.Mesh {
    const size = objData.size || { width: 1, height: 1, depth: 1 };
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
    const material = new THREE.MeshLambertMaterial({ 
      color: objData.color || 0x8B4513 
    });
    return new THREE.Mesh(geometry, material);
  }

  private createSphere(objData: MapObject): THREE.Mesh {
    const radius = objData.radius || 0.5;
    const geometry = new THREE.SphereGeometry(radius, 16, 12);
    const material = new THREE.MeshLambertMaterial({ 
      color: objData.color || 0xFF6347 
    });
    return new THREE.Mesh(geometry, material);
  }

  private createCylinder(objData: MapObject): THREE.Mesh {
    const radiusTop = objData.radiusTop || 0.5;
    const radiusBottom = objData.radiusBottom || 0.5;
    const height = objData.height || 1;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16);
    const material = new THREE.MeshLambertMaterial({ 
      color: objData.color || 0x32CD32 
    });
    return new THREE.Mesh(geometry, material);
  }

  private createWall(objData: MapObject): THREE.Mesh {
    const size = objData.size || { width: 4, height: 3, depth: 0.2 };
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
    const material = new THREE.MeshLambertMaterial({ 
      color: objData.color || 0x696969 
    });
    return new THREE.Mesh(geometry, material);
  }

  private calculateMapBounds(): void {
    this.mapBounds = new THREE.Box3();
    
    for (const obj of this.loadedObjects) {
      if (obj instanceof THREE.Mesh && obj.userData.collidable) {
        const box = new THREE.Box3().setFromObject(obj);
        this.mapBounds.union(box);
      }
    }
  }

  clearMap(): void {
    for (const obj of this.loadedObjects) {
      this.scene.remove(obj);
      
      // Dispose geometry and materials
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    
    this.loadedObjects = [];
    this.spawnPoints = [];
    this.mapBounds = new THREE.Box3();
  }

  getSpawnPoints(): SpawnPoint[] {
    return [...this.spawnPoints];
  }

  getRandomSpawnPoint(): SpawnPoint | null {
    if (this.spawnPoints.length === 0) return null;
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return this.spawnPoints[index];
  }

  getSpawnPointsByType(type: 'hider' | 'seeker'): SpawnPoint[] {
    return this.spawnPoints.filter(point => point.type === type);
  }

  getMapBounds(): THREE.Box3 {
    return this.mapBounds.clone();
  }

  getCollidableObjects(): THREE.Mesh[] {
    return this.loadedObjects.filter(obj => 
      obj instanceof THREE.Mesh && obj.userData.collidable
    ) as THREE.Mesh[];
  }

  getCamouflageObjects(): THREE.Mesh[] {
    return this.loadedObjects.filter(obj => 
      obj instanceof THREE.Mesh && obj.userData.canCamouflage
    ) as THREE.Mesh[];
  }
}