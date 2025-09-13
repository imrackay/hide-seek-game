import * as THREE from 'three';
import { Vector3, Player } from '@/types';

export class PlayerAvatar {
  private group: THREE.Group;
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private nameTag: THREE.Sprite;
  private playerId: string;
  private username: string;
  private role: 'hider' | 'seeker';

  constructor(player: Player) {
    this.playerId = player.id;
    this.username = player.username;
    this.role = player.role;
    this.group = new THREE.Group();
    
    this.createAvatar();
    this.createNameTag();
    this.setPosition(player.position);
  }

  private createAvatar(): void {
    // Create body
    const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
      color: this.role === 'seeker' ? 0xff4444 : 0x4444ff 
    });
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.body.position.y = 1;
    this.body.castShadow = true;
    this.body.receiveShadow = true;

    // Create head
    const headGeometry = new THREE.SphereGeometry(0.3, 8, 6);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    this.head = new THREE.Mesh(headGeometry, headMaterial);
    this.head.position.y = 2;
    this.head.castShadow = true;
    this.head.receiveShadow = true;

    this.group.add(this.body);
    this.group.add(this.head);
  }

  private createNameTag(): void {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText(this.username, canvas.width / 2, canvas.height / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    this.nameTag = new THREE.Sprite(material);
    this.nameTag.position.y = 3;
    this.nameTag.scale.set(2, 0.5, 1);

    this.group.add(this.nameTag);
  }

  public setPosition(position: Vector3): void {
    this.group.position.set(position.x, position.y, position.z);
  }

  public getPosition(): Vector3 {
    return {
      x: this.group.position.x,
      y: this.group.position.y,
      z: this.group.position.z
    };
  }

  public setRotation(y: number): void {
    this.group.rotation.y = y;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getRole(): 'hider' | 'seeker' {
    return this.role;
  }

  public setRole(role: 'hider' | 'seeker'): void {
    this.role = role;
    const color = role === 'seeker' ? 0xff4444 : 0x4444ff;
    (this.body.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  public setCamouflaged(isActive: boolean, objectType?: string): void {
    if (isActive && objectType) {
      // Hide the normal avatar
      this.body.visible = false;
      this.head.visible = false;
      this.nameTag.visible = false;

      // Create camouflage object based on type
      this.createCamouflageObject(objectType);
    } else {
      // Show normal avatar
      this.body.visible = true;
      this.head.visible = true;
      this.nameTag.visible = true;

      // Remove camouflage object
      this.removeCamouflageObject();
    }
  }

  private createCamouflageObject(objectType: string): void {
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    switch (objectType) {
      case 'box':
        geometry = new THREE.BoxGeometry(2, 2, 2);
        material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(1, 1, 3);
        material = new THREE.MeshLambertMaterial({ color: 0x654321 });
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(1.5);
        material = new THREE.MeshLambertMaterial({ color: 0x696969 });
        break;
      default:
        geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        material = new THREE.MeshLambertMaterial({ color: 0x888888 });
    }

    const camouflageObject = new THREE.Mesh(geometry, material);
    camouflageObject.name = 'camouflage';
    camouflageObject.position.y = 1;
    camouflageObject.castShadow = true;
    camouflageObject.receiveShadow = true;
    this.group.add(camouflageObject);
  }

  private removeCamouflageObject(): void {
    const camouflageObject = this.group.getObjectByName('camouflage');
    if (camouflageObject) {
      this.group.remove(camouflageObject);
    }
  }

  public dispose(): void {
    this.group.clear();
  }
}