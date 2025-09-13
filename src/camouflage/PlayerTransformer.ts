import * as THREE from 'three';
import { CamouflageOption, MovementRestriction } from '../types';
import { GeneratedCamouflage } from './CamouflageGenerator';

export interface TransformationState {
  isActive: boolean;
  camouflageOption: GeneratedCamouflage | null;
  originalAppearance: PlayerAppearance;
  transformedAppearance: PlayerAppearance;
  startTime: number;
  endTime: number;
  restrictions: MovementRestriction[];
}

export interface PlayerAppearance {
  model: string;
  scale: THREE.Vector3;
  color: number;
  opacity: number;
  materials: THREE.Material[];
  geometry: THREE.BufferGeometry;
}

export interface PlayerTransformerOptions {
  transformationDuration?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  enableParticleEffects?: boolean;
  enableSoundEffects?: boolean;
  maxSimultaneousTransformations?: number;
}

export class PlayerTransformer {
  private scene: THREE.Scene;
  private options: Required<PlayerTransformerOptions>;
  private activeTransformations: Map<string, TransformationState> = new Map();
  private playerMeshes: Map<string, THREE.Mesh> = new Map();
  private transformationCallbacks: Map<string, Function[]> = new Map();

  constructor(scene: THREE.Scene, options: PlayerTransformerOptions = {}) {
    this.scene = scene;
    this.options = {
      transformationDuration: options.transformationDuration || 500,
      fadeInDuration: options.fadeInDuration || 300,
      fadeOutDuration: options.fadeOutDuration || 300,
      enableParticleEffects: options.enableParticleEffects !== false,
      enableSoundEffects: options.enableSoundEffects !== false,
      maxSimultaneousTransformations: options.maxSimultaneousTransformations || 1
    };
  }

  registerPlayer(playerId: string, playerMesh: THREE.Mesh): void {
    this.playerMeshes.set(playerId, playerMesh);
    this.transformationCallbacks.set(playerId, []);
  }

  unregisterPlayer(playerId: string): void {
    this.cancelTransformation(playerId);
    this.playerMeshes.delete(playerId);
    this.transformationCallbacks.delete(playerId);
  }

  async transformPlayer(
    playerId: string, 
    camouflageOption: GeneratedCamouflage
  ): Promise<boolean> {
    const playerMesh = this.playerMeshes.get(playerId);
    if (!playerMesh) {
      console.warn(`Player mesh not found for ID: ${playerId}`);
      return false;
    }

    // Check if transformation is already active
    if (this.activeTransformations.has(playerId)) {
      console.warn(`Transformation already active for player: ${playerId}`);
      return false;
    }

    // Check simultaneous transformation limit
    if (this.activeTransformations.size >= this.options.maxSimultaneousTransformations) {
      console.warn('Maximum simultaneous transformations reached');
      return false;
    }

    try {
      const originalAppearance = this.capturePlayerAppearance(playerMesh);
      const transformedAppearance = this.createTransformedAppearance(camouflageOption, originalAppearance);

      const transformationState: TransformationState = {
        isActive: true,
        camouflageOption,
        originalAppearance,
        transformedAppearance,
        startTime: Date.now(),
        endTime: Date.now() + (camouflageOption.duration || 30000),
        restrictions: camouflageOption.restrictions
      };

      this.activeTransformations.set(playerId, transformationState);

      // Execute transformation
      await this.executeTransformation(playerId, playerMesh, transformationState);

      // Set up auto-revert timer
      this.setupAutoRevert(playerId, transformationState.endTime);

      this.notifyTransformationCallbacks(playerId, 'started', transformationState);
      return true;

    } catch (error) {
      console.error('Transformation failed:', error);
      this.activeTransformations.delete(playerId);
      return false;
    }
  }

  async revertTransformation(playerId: string): Promise<boolean> {
    const transformationState = this.activeTransformations.get(playerId);
    const playerMesh = this.playerMeshes.get(playerId);

    if (!transformationState || !playerMesh) {
      return false;
    }

    try {
      await this.executeReversion(playerId, playerMesh, transformationState);
      this.activeTransformations.delete(playerId);
      this.notifyTransformationCallbacks(playerId, 'ended', transformationState);
      return true;

    } catch (error) {
      console.error('Reversion failed:', error);
      return false;
    }
  }

  private capturePlayerAppearance(playerMesh: THREE.Mesh): PlayerAppearance {
    return {
      model: playerMesh.userData.model || 'default',
      scale: playerMesh.scale.clone(),
      color: this.extractMeshColor(playerMesh),
      opacity: this.extractMeshOpacity(playerMesh),
      materials: this.cloneMaterials(playerMesh.material),
      geometry: playerMesh.geometry.clone()
    };
  }

  private extractMeshColor(mesh: THREE.Mesh): number {
    if (mesh.material instanceof THREE.MeshLambertMaterial || 
        mesh.material instanceof THREE.MeshBasicMaterial) {
      return mesh.material.color.getHex();
    }
    
    if (Array.isArray(mesh.material) && mesh.material.length > 0) {
      const firstMaterial = mesh.material[0];
      if (firstMaterial instanceof THREE.MeshLambertMaterial || 
          firstMaterial instanceof THREE.MeshBasicMaterial) {
        return firstMaterial.color.getHex();
      }
    }
    
    return 0xffffff;
  }

  private extractMeshOpacity(mesh: THREE.Mesh): number {
    if (mesh.material instanceof THREE.MeshLambertMaterial || 
        mesh.material instanceof THREE.MeshBasicMaterial) {
      return mesh.material.opacity;
    }
    
    if (Array.isArray(mesh.material) && mesh.material.length > 0) {
      const firstMaterial = mesh.material[0];
      if (firstMaterial instanceof THREE.MeshLambertMaterial || 
          firstMaterial instanceof THREE.MeshBasicMaterial) {
        return firstMaterial.opacity;
      }
    }
    
    return 1.0;
  }

  private cloneMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
    if (Array.isArray(material)) {
      return material.map(mat => mat.clone());
    }
    return [material.clone()];
  }

  private createTransformedAppearance(
    camouflageOption: GeneratedCamouflage, 
    originalAppearance: PlayerAppearance
  ): PlayerAppearance {
    const transformedAppearance: PlayerAppearance = {
      model: camouflageOption.model,
      scale: camouflageOption.scale || originalAppearance.scale.clone(),
      color: camouflageOption.color || originalAppearance.color,
      opacity: this.calculateCamouflageOpacity(camouflageOption),
      materials: this.createCamouflageMaterials(camouflageOption, originalAppearance),
      geometry: this.createCamouflageGeometry(camouflageOption, originalAppearance)
    };

    return transformedAppearance;
  }

  private calculateCamouflageOpacity(camouflageOption: GeneratedCamouflage): number {
    // Higher believability = more solid appearance
    const baseOpacity = 0.7;
    const believabilityBonus = camouflageOption.believabilityScore * 0.3;
    return Math.min(1.0, baseOpacity + believabilityBonus);
  }

  private createCamouflageMaterials(
    camouflageOption: GeneratedCamouflage, 
    originalAppearance: PlayerAppearance
  ): THREE.Material[] {
    const camouflageMaterial = new THREE.MeshLambertMaterial({
      color: camouflageOption.color || originalAppearance.color,
      opacity: this.calculateCamouflageOpacity(camouflageOption),
      transparent: true
    });

    // Add special effects based on camouflage quality
    if (camouflageOption.believabilityScore > 0.8) {
      // High quality camouflage gets subtle shimmer effect
      camouflageMaterial.emissive = new THREE.Color(camouflageOption.color || 0xffffff);
      camouflageMaterial.emissiveIntensity = 0.05;
    }

    return [camouflageMaterial];
  }

  private createCamouflageGeometry(
    camouflageOption: GeneratedCamouflage, 
    originalAppearance: PlayerAppearance
  ): THREE.BufferGeometry {
    // Create geometry based on object type
    switch (camouflageOption.objectType) {
      case 'box':
        return new THREE.BoxGeometry(1, 1, 1);
      case 'sphere':
        return new THREE.SphereGeometry(0.5, 16, 12);
      case 'cylinder':
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
      default:
        return originalAppearance.geometry.clone();
    }
  }

  private async executeTransformation(
    playerId: string, 
    playerMesh: THREE.Mesh, 
    transformationState: TransformationState
  ): Promise<void> {
    // Create particle effects
    if (this.options.enableParticleEffects) {
      this.createTransformationParticles(playerMesh.position);
    }

    // Fade out original appearance
    await this.fadeOut(playerMesh, this.options.fadeOutDuration);

    // Apply transformed appearance
    this.applyTransformedAppearance(playerMesh, transformationState.transformedAppearance);

    // Fade in new appearance
    await this.fadeIn(playerMesh, this.options.fadeInDuration);

    // Apply movement restrictions
    this.applyMovementRestrictions(playerId, transformationState.restrictions);
  }

  private async executeReversion(
    playerId: string, 
    playerMesh: THREE.Mesh, 
    transformationState: TransformationState
  ): Promise<void> {
    // Create reversion particles
    if (this.options.enableParticleEffects) {
      this.createReversionParticles(playerMesh.position);
    }

    // Fade out transformed appearance
    await this.fadeOut(playerMesh, this.options.fadeOutDuration);

    // Restore original appearance
    this.applyTransformedAppearance(playerMesh, transformationState.originalAppearance);

    // Fade in original appearance
    await this.fadeIn(playerMesh, this.options.fadeInDuration);

    // Remove movement restrictions
    this.removeMovementRestrictions(playerId);
  }

  private applyTransformedAppearance(playerMesh: THREE.Mesh, appearance: PlayerAppearance): void {
    // Update geometry
    playerMesh.geometry.dispose();
    playerMesh.geometry = appearance.geometry;

    // Update materials
    if (Array.isArray(playerMesh.material)) {
      playerMesh.material.forEach(mat => mat.dispose());
    } else {
      playerMesh.material.dispose();
    }
    
    playerMesh.material = appearance.materials.length === 1 
      ? appearance.materials[0] 
      : appearance.materials;

    // Update scale
    playerMesh.scale.copy(appearance.scale);

    // Update user data
    playerMesh.userData.model = appearance.model;
  }

  private async fadeOut(mesh: THREE.Mesh, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const startOpacity = this.extractMeshOpacity(mesh);
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentOpacity = startOpacity * (1 - progress);

        this.setMeshOpacity(mesh, currentOpacity);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  private async fadeIn(mesh: THREE.Mesh, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const targetOpacity = this.extractMeshOpacity(mesh);
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentOpacity = targetOpacity * progress;

        this.setMeshOpacity(mesh, currentOpacity);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  private setMeshOpacity(mesh: THREE.Mesh, opacity: number): void {
    if (mesh.material instanceof THREE.MeshLambertMaterial || 
        mesh.material instanceof THREE.MeshBasicMaterial) {
      mesh.material.opacity = opacity;
      mesh.material.transparent = opacity < 1;
    }
    
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => {
        if (mat instanceof THREE.MeshLambertMaterial || 
            mat instanceof THREE.MeshBasicMaterial) {
          mat.opacity = opacity;
          mat.transparent = opacity < 1;
        }
      });
    }
  }

  private createTransformationParticles(position: THREE.Vector3): void {
    // Simple particle effect for transformation
    const particleCount = 20;
    const particles = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ 
          color: 0x00ff00, 
          transparent: true, 
          opacity: 0.8 
        })
      );

      particle.position.copy(position);
      particle.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ));

      particles.add(particle);
    }

    this.scene.add(particles);

    // Animate and remove particles
    setTimeout(() => {
      this.scene.remove(particles);
      particles.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }, 2000);
  }

  private createReversionParticles(position: THREE.Vector3): void {
    // Similar to transformation particles but with different color
    const particleCount = 15;
    const particles = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        new THREE.MeshBasicMaterial({ 
          color: 0xff6600, 
          transparent: true, 
          opacity: 0.6 
        })
      );

      particle.position.copy(position);
      particle.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      ));

      particles.add(particle);
    }

    this.scene.add(particles);

    setTimeout(() => {
      this.scene.remove(particles);
      particles.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }, 1500);
  }

  private applyMovementRestrictions(playerId: string, restrictions: MovementRestriction[]): void {
    // Store restrictions for external systems to query
    const playerMesh = this.playerMeshes.get(playerId);
    if (playerMesh) {
      playerMesh.userData.movementRestrictions = restrictions;
    }
  }

  private removeMovementRestrictions(playerId: string): void {
    const playerMesh = this.playerMeshes.get(playerId);
    if (playerMesh) {
      delete playerMesh.userData.movementRestrictions;
    }
  }

  private setupAutoRevert(playerId: string, endTime: number): void {
    const timeUntilRevert = endTime - Date.now();
    
    if (timeUntilRevert > 0) {
      setTimeout(() => {
        this.revertTransformation(playerId);
      }, timeUntilRevert);
    }
  }

  private notifyTransformationCallbacks(
    playerId: string, 
    event: 'started' | 'ended', 
    state: TransformationState
  ): void {
    const callbacks = this.transformationCallbacks.get(playerId) || [];
    callbacks.forEach(callback => {
      try {
        callback(event, state);
      } catch (error) {
        console.error('Transformation callback error:', error);
      }
    });
  }

  // Public utility methods
  isPlayerTransformed(playerId: string): boolean {
    return this.activeTransformations.has(playerId);
  }

  getTransformationState(playerId: string): TransformationState | null {
    return this.activeTransformations.get(playerId) || null;
  }

  getRemainingTransformationTime(playerId: string): number {
    const state = this.activeTransformations.get(playerId);
    if (!state) return 0;
    
    return Math.max(0, state.endTime - Date.now());
  }

  cancelTransformation(playerId: string): boolean {
    if (this.activeTransformations.has(playerId)) {
      return this.revertTransformation(playerId);
    }
    return false;
  }

  addTransformationCallback(playerId: string, callback: Function): void {
    const callbacks = this.transformationCallbacks.get(playerId) || [];
    callbacks.push(callback);
    this.transformationCallbacks.set(playerId, callbacks);
  }

  removeTransformationCallback(playerId: string, callback: Function): void {
    const callbacks = this.transformationCallbacks.get(playerId) || [];
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  getActiveTransformations(): Map<string, TransformationState> {
    return new Map(this.activeTransformations);
  }

  updateTransformationDuration(playerId: string, newDuration: number): boolean {
    const state = this.activeTransformations.get(playerId);
    if (!state) return false;

    state.endTime = Date.now() + newDuration;
    this.setupAutoRevert(playerId, state.endTime);
    return true;
  }

  dispose(): void {
    // Cancel all active transformations
    for (const playerId of this.activeTransformations.keys()) {
      this.cancelTransformation(playerId);
    }
    
    this.activeTransformations.clear();
    this.playerMeshes.clear();
    this.transformationCallbacks.clear();
  }
}