import * as THREE from 'three';

export interface MapBuilderOptions {
  enableSnapToGrid?: boolean;
  gridSize?: number;
  maxMapSize?: { width: number; height: number; depth: number };
  enableUndo?: boolean;
  maxUndoSteps?: number;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  enableCollisionPreview?: boolean;
  enableLightingPreview?: boolean;
}

export interface MapObject {
  id: string;
  type: MapObjectType;
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  properties: MapObjectProperties;
  mesh?: THREE.Object3D;
  isSelected: boolean;
  isLocked: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MapObjectType = 
  | 'wall' 
  | 'floor' 
  | 'ceiling' 
  | 'obstacle' 
  | 'decoration' 
  | 'spawn_point' 
  | 'hiding_spot' 
  | 'light' 
  | 'trigger' 
  | 'boundary';

export interface MapObjectProperties {
  material?: string;
  color?: string;
  texture?: string;
  collision?: boolean;
  transparent?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  interactive?: boolean;
  hideable?: boolean;
  spawnType?: 'hider' | 'seeker' | 'any';
  triggerAction?: string;
  [key: string]: any;
}

export interface MapData {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  metadata: {
    dimensions: { width: number; height: number; depth: number };
    objectCount: number;
    spawnPoints: number;
    hidingSpots: number;
    estimatedPlayTime: number;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    tags: string[];
    thumbnail?: string;
  };
  objects: MapObject[];
  settings: {
    lighting: {
      ambientColor: string;
      ambientIntensity: number;
      directionalColor: string;
      directionalIntensity: number;
      directionalPosition: THREE.Vector3;
      enableShadows: boolean;
    };
    environment: {
      skybox?: string;
      fog?: {
        enabled: boolean;
        color: string;
        near: number;
        far: number;
      };
      gravity: number;
    };
    gameplay: {
      maxPlayers: number;
      gameMode: string[];
      timeLimit: number;
      boundaries: THREE.Box3;
    };
  };
}

export interface BuilderAction {
  id: string;
  type: 'add' | 'remove' | 'move' | 'rotate' | 'scale' | 'modify';
  timestamp: number;
  objectId?: string;
  beforeState?: any;
  afterState?: any;
  data: any;
}

export interface SelectionBox {
  start: THREE.Vector3;
  end: THREE.Vector3;
  isActive: boolean;
}

export class MapBuilder {
  private options: Required<MapBuilderOptions>;
  private mapData: MapData;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  
  // Builder state
  private selectedObjects: Set<string> = new Set();
  private clipboard: MapObject[] = [];
  private actionHistory: BuilderAction[] = [];
  private currentActionIndex = -1;
  private isDirty = false;
  
  // Interaction state
  private isBuilding = false;
  private currentTool: BuilderTool = 'select';
  private dragState: DragState | null = null;
  private selectionBox: SelectionBox | null = null;
  
  // Grid and snapping
  private gridHelper: THREE.GridHelper | null = null;
  private snapIndicator: THREE.Object3D | null = null;
  
  // Event handling
  private builderCallbacks: Map<string, Function[]> = new Map();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  
  // Auto-save
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    options: MapBuilderOptions = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.options = {
      enableSnapToGrid: options.enableSnapToGrid !== false,
      gridSize: options.gridSize || 1,
      maxMapSize: options.maxMapSize || { width: 100, height: 50, depth: 100 },
      enableUndo: options.enableUndo !== false,
      maxUndoSteps: options.maxUndoSteps || 50,
      enableAutoSave: options.enableAutoSave !== false,
      autoSaveInterval: options.autoSaveInterval || 30000, // 30 seconds
      enableCollisionPreview: options.enableCollisionPreview !== false,
      enableLightingPreview: options.enableLightingPreview !== false
    };

    this.mapData = this.createEmptyMap();
    this.initializeBuilder();
  }

  // Initialization
  private createEmptyMap(): MapData {
    return {
      id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: 'Untitled Map',
      description: '',
      author: 'Unknown',
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        dimensions: this.options.maxMapSize,
        objectCount: 0,
        spawnPoints: 0,
        hidingSpots: 0,
        estimatedPlayTime: 300, // 5 minutes
        difficulty: 'medium',
        tags: []
      },
      objects: [],
      settings: {
        lighting: {
          ambientColor: '#404040',
          ambientIntensity: 0.6,
          directionalColor: '#ffffff',
          directionalIntensity: 0.8,
          directionalPosition: new THREE.Vector3(1, 1, 1),
          enableShadows: true
        },
        environment: {
          fog: {
            enabled: false,
            color: '#cccccc',
            near: 10,
            far: 100
          },
          gravity: -9.81
        },
        gameplay: {
          maxPlayers: 8,
          gameMode: ['classic'],
          timeLimit: 600, // 10 minutes
          boundaries: new THREE.Box3(
            new THREE.Vector3(-50, 0, -50),
            new THREE.Vector3(50, 25, 50)
          )
        }
      }
    };
  }

  private initializeBuilder(): void {
    // Set up grid
    if (this.options.enableSnapToGrid) {
      this.createGrid();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Start auto-save if enabled
    if (this.options.enableAutoSave) {
      this.startAutoSave();
    }

    this.emitBuilderEvent('builder_initialized', { mapData: this.mapData });
  }

  private createGrid(): void {
    const size = Math.max(this.options.maxMapSize.width, this.options.maxMapSize.depth);
    this.gridHelper = new THREE.GridHelper(size, size / this.options.gridSize);
    this.gridHelper.material.opacity = 0.3;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);
  }

  private setupEventListeners(): void {
    this.renderer.domElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.renderer.domElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.renderer.domElement.addEventListener('wheel', this.handleWheel.bind(this));
    
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      if (this.isDirty) {
        this.autoSave();
      }
    }, this.options.autoSaveInterval);
  }

  // Map object management
  addObject(
    type: MapObjectType,
    position: THREE.Vector3,
    properties: Partial<MapObjectProperties> = {}
  ): MapObject {
    const objectId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const mapObject: MapObject = {
      id: objectId,
      type,
      name: `${type}_${this.mapData.objects.length + 1}`,
      position: this.snapToGrid(position.clone()),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      properties: {
        collision: true,
        castShadow: true,
        receiveShadow: true,
        ...properties
      },
      isSelected: false,
      isLocked: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Create 3D mesh
    mapObject.mesh = this.createObjectMesh(mapObject);
    if (mapObject.mesh) {
      this.scene.add(mapObject.mesh);
    }

    this.mapData.objects.push(mapObject);
    this.updateMapMetadata();
    
    // Record action for undo
    this.recordAction({
      type: 'add',
      objectId,
      data: { object: mapObject }
    });

    this.markDirty();
    this.emitBuilderEvent('object_added', { object: mapObject });

    return mapObject;
  }

  removeObject(objectId: string): boolean {
    const objectIndex = this.mapData.objects.findIndex(obj => obj.id === objectId);
    if (objectIndex === -1) return false;

    const object = this.mapData.objects[objectIndex];
    
    // Remove from scene
    if (object.mesh) {
      this.scene.remove(object.mesh);
      this.disposeObject(object.mesh);
    }

    // Remove from selection
    this.selectedObjects.delete(objectId);

    // Record action for undo
    this.recordAction({
      type: 'remove',
      objectId,
      beforeState: { object: { ...object } },
      data: { index: objectIndex }
    });

    // Remove from map data
    this.mapData.objects.splice(objectIndex, 1);
    this.updateMapMetadata();

    this.markDirty();
    this.emitBuilderEvent('object_removed', { objectId });

    return true;
  }

  moveObject(objectId: string, newPosition: THREE.Vector3): boolean {
    const object = this.getObject(objectId);
    if (!object || object.isLocked) return false;

    const oldPosition = object.position.clone();
    const snappedPosition = this.snapToGrid(newPosition);

    // Check boundaries
    if (!this.isPositionValid(snappedPosition)) {
      return false;
    }

    // Record action for undo
    this.recordAction({
      type: 'move',
      objectId,
      beforeState: { position: oldPosition },
      afterState: { position: snappedPosition },
      data: {}
    });

    // Update position
    object.position.copy(snappedPosition);
    object.updatedAt = Date.now();

    if (object.mesh) {
      object.mesh.position.copy(snappedPosition);
    }

    this.markDirty();
    this.emitBuilderEvent('object_moved', { objectId, oldPosition, newPosition: snappedPosition });

    return true;
  }

  rotateObject(objectId: string, rotation: THREE.Euler): boolean {
    const object = this.getObject(objectId);
    if (!object || object.isLocked) return false;

    const oldRotation = object.rotation.clone();

    // Record action for undo
    this.recordAction({
      type: 'rotate',
      objectId,
      beforeState: { rotation: oldRotation },
      afterState: { rotation: rotation.clone() },
      data: {}
    });

    // Update rotation
    object.rotation.copy(rotation);
    object.updatedAt = Date.now();

    if (object.mesh) {
      object.mesh.rotation.copy(rotation);
    }

    this.markDirty();
    this.emitBuilderEvent('object_rotated', { objectId, oldRotation, newRotation: rotation });

    return true;
  }

  scaleObject(objectId: string, scale: THREE.Vector3): boolean {
    const object = this.getObject(objectId);
    if (!object || object.isLocked) return false;

    const oldScale = object.scale.clone();

    // Validate scale
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0) {
      return false;
    }

    // Record action for undo
    this.recordAction({
      type: 'scale',
      objectId,
      beforeState: { scale: oldScale },
      afterState: { scale: scale.clone() },
      data: {}
    });

    // Update scale
    object.scale.copy(scale);
    object.updatedAt = Date.now();

    if (object.mesh) {
      object.mesh.scale.copy(scale);
    }

    this.markDirty();
    this.emitBuilderEvent('object_scaled', { objectId, oldScale, newScale: scale });

    return true;
  }

  modifyObjectProperties(objectId: string, properties: Partial<MapObjectProperties>): boolean {
    const object = this.getObject(objectId);
    if (!object || object.isLocked) return false;

    const oldProperties = { ...object.properties };

    // Record action for undo
    this.recordAction({
      type: 'modify',
      objectId,
      beforeState: { properties: oldProperties },
      afterState: { properties: { ...object.properties, ...properties } },
      data: {}
    });

    // Update properties
    Object.assign(object.properties, properties);
    object.updatedAt = Date.now();

    // Update mesh if needed
    if (object.mesh) {
      this.updateObjectMesh(object);
    }

    this.markDirty();
    this.emitBuilderEvent('object_modified', { objectId, oldProperties, newProperties: object.properties });

    return true;
  }

  // Object creation helpers
  private createObjectMesh(object: MapObject): THREE.Object3D | null {
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    // Create geometry based on type
    switch (object.type) {
      case 'wall':
        geometry = new THREE.BoxGeometry(1, 3, 0.2);
        break;
      case 'floor':
        geometry = new THREE.BoxGeometry(2, 0.1, 2);
        break;
      case 'ceiling':
        geometry = new THREE.BoxGeometry(2, 0.1, 2);
        break;
      case 'obstacle':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'decoration':
        geometry = new THREE.SphereGeometry(0.5, 8, 6);
        break;
      case 'spawn_point':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8);
        break;
      case 'hiding_spot':
        geometry = new THREE.BoxGeometry(1, 1.5, 1);
        break;
      case 'light':
        geometry = new THREE.SphereGeometry(0.2, 8, 6);
        break;
      case 'trigger':
        geometry = new THREE.BoxGeometry(2, 0.1, 2);
        break;
      case 'boundary':
        geometry = new THREE.BoxGeometry(0.1, 5, 1);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    // Create material based on properties
    const color = object.properties.color || this.getDefaultColor(object.type);
    material = new THREE.MeshLambertMaterial({
      color,
      transparent: object.properties.transparent || false,
      opacity: object.properties.transparent ? 0.7 : 1.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(object.position);
    mesh.rotation.copy(object.rotation);
    mesh.scale.copy(object.scale);
    mesh.castShadow = object.properties.castShadow || false;
    mesh.receiveShadow = object.properties.receiveShadow || false;

    // Store reference to map object
    (mesh as any).mapObjectId = object.id;

    return mesh;
  }

  private updateObjectMesh(object: MapObject): void {
    if (!object.mesh) return;

    // Update material properties
    const mesh = object.mesh as THREE.Mesh;
    if (mesh.material instanceof THREE.MeshLambertMaterial) {
      if (object.properties.color) {
        mesh.material.color.setStyle(object.properties.color);
      }
      mesh.material.transparent = object.properties.transparent || false;
      mesh.material.opacity = object.properties.transparent ? 0.7 : 1.0;
    }

    mesh.castShadow = object.properties.castShadow || false;
    mesh.receiveShadow = object.properties.receiveShadow || false;
  }

  private getDefaultColor(type: MapObjectType): string {
    const colors: Record<MapObjectType, string> = {
      wall: '#8B4513',
      floor: '#D2B48C',
      ceiling: '#F5F5DC',
      obstacle: '#696969',
      decoration: '#32CD32',
      spawn_point: '#00FF00',
      hiding_spot: '#FFD700',
      light: '#FFFF00',
      trigger: '#FF6347',
      boundary: '#FF0000'
    };
    return colors[type] || '#808080';
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  // Grid and snapping
  private snapToGrid(position: THREE.Vector3): THREE.Vector3 {
    if (!this.options.enableSnapToGrid) {
      return position;
    }

    const gridSize = this.options.gridSize;
    return new THREE.Vector3(
      Math.round(position.x / gridSize) * gridSize,
      Math.round(position.y / gridSize) * gridSize,
      Math.round(position.z / gridSize) * gridSize
    );
  }

  private isPositionValid(position: THREE.Vector3): boolean {
    const bounds = this.options.maxMapSize;
    return (
      position.x >= -bounds.width / 2 && position.x <= bounds.width / 2 &&
      position.y >= 0 && position.y <= bounds.height &&
      position.z >= -bounds.depth / 2 && position.z <= bounds.depth / 2
    );
  }

  // Selection management
  selectObject(objectId: string, addToSelection = false): boolean {
    const object = this.getObject(objectId);
    if (!object) return false;

    if (!addToSelection) {
      this.clearSelection();
    }

    this.selectedObjects.add(objectId);
    object.isSelected = true;

    this.updateObjectSelection(object);
    this.emitBuilderEvent('object_selected', { objectId, selectedObjects: Array.from(this.selectedObjects) });

    return true;
  }

  deselectObject(objectId: string): boolean {
    const object = this.getObject(objectId);
    if (!object) return false;

    this.selectedObjects.delete(objectId);
    object.isSelected = false;

    this.updateObjectSelection(object);
    this.emitBuilderEvent('object_deselected', { objectId, selectedObjects: Array.from(this.selectedObjects) });

    return true;
  }

  clearSelection(): void {
    for (const objectId of this.selectedObjects) {
      const object = this.getObject(objectId);
      if (object) {
        object.isSelected = false;
        this.updateObjectSelection(object);
      }
    }

    this.selectedObjects.clear();
    this.emitBuilderEvent('selection_cleared', {});
  }

  private updateObjectSelection(object: MapObject): void {
    if (!object.mesh) return;

    const mesh = object.mesh as THREE.Mesh;
    if (mesh.material instanceof THREE.MeshLambertMaterial) {
      if (object.isSelected) {
        mesh.material.emissive.setHex(0x444444);
      } else {
        mesh.material.emissive.setHex(0x000000);
      }
    }
  }

  // Undo/Redo system
  private recordAction(actionData: Omit<BuilderAction, 'id' | 'timestamp'>): void {
    if (!this.options.enableUndo) return;

    const action: BuilderAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      ...actionData
    };

    // Remove any actions after current index (when undoing then doing new action)
    this.actionHistory = this.actionHistory.slice(0, this.currentActionIndex + 1);

    // Add new action
    this.actionHistory.push(action);
    this.currentActionIndex++;

    // Limit history size
    if (this.actionHistory.length > this.options.maxUndoSteps) {
      this.actionHistory.shift();
      this.currentActionIndex--;
    }
  }

  undo(): boolean {
    if (!this.canUndo()) return false;

    const action = this.actionHistory[this.currentActionIndex];
    this.currentActionIndex--;

    this.executeUndoAction(action);
    this.markDirty();
    this.emitBuilderEvent('action_undone', { action });

    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentActionIndex++;
    const action = this.actionHistory[this.currentActionIndex];

    this.executeRedoAction(action);
    this.markDirty();
    this.emitBuilderEvent('action_redone', { action });

    return true;
  }

  private executeUndoAction(action: BuilderAction): void {
    switch (action.type) {
      case 'add':
        if (action.objectId) {
          this.removeObject(action.objectId);
        }
        break;
      case 'remove':
        if (action.beforeState?.object) {
          const object = action.beforeState.object;
          this.mapData.objects.splice(action.data.index, 0, object);
          object.mesh = this.createObjectMesh(object);
          if (object.mesh) {
            this.scene.add(object.mesh);
          }
        }
        break;
      case 'move':
        if (action.objectId && action.beforeState?.position) {
          const object = this.getObject(action.objectId);
          if (object) {
            object.position.copy(action.beforeState.position);
            if (object.mesh) {
              object.mesh.position.copy(action.beforeState.position);
            }
          }
        }
        break;
      // Add other action types as needed
    }
  }

  private executeRedoAction(action: BuilderAction): void {
    switch (action.type) {
      case 'add':
        if (action.data?.object) {
          const object = action.data.object;
          this.mapData.objects.push(object);
          object.mesh = this.createObjectMesh(object);
          if (object.mesh) {
            this.scene.add(object.mesh);
          }
        }
        break;
      case 'remove':
        if (action.objectId) {
          this.removeObject(action.objectId);
        }
        break;
      case 'move':
        if (action.objectId && action.afterState?.position) {
          const object = this.getObject(action.objectId);
          if (object) {
            object.position.copy(action.afterState.position);
            if (object.mesh) {
              object.mesh.position.copy(action.afterState.position);
            }
          }
        }
        break;
      // Add other action types as needed
    }
  }

  canUndo(): boolean {
    return this.options.enableUndo && this.currentActionIndex >= 0;
  }

  canRedo(): boolean {
    return this.options.enableUndo && this.currentActionIndex < this.actionHistory.length - 1;
  }

  // Event handling
  private handleMouseDown(event: MouseEvent): void {
    this.updateMousePosition(event);
    
    if (event.button === 0) { // Left click
      this.handleLeftClick(event);
    } else if (event.button === 2) { // Right click
      this.handleRightClick(event);
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    this.updateMousePosition(event);
    
    if (this.dragState) {
      this.handleDrag(event);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.dragState) {
      this.endDrag();
    }
  }

  private handleWheel(event: WheelEvent): void {
    // Handle zoom or other wheel interactions
    event.preventDefault();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        this.deleteSelectedObjects();
        break;
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;
      case 'c':
        if (event.ctrlKey || event.metaKey) {
          this.copySelectedObjects();
        }
        break;
      case 'v':
        if (event.ctrlKey || event.metaKey) {
          this.pasteObjects();
        }
        break;
      case 'a':
        if (event.ctrlKey || event.metaKey) {
          this.selectAllObjects();
          event.preventDefault();
        }
        break;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    // Handle key releases if needed
  }

  private updateMousePosition(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handleLeftClick(event: MouseEvent): void {
    const intersectedObject = this.getIntersectedObject();
    
    if (intersectedObject) {
      const objectId = (intersectedObject as any).mapObjectId;
      if (objectId) {
        this.selectObject(objectId, event.ctrlKey || event.metaKey);
        this.startDrag(objectId, event);
      }
    } else {
      if (!event.ctrlKey && !event.metaKey) {
        this.clearSelection();
      }
    }
  }

  private handleRightClick(event: MouseEvent): void {
    // Handle context menu or other right-click actions
    event.preventDefault();
  }

  private getIntersectedObject(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const meshes = this.mapData.objects
      .map(obj => obj.mesh)
      .filter(mesh => mesh !== undefined) as THREE.Object3D[];
    
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    return intersects.length > 0 ? intersects[0].object : null;
  }

  // Drag and drop
  private startDrag(objectId: string, event: MouseEvent): void {
    this.dragState = {
      objectId,
      startPosition: this.mouse.clone(),
      startWorldPosition: this.getObject(objectId)?.position.clone() || new THREE.Vector3(),
      isDragging: false
    };
  }

  private handleDrag(event: MouseEvent): void {
    if (!this.dragState) return;

    const deltaX = this.mouse.x - this.dragState.startPosition.x;
    const deltaY = this.mouse.y - this.dragState.startPosition.y;

    // Convert screen space delta to world space
    const worldDelta = this.screenToWorldDelta(deltaX, deltaY);
    const newPosition = this.dragState.startWorldPosition.clone().add(worldDelta);

    this.moveObject(this.dragState.objectId, newPosition);
    this.dragState.isDragging = true;
  }

  private endDrag(): void {
    if (this.dragState?.isDragging) {
      this.emitBuilderEvent('object_drag_ended', { objectId: this.dragState.objectId });
    }
    this.dragState = null;
  }

  private screenToWorldDelta(deltaX: number, deltaY: number): THREE.Vector3 {
    // Simplified conversion - in a real implementation, this would be more sophisticated
    const scale = 10; // Adjust based on camera distance and FOV
    return new THREE.Vector3(deltaX * scale, 0, -deltaY * scale);
  }

  // Clipboard operations
  private copySelectedObjects(): void {
    this.clipboard = [];
    for (const objectId of this.selectedObjects) {
      const object = this.getObject(objectId);
      if (object) {
        this.clipboard.push({ ...object });
      }
    }
    this.emitBuilderEvent('objects_copied', { count: this.clipboard.length });
  }

  private pasteObjects(): void {
    if (this.clipboard.length === 0) return;

    this.clearSelection();
    
    for (const clipboardObject of this.clipboard) {
      const newPosition = clipboardObject.position.clone().add(new THREE.Vector3(2, 0, 2));
      const newObject = this.addObject(clipboardObject.type, newPosition, clipboardObject.properties);
      this.selectObject(newObject.id, true);
    }

    this.emitBuilderEvent('objects_pasted', { count: this.clipboard.length });
  }

  private deleteSelectedObjects(): void {
    const objectIds = Array.from(this.selectedObjects);
    for (const objectId of objectIds) {
      this.removeObject(objectId);
    }
    this.emitBuilderEvent('objects_deleted', { count: objectIds.length });
  }

  private selectAllObjects(): void {
    this.clearSelection();
    for (const object of this.mapData.objects) {
      this.selectObject(object.id, true);
    }
  }

  // Map data management
  private updateMapMetadata(): void {
    this.mapData.metadata.objectCount = this.mapData.objects.length;
    this.mapData.metadata.spawnPoints = this.mapData.objects.filter(obj => obj.type === 'spawn_point').length;
    this.mapData.metadata.hidingSpots = this.mapData.objects.filter(obj => obj.type === 'hiding_spot').length;
    this.mapData.updatedAt = Date.now();
  }

  private markDirty(): void {
    this.isDirty = true;
    this.updateMapMetadata();
  }

  private autoSave(): void {
    this.saveMap();
    this.emitBuilderEvent('map_auto_saved', { mapId: this.mapData.id });
  }

  // Public API
  getObject(objectId: string): MapObject | null {
    return this.mapData.objects.find(obj => obj.id === objectId) || null;
  }

  getAllObjects(): MapObject[] {
    return [...this.mapData.objects];
  }

  getSelectedObjects(): MapObject[] {
    return Array.from(this.selectedObjects)
      .map(id => this.getObject(id))
      .filter(obj => obj !== null) as MapObject[];
  }

  getMapData(): MapData {
    return { ...this.mapData, objects: [...this.mapData.objects] };
  }

  loadMap(mapData: MapData): void {
    // Clear current map
    this.clearMap();

    // Load new map data
    this.mapData = { ...mapData };

    // Create meshes for all objects
    for (const object of this.mapData.objects) {
      object.mesh = this.createObjectMesh(object);
      if (object.mesh) {
        this.scene.add(object.mesh);
      }
    }

    this.isDirty = false;
    this.emitBuilderEvent('map_loaded', { mapData: this.mapData });
  }

  saveMap(): string {
    const mapJson = JSON.stringify(this.mapData, null, 2);
    
    // In a real implementation, this would save to a server or local storage
    localStorage.setItem(`map_${this.mapData.id}`, mapJson);
    
    this.isDirty = false;
    this.emitBuilderEvent('map_saved', { mapId: this.mapData.id });
    
    return mapJson;
  }

  clearMap(): void {
    // Remove all objects from scene
    for (const object of this.mapData.objects) {
      if (object.mesh) {
        this.scene.remove(object.mesh);
        this.disposeObject(object.mesh);
      }
    }

    // Clear data
    this.mapData = this.createEmptyMap();
    this.selectedObjects.clear();
    this.clipboard = [];
    this.actionHistory = [];
    this.currentActionIndex = -1;
    this.isDirty = false;

    this.emitBuilderEvent('map_cleared', {});
  }

  // Tool management
  setTool(tool: BuilderTool): void {
    this.currentTool = tool;
    this.emitBuilderEvent('tool_changed', { tool });
  }

  getCurrentTool(): BuilderTool {
    return this.currentTool;
  }

  // Configuration
  updateOptions(newOptions: Partial<MapBuilderOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Update grid if needed
    if (newOptions.enableSnapToGrid !== undefined || newOptions.gridSize !== undefined) {
      if (this.gridHelper) {
        this.scene.remove(this.gridHelper);
      }
      if (this.options.enableSnapToGrid) {
        this.createGrid();
      }
    }

    // Update auto-save if needed
    if (newOptions.enableAutoSave !== undefined || newOptions.autoSaveInterval !== undefined) {
      if (this.options.enableAutoSave) {
        this.startAutoSave();
      } else if (this.autoSaveInterval) {
        clearInterval(this.autoSaveInterval);
        this.autoSaveInterval = null;
      }
    }
  }

  getOptions(): MapBuilderOptions {
    return { ...this.options };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.builderCallbacks.has(event)) {
      this.builderCallbacks.set(event, []);
    }
    this.builderCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.builderCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitBuilderEvent(event: string, data: any): void {
    const callbacks = this.builderCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Map builder event callback error:', error);
      }
    });
  }

  // Cleanup
  dispose(): void {
    // Stop auto-save
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Remove event listeners
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.renderer.domElement.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel.bind(this));
    
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    document.removeEventListener('keyup', this.handleKeyUp.bind(this));

    // Clear map
    this.clearMap();

    // Remove grid
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
    }

    // Clear callbacks
    this.builderCallbacks.clear();
  }
}

// Supporting types and interfaces
export type BuilderTool = 'select' | 'move' | 'rotate' | 'scale' | 'paint' | 'erase';

interface DragState {
  objectId: string;
  startPosition: THREE.Vector2;
  startWorldPosition: THREE.Vector3;
  isDragging: boolean;
}