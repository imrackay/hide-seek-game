import * as THREE from 'three';
import { PlayerPosition } from './ARPlayerTracker';

export interface AROverlayOptions {
  enablePlayerAvatars?: boolean;
  enablePlayerNames?: boolean;
  enableDistanceIndicators?: boolean;
  enableDirectionalArrows?: boolean;
  maxRenderDistance?: number;
  avatarScale?: number;
  nameTagScale?: number;
  enableOcclusion?: boolean;
  enableDepthTesting?: boolean;
  updateFrequency?: number;
}

export interface PlayerAvatar {
  playerId: string;
  playerName: string;
  mesh: THREE.Object3D;
  nameTag?: THREE.Object3D;
  distanceIndicator?: THREE.Object3D;
  directionalArrow?: THREE.Object3D;
  isVisible: boolean;
  lastUpdate: number;
}

export interface ARUIElement {
  id: string;
  type: 'button' | 'panel' | 'indicator' | 'menu';
  position: THREE.Vector3;
  element: THREE.Object3D;
  isVisible: boolean;
  isInteractable: boolean;
  onClick?: () => void;
  onHover?: () => void;
}

export interface OverlayRenderState {
  totalAvatars: number;
  visibleAvatars: number;
  totalUIElements: number;
  visibleUIElements: number;
  lastRenderTime: number;
  renderFPS: number;
}

export class AROverlaySystem {
  private options: Required<AROverlayOptions>;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  
  // Avatar management
  private playerAvatars: Map<string, PlayerAvatar> = new Map();
  private uiElements: Map<string, ARUIElement> = new Map();
  private overlayCallbacks: Map<string, Function[]> = new Map();
  
  // Rendering
  private renderState: OverlayRenderState;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  
  // Materials and geometries
  private avatarMaterial: THREE.Material;
  private nameTagMaterial: THREE.Material;
  private arrowMaterial: THREE.Material;
  private indicatorMaterial: THREE.Material;
  
  // Raycaster for interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    options: AROverlayOptions = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.options = {
      enablePlayerAvatars: options.enablePlayerAvatars !== false,
      enablePlayerNames: options.enablePlayerNames !== false,
      enableDistanceIndicators: options.enableDistanceIndicators !== false,
      enableDirectionalArrows: options.enableDirectionalArrows !== false,
      maxRenderDistance: options.maxRenderDistance || 100,
      avatarScale: options.avatarScale || 1.0,
      nameTagScale: options.nameTagScale || 1.0,
      enableOcclusion: options.enableOcclusion !== false,
      enableDepthTesting: options.enableDepthTesting !== false,
      updateFrequency: options.updateFrequency || 30 // FPS
    };

    this.renderState = {
      totalAvatars: 0,
      visibleAvatars: 0,
      totalUIElements: 0,
      visibleUIElements: 0,
      lastRenderTime: 0,
      renderFPS: 0
    };

    this.initializeMaterials();
    this.setupEventListeners();
    this.startUpdateLoop();
  }

  // Initialization
  private initializeMaterials(): void {
    // Avatar material
    this.avatarMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      depthTest: this.options.enableDepthTesting,
      depthWrite: false
    });

    // Name tag material
    this.nameTagMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false
    });

    // Arrow material
    this.arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.7,
      depthTest: this.options.enableDepthTesting,
      depthWrite: false
    });

    // Indicator material
    this.indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false
    });
  }

  private setupEventListeners(): void {
    // Mouse/touch events for interaction
    this.renderer.domElement.addEventListener('click', this.handleClick.bind(this));
    this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.renderer.domElement.addEventListener('touchstart', this.handleTouch.bind(this));
  }

  private startUpdateLoop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const updateInterval = 1000 / this.options.updateFrequency;
    this.updateInterval = setInterval(() => {
      this.updateOverlays();
    }, updateInterval);
  }

  // Player avatar management
  addPlayerAvatar(
    playerId: string, 
    playerName: string, 
    position: THREE.Vector3,
    avatarModel?: THREE.Object3D
  ): PlayerAvatar {
    // Remove existing avatar if present
    this.removePlayerAvatar(playerId);

    // Create avatar mesh
    const avatarMesh = avatarModel || this.createDefaultAvatar();
    avatarMesh.position.copy(position);
    avatarMesh.scale.setScalar(this.options.avatarScale);
    
    // Create name tag
    let nameTag: THREE.Object3D | undefined;
    if (this.options.enablePlayerNames) {
      nameTag = this.createNameTag(playerName);
      nameTag.position.copy(position);
      nameTag.position.y += 2.5; // Above avatar
    }

    // Create distance indicator
    let distanceIndicator: THREE.Object3D | undefined;
    if (this.options.enableDistanceIndicators) {
      distanceIndicator = this.createDistanceIndicator();
      distanceIndicator.position.copy(position);
      distanceIndicator.position.y += 3.0; // Above name tag
    }

    // Create directional arrow
    let directionalArrow: THREE.Object3D | undefined;
    if (this.options.enableDirectionalArrows) {
      directionalArrow = this.createDirectionalArrow();
    }

    const avatar: PlayerAvatar = {
      playerId,
      playerName,
      mesh: avatarMesh,
      nameTag,
      distanceIndicator,
      directionalArrow,
      isVisible: true,
      lastUpdate: Date.now()
    };

    // Add to scene
    if (this.options.enablePlayerAvatars) {
      this.scene.add(avatarMesh);
    }
    if (nameTag) {
      this.scene.add(nameTag);
    }
    if (distanceIndicator) {
      this.scene.add(distanceIndicator);
    }
    if (directionalArrow) {
      this.scene.add(directionalArrow);
    }

    this.playerAvatars.set(playerId, avatar);
    this.renderState.totalAvatars++;

    this.emitOverlayEvent('avatar_added', { playerId, playerName });

    return avatar;
  }

  removePlayerAvatar(playerId: string): boolean {
    const avatar = this.playerAvatars.get(playerId);
    if (!avatar) return false;

    // Remove from scene
    this.scene.remove(avatar.mesh);
    if (avatar.nameTag) this.scene.remove(avatar.nameTag);
    if (avatar.distanceIndicator) this.scene.remove(avatar.distanceIndicator);
    if (avatar.directionalArrow) this.scene.remove(avatar.directionalArrow);

    // Dispose geometries and materials
    this.disposeObject(avatar.mesh);
    if (avatar.nameTag) this.disposeObject(avatar.nameTag);
    if (avatar.distanceIndicator) this.disposeObject(avatar.distanceIndicator);
    if (avatar.directionalArrow) this.disposeObject(avatar.directionalArrow);

    this.playerAvatars.delete(playerId);
    this.renderState.totalAvatars--;

    this.emitOverlayEvent('avatar_removed', { playerId });

    return true;
  }

  updatePlayerAvatar(playerId: string, position: THREE.Vector3, playerData?: PlayerPosition): void {
    const avatar = this.playerAvatars.get(playerId);
    if (!avatar) return;

    // Update position
    avatar.mesh.position.copy(position);
    
    if (avatar.nameTag) {
      avatar.nameTag.position.copy(position);
      avatar.nameTag.position.y += 2.5;
    }

    if (avatar.distanceIndicator) {
      avatar.distanceIndicator.position.copy(position);
      avatar.distanceIndicator.position.y += 3.0;
      
      // Update distance text
      if (playerData) {
        this.updateDistanceIndicator(avatar.distanceIndicator, position);
      }
    }

    // Update directional arrow
    if (avatar.directionalArrow) {
      this.updateDirectionalArrow(avatar.directionalArrow, position);
    }

    // Update visibility based on distance
    const cameraPosition = this.camera.position;
    const distance = cameraPosition.distanceTo(position);
    const shouldBeVisible = distance <= this.options.maxRenderDistance;

    this.setAvatarVisibility(avatar, shouldBeVisible);
    
    avatar.lastUpdate = Date.now();
  }

  private setAvatarVisibility(avatar: PlayerAvatar, visible: boolean): void {
    if (avatar.isVisible === visible) return;

    avatar.isVisible = visible;
    avatar.mesh.visible = visible && this.options.enablePlayerAvatars;
    
    if (avatar.nameTag) {
      avatar.nameTag.visible = visible && this.options.enablePlayerNames;
    }
    
    if (avatar.distanceIndicator) {
      avatar.distanceIndicator.visible = visible && this.options.enableDistanceIndicators;
    }
    
    if (avatar.directionalArrow) {
      avatar.directionalArrow.visible = visible && this.options.enableDirectionalArrows;
    }

    if (visible) {
      this.renderState.visibleAvatars++;
    } else {
      this.renderState.visibleAvatars--;
    }
  }

  // Avatar creation helpers
  private createDefaultAvatar(): THREE.Object3D {
    const geometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
    const mesh = new THREE.Mesh(geometry, this.avatarMaterial.clone());
    
    // Add simple face
    const faceGeometry = new THREE.SphereGeometry(0.15, 8, 6);
    const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xffddaa });
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.set(0, 0.6, 0.25);
    mesh.add(face);

    return mesh;
  }

  private createNameTag(playerName: string): THREE.Object3D {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    // Set canvas size
    canvas.width = 256;
    canvas.height = 64;
    
    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(playerName, canvas.width / 2, canvas.height / 2);
    
    // Create texture and material
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    
    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(2, 0.5);
    const nameTag = new THREE.Mesh(geometry, material);
    
    // Make it always face camera
    nameTag.lookAt(this.camera.position);
    
    return nameTag;
  }

  private createDistanceIndicator(): THREE.Object3D {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    canvas.width = 128;
    canvas.height = 32;
    
    // Create initial texture
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    
    const geometry = new THREE.PlaneGeometry(1, 0.25);
    const indicator = new THREE.Mesh(geometry, material);
    
    // Store canvas and context for updates
    (indicator as any).canvas = canvas;
    (indicator as any).context = context;
    (indicator as any).texture = texture;
    
    return indicator;
  }

  private updateDistanceIndicator(indicator: THREE.Object3D, position: THREE.Vector3): void {
    const canvas = (indicator as any).canvas;
    const context = (indicator as any).context;
    const texture = (indicator as any).texture;
    
    if (!canvas || !context || !texture) return;
    
    const distance = this.camera.position.distanceTo(position);
    const distanceText = distance < 1 ? `${(distance * 100).toFixed(0)}cm` : `${distance.toFixed(1)}m`;
    
    // Clear and redraw
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(0, 100, 200, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.fillStyle = 'white';
    context.font = '16px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(distanceText, canvas.width / 2, canvas.height / 2);
    
    texture.needsUpdate = true;
    
    // Make it face camera
    indicator.lookAt(this.camera.position);
  }

  private createDirectionalArrow(): THREE.Object3D {
    const geometry = new THREE.ConeGeometry(0.1, 0.5, 6);
    const arrow = new THREE.Mesh(geometry, this.arrowMaterial.clone());
    arrow.rotation.x = -Math.PI / 2; // Point forward
    return arrow;
  }

  private updateDirectionalArrow(arrow: THREE.Object3D, targetPosition: THREE.Vector3): void {
    const cameraPosition = this.camera.position;
    const distance = cameraPosition.distanceTo(targetPosition);
    
    // Only show arrow if target is far away
    if (distance < 5) {
      arrow.visible = false;
      return;
    }
    
    arrow.visible = true;
    
    // Position arrow in front of camera
    const direction = new THREE.Vector3()
      .subVectors(targetPosition, cameraPosition)
      .normalize();
    
    arrow.position.copy(cameraPosition);
    arrow.position.add(direction.multiplyScalar(2)); // 2 meters in front
    
    // Point arrow towards target
    arrow.lookAt(targetPosition);
  }

  // UI Element management
  addUIElement(
    id: string,
    type: ARUIElement['type'],
    position: THREE.Vector3,
    element: THREE.Object3D,
    options: {
      isInteractable?: boolean;
      onClick?: () => void;
      onHover?: () => void;
    } = {}
  ): ARUIElement {
    // Remove existing element if present
    this.removeUIElement(id);

    element.position.copy(position);
    
    const uiElement: ARUIElement = {
      id,
      type,
      position: position.clone(),
      element,
      isVisible: true,
      isInteractable: options.isInteractable !== false,
      onClick: options.onClick,
      onHover: options.onHover
    };

    this.scene.add(element);
    this.uiElements.set(id, uiElement);
    this.renderState.totalUIElements++;

    this.emitOverlayEvent('ui_element_added', { id, type });

    return uiElement;
  }

  removeUIElement(id: string): boolean {
    const element = this.uiElements.get(id);
    if (!element) return false;

    this.scene.remove(element.element);
    this.disposeObject(element.element);
    
    this.uiElements.delete(id);
    this.renderState.totalUIElements--;

    this.emitOverlayEvent('ui_element_removed', { id });

    return true;
  }

  updateUIElement(id: string, position?: THREE.Vector3, visible?: boolean): boolean {
    const element = this.uiElements.get(id);
    if (!element) return false;

    if (position) {
      element.position.copy(position);
      element.element.position.copy(position);
    }

    if (visible !== undefined) {
      element.isVisible = visible;
      element.element.visible = visible;
    }

    return true;
  }

  // Update loop
  private updateOverlays(): void {
    const now = Date.now();
    this.renderState.lastRenderTime = now;

    // Update FPS calculation
    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.renderState.renderFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    // Update avatar visibility and positions
    this.renderState.visibleAvatars = 0;
    for (const avatar of this.playerAvatars.values()) {
      const distance = this.camera.position.distanceTo(avatar.mesh.position);
      const shouldBeVisible = distance <= this.options.maxRenderDistance;
      
      this.setAvatarVisibility(avatar, shouldBeVisible);
      
      // Update name tag and distance indicator to face camera
      if (avatar.nameTag && avatar.nameTag.visible) {
        avatar.nameTag.lookAt(this.camera.position);
      }
      
      if (avatar.distanceIndicator && avatar.distanceIndicator.visible) {
        this.updateDistanceIndicator(avatar.distanceIndicator, avatar.mesh.position);
      }
    }

    // Update UI elements visibility
    this.renderState.visibleUIElements = 0;
    for (const uiElement of this.uiElements.values()) {
      if (uiElement.isVisible) {
        this.renderState.visibleUIElements++;
      }
    }

    this.emitOverlayEvent('overlays_updated', { renderState: this.renderState });
  }

  // Interaction handling
  private handleClick(event: MouseEvent): void {
    this.updateMousePosition(event);
    this.checkInteractions();
  }

  private handleMouseMove(event: MouseEvent): void {
    this.updateMousePosition(event);
    // Could implement hover effects here
  }

  private handleTouch(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.updateMousePosition(touch);
      this.checkInteractions();
    }
  }

  private updateMousePosition(event: MouseEvent | Touch): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private checkInteractions(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check UI element interactions
    const interactableElements = Array.from(this.uiElements.values())
      .filter(el => el.isInteractable && el.isVisible)
      .map(el => el.element);
    
    const intersects = this.raycaster.intersectObjects(interactableElements, true);
    
    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;
      
      // Find the UI element that owns this object
      for (const uiElement of this.uiElements.values()) {
        if (this.isChildOf(intersectedObject, uiElement.element)) {
          if (uiElement.onClick) {
            uiElement.onClick();
          }
          
          this.emitOverlayEvent('ui_element_clicked', { 
            id: uiElement.id, 
            type: uiElement.type 
          });
          break;
        }
      }
    }
  }

  private isChildOf(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    let current = child;
    while (current) {
      if (current === parent) return true;
      current = current.parent!;
    }
    return false;
  }

  // Utility methods
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

  // Query methods
  getPlayerAvatar(playerId: string): PlayerAvatar | null {
    return this.playerAvatars.get(playerId) || null;
  }

  getAllPlayerAvatars(): PlayerAvatar[] {
    return Array.from(this.playerAvatars.values());
  }

  getUIElement(id: string): ARUIElement | null {
    return this.uiElements.get(id) || null;
  }

  getAllUIElements(): ARUIElement[] {
    return Array.from(this.uiElements.values());
  }

  getRenderState(): OverlayRenderState {
    return { ...this.renderState };
  }

  // Configuration
  updateOptions(newOptions: Partial<AROverlayOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Update materials based on new options
    if (this.avatarMaterial) {
      this.avatarMaterial.depthTest = this.options.enableDepthTesting;
    }
    if (this.arrowMaterial) {
      this.arrowMaterial.depthTest = this.options.enableDepthTesting;
    }
    
    // Update update frequency
    if (newOptions.updateFrequency) {
      this.startUpdateLoop();
    }
  }

  getOptions(): AROverlayOptions {
    return { ...this.options };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.overlayCallbacks.has(event)) {
      this.overlayCallbacks.set(event, []);
    }
    this.overlayCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.overlayCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitOverlayEvent(event: string, data: any): void {
    const callbacks = this.overlayCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('AR overlay event callback error:', error);
      }
    });
  }

  // Cleanup
  dispose(): void {
    // Stop update loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Remove event listeners
    this.renderer.domElement.removeEventListener('click', this.handleClick.bind(this));
    this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.renderer.domElement.removeEventListener('touchstart', this.handleTouch.bind(this));

    // Remove all avatars
    for (const playerId of this.playerAvatars.keys()) {
      this.removePlayerAvatar(playerId);
    }

    // Remove all UI elements
    for (const id of this.uiElements.keys()) {
      this.removeUIElement(id);
    }

    // Dispose materials
    this.avatarMaterial.dispose();
    this.nameTagMaterial.dispose();
    this.arrowMaterial.dispose();
    this.indicatorMaterial.dispose();

    // Clear callbacks
    this.overlayCallbacks.clear();
  }
}