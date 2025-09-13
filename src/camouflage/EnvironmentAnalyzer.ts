import * as THREE from 'three';
import { CamouflageOption, MapObject } from '../types';

export interface EnvironmentAnalysisResult {
  nearbyObjects: AnalyzedObject[];
  camouflageOptions: CamouflageOption[];
  environmentScore: number;
  analysisTimestamp: number;
}

export interface AnalyzedObject {
  id: string;
  type: string;
  position: THREE.Vector3;
  size: THREE.Vector3;
  color: number;
  distance: number;
  believabilityScore: number;
  canCamouflage: boolean;
  mesh?: THREE.Mesh;
}

export interface EnvironmentAnalyzerOptions {
  analysisRadius?: number;
  maxCamouflageOptions?: number;
  minBelievabilityScore?: number;
  considerPlayerSize?: boolean;
  playerRadius?: number;
  enableAdvancedScoring?: boolean;
}

export class EnvironmentAnalyzer {
  private scene: THREE.Scene;
  private options: Required<EnvironmentAnalyzerOptions>;
  private lastAnalysis: EnvironmentAnalysisResult | null = null;

  constructor(scene: THREE.Scene, options: EnvironmentAnalyzerOptions = {}) {
    this.scene = scene;
    this.options = {
      analysisRadius: options.analysisRadius || 10,
      maxCamouflageOptions: options.maxCamouflageOptions || 5,
      minBelievabilityScore: options.minBelievabilityScore || 0.3,
      considerPlayerSize: options.considerPlayerSize !== false,
      playerRadius: options.playerRadius || 0.5,
      enableAdvancedScoring: options.enableAdvancedScoring !== false
    };
  }

  analyzeEnvironment(playerPosition: THREE.Vector3): EnvironmentAnalysisResult {
    const nearbyObjects = this.findNearbyObjects(playerPosition);
    const analyzedObjects = this.analyzeObjects(nearbyObjects, playerPosition);
    const camouflageOptions = this.generateCamouflageOptions(analyzedObjects, playerPosition);
    const environmentScore = this.calculateEnvironmentScore(analyzedObjects);

    const result: EnvironmentAnalysisResult = {
      nearbyObjects: analyzedObjects,
      camouflageOptions,
      environmentScore,
      analysisTimestamp: Date.now()
    };

    this.lastAnalysis = result;
    return result;
  }

  private findNearbyObjects(playerPosition: THREE.Vector3): THREE.Mesh[] {
    const nearbyObjects: THREE.Mesh[] = [];
    const playerSphere = new THREE.Sphere(playerPosition, this.options.analysisRadius);

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.canCamouflage) {
        const objectBox = new THREE.Box3().setFromObject(object);
        
        if (playerSphere.intersectsBox(objectBox)) {
          nearbyObjects.push(object);
        }
      }
    });

    return nearbyObjects;
  }

  private analyzeObjects(objects: THREE.Mesh[], playerPosition: THREE.Vector3): AnalyzedObject[] {
    return objects.map(mesh => {
      const objectPosition = mesh.position.clone();
      const distance = playerPosition.distanceTo(objectPosition);
      const size = this.calculateObjectSize(mesh);
      const believabilityScore = this.calculateBelievabilityScore(mesh, playerPosition, distance);

      return {
        id: mesh.userData.id || mesh.uuid,
        type: mesh.userData.type || 'unknown',
        position: objectPosition,
        size,
        color: this.extractObjectColor(mesh),
        distance,
        believabilityScore,
        canCamouflage: mesh.userData.canCamouflage === true,
        mesh
      };
    }).sort((a, b) => b.believabilityScore - a.believabilityScore);
  }

  private calculateObjectSize(mesh: THREE.Mesh): THREE.Vector3 {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    return size;
  }

  private extractObjectColor(mesh: THREE.Mesh): number {
    if (mesh.material instanceof THREE.MeshLambertMaterial || 
        mesh.material instanceof THREE.MeshBasicMaterial) {
      return mesh.material.color.getHex();
    }
    
    if (Array.isArray(mesh.material)) {
      const firstMaterial = mesh.material[0];
      if (firstMaterial instanceof THREE.MeshLambertMaterial || 
          firstMaterial instanceof THREE.MeshBasicMaterial) {
        return firstMaterial.color.getHex();
      }
    }
    
    return 0xffffff; // Default white
  }

  private calculateBelievabilityScore(
    mesh: THREE.Mesh, 
    playerPosition: THREE.Vector3, 
    distance: number
  ): number {
    let score = 1.0;

    // Distance factor - closer objects are more believable
    const distanceFactor = Math.max(0, 1 - (distance / this.options.analysisRadius));
    score *= distanceFactor;

    // Size factor - objects similar to player size are more believable
    if (this.options.considerPlayerSize) {
      const objectSize = this.calculateObjectSize(mesh);
      const playerSize = this.options.playerRadius * 2;
      
      const sizeDifference = Math.abs(
        (objectSize.x + objectSize.z) / 2 - playerSize
      );
      const sizeFactor = Math.max(0.2, 1 - (sizeDifference / playerSize));
      score *= sizeFactor;
    }

    // Object type factor
    const typeFactor = this.getTypeBeliavabilityFactor(mesh.userData.type);
    score *= typeFactor;

    // Visibility factor - objects in open areas are less believable
    const visibilityFactor = this.calculateVisibilityFactor(mesh, playerPosition);
    score *= visibilityFactor;

    // Advanced scoring factors
    if (this.options.enableAdvancedScoring) {
      score *= this.calculateAdvancedFactors(mesh, playerPosition);
    }

    return Math.max(0, Math.min(1, score));
  }

  private getTypeBeliavabilityFactor(objectType: string): number {
    const typeFactors: Record<string, number> = {
      'box': 0.8,
      'sphere': 0.6,
      'cylinder': 0.7,
      'wall': 0.3, // Walls are less believable for hiding
      'tree': 0.9,
      'rock': 0.85,
      'barrel': 0.9,
      'crate': 0.85,
      'unknown': 0.5
    };

    return typeFactors[objectType] || 0.5;
  }

  private calculateVisibilityFactor(mesh: THREE.Mesh, playerPosition: THREE.Vector3): number {
    // Simple visibility calculation - check if object is near walls or other cover
    const nearbyObjectsCount = this.countNearbyObjects(mesh.position, 3);
    
    // More nearby objects = better cover = higher score
    return Math.min(1, 0.5 + (nearbyObjectsCount * 0.1));
  }

  private countNearbyObjects(position: THREE.Vector3, radius: number): number {
    let count = 0;
    const sphere = new THREE.Sphere(position, radius);

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData.collidable && 
          object.position.distanceTo(position) > 0.1) {
        const box = new THREE.Box3().setFromObject(object);
        if (sphere.intersectsBox(box)) {
          count++;
        }
      }
    });

    return count;
  }

  private calculateAdvancedFactors(mesh: THREE.Mesh, playerPosition: THREE.Vector3): number {
    let factor = 1.0;

    // Lighting factor - darker areas are better for hiding
    const lightingFactor = this.calculateLightingFactor(mesh.position);
    factor *= lightingFactor;

    // Angle factor - objects at certain angles are more believable
    const angleFactor = this.calculateAngleFactor(mesh, playerPosition);
    factor *= angleFactor;

    return factor;
  }

  private calculateLightingFactor(position: THREE.Vector3): number {
    // Simplified lighting calculation
    // In a real implementation, this would analyze actual lighting conditions
    const distanceFromCenter = position.length();
    return Math.max(0.6, 1 - (distanceFromCenter / 20));
  }

  private calculateAngleFactor(mesh: THREE.Mesh, playerPosition: THREE.Vector3): number {
    // Objects that can be approached from multiple angles are more believable
    const objectPosition = mesh.position;
    const directionToObject = objectPosition.clone().sub(playerPosition).normalize();
    
    // Simple angle-based scoring
    const angleScore = Math.abs(directionToObject.y) < 0.5 ? 1.0 : 0.8;
    return angleScore;
  }

  private generateCamouflageOptions(
    analyzedObjects: AnalyzedObject[], 
    playerPosition: THREE.Vector3
  ): CamouflageOption[] {
    const options: CamouflageOption[] = [];

    for (const obj of analyzedObjects) {
      if (obj.believabilityScore >= this.options.minBelievabilityScore && 
          options.length < this.options.maxCamouflageOptions) {
        
        const camouflageOption = this.createCamouflageOption(obj, playerPosition);
        options.push(camouflageOption);
      }
    }

    return options.sort((a, b) => b.believabilityScore - a.believabilityScore);
  }

  private createCamouflageOption(obj: AnalyzedObject, playerPosition: THREE.Vector3): CamouflageOption {
    const restrictions = this.generateMovementRestrictions(obj);
    const targetPosition = this.calculateOptimalCamouflagePosition(obj, playerPosition);

    return {
      objectType: obj.type,
      model: this.getModelForObjectType(obj.type),
      scale: this.calculateCamouflageScale(obj),
      believabilityScore: obj.believabilityScore,
      restrictions,
      targetObject: obj,
      targetPosition,
      color: obj.color,
      duration: this.calculateCamouflageDuration(obj.believabilityScore)
    };
  }

  private generateMovementRestrictions(obj: AnalyzedObject): any[] {
    const restrictions = [];

    // Speed restriction based on object type
    const speedRestriction = {
      type: 'speed',
      value: this.getSpeedRestrictionForType(obj.type)
    };
    restrictions.push(speedRestriction);

    // Direction restriction for certain objects
    if (['wall', 'tree'].includes(obj.type)) {
      restrictions.push({
        type: 'direction',
        value: 0.5 // Limited directional movement
      });
    }

    // Action restrictions
    if (obj.believabilityScore < 0.7) {
      restrictions.push({
        type: 'action',
        value: 0.3 // Limited actions when poorly camouflaged
      });
    }

    return restrictions;
  }

  private getSpeedRestrictionForType(objectType: string): number {
    const speedRestrictions: Record<string, number> = {
      'box': 0.3,
      'sphere': 0.4,
      'cylinder': 0.35,
      'wall': 0.1,
      'tree': 0.2,
      'rock': 0.15,
      'barrel': 0.25,
      'crate': 0.3
    };

    return speedRestrictions[objectType] || 0.3;
  }

  private calculateOptimalCamouflagePosition(obj: AnalyzedObject, playerPosition: THREE.Vector3): THREE.Vector3 {
    // Calculate the best position to camouflage near this object
    const objectPosition = obj.position.clone();
    const directionToPlayer = playerPosition.clone().sub(objectPosition).normalize();
    
    // Position slightly offset from the object
    const offset = directionToPlayer.multiplyScalar(obj.size.x * 0.6);
    return objectPosition.add(offset);
  }

  private getModelForObjectType(objectType: string): string {
    const modelMappings: Record<string, string> = {
      'box': 'camouflage_box',
      'sphere': 'camouflage_sphere',
      'cylinder': 'camouflage_cylinder',
      'wall': 'camouflage_wall',
      'tree': 'camouflage_tree',
      'rock': 'camouflage_rock',
      'barrel': 'camouflage_barrel',
      'crate': 'camouflage_crate'
    };

    return modelMappings[objectType] || 'camouflage_generic';
  }

  private calculateCamouflageScale(obj: AnalyzedObject): THREE.Vector3 {
    // Scale the camouflage to match the object size
    const playerSize = this.options.playerRadius * 2;
    const scaleX = Math.max(0.8, obj.size.x / playerSize);
    const scaleY = Math.max(0.8, obj.size.y / playerSize);
    const scaleZ = Math.max(0.8, obj.size.z / playerSize);

    return new THREE.Vector3(scaleX, scaleY, scaleZ);
  }

  private calculateCamouflageDuration(believabilityScore: number): number {
    // Higher believability = longer duration
    const baseDuration = 30000; // 30 seconds
    return baseDuration * believabilityScore;
  }

  private calculateEnvironmentScore(analyzedObjects: AnalyzedObject[]): number {
    if (analyzedObjects.length === 0) return 0;

    const averageScore = analyzedObjects.reduce((sum, obj) => sum + obj.believabilityScore, 0) / analyzedObjects.length;
    const objectCountFactor = Math.min(1, analyzedObjects.length / 5); // More objects = better environment
    
    return averageScore * objectCountFactor;
  }

  // Public utility methods
  getLastAnalysis(): EnvironmentAnalysisResult | null {
    return this.lastAnalysis;
  }

  getBestCamouflageOption(playerPosition: THREE.Vector3): CamouflageOption | null {
    const analysis = this.analyzeEnvironment(playerPosition);
    return analysis.camouflageOptions.length > 0 ? analysis.camouflageOptions[0] : null;
  }

  getCamouflageOptionsInRadius(playerPosition: THREE.Vector3, radius: number): CamouflageOption[] {
    const analysis = this.analyzeEnvironment(playerPosition);
    return analysis.camouflageOptions.filter(option => 
      option.targetPosition && 
      playerPosition.distanceTo(option.targetPosition) <= radius
    );
  }

  updateAnalysisRadius(newRadius: number): void {
    this.options.analysisRadius = newRadius;
  }

  setMinBelievabilityScore(score: number): void {
    this.options.minBelievabilityScore = Math.max(0, Math.min(1, score));
  }

  dispose(): void {
    this.lastAnalysis = null;
  }
}