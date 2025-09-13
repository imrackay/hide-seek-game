import * as THREE from 'three';
import { GameScene } from './Scene';
import { PlayerAvatar } from './PlayerAvatar';
import { Player, Vector3 } from '@/types';

export class GameEngine {
  private scene: GameScene;
  private players: Map<string, PlayerAvatar>;
  private animationId: number | null = null;
  private isRunning: boolean = false;
  private container: HTMLElement | null = null;

  constructor() {
    this.scene = new GameScene();
    this.players = new Map();
  }

  public initialize(container: HTMLElement): void {
    this.container = container;
    this.scene.initialize(container);
    this.setupEventListeners();
    this.isRunning = true;
    this.startRenderLoop();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private handleResize(): void {
    if (this.container) {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.scene.resize(width, height);
    }
  }

  private startRenderLoop(): void {
    const render = () => {
      if (!this.isRunning) return;
      
      this.scene.render();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  public addPlayer(player: Player): void {
    if (this.players.has(player.id)) {
      console.warn(`Player ${player.id} already exists`);
      return;
    }

    const avatar = new PlayerAvatar(player);
    this.players.set(player.id, avatar);
    this.scene.getScene().add(avatar.getGroup());
  }

  public removePlayer(playerId: string): void {
    const avatar = this.players.get(playerId);
    if (avatar) {
      this.scene.getScene().remove(avatar.getGroup());
      avatar.dispose();
      this.players.delete(playerId);
    }
  }

  public updatePlayerPosition(playerId: string, position: Vector3): void {
    const avatar = this.players.get(playerId);
    if (avatar) {
      avatar.setPosition(position);
    }
  }

  public updatePlayerRotation(playerId: string, rotation: number): void {
    const avatar = this.players.get(playerId);
    if (avatar) {
      avatar.setRotation(rotation);
    }
  }

  public setPlayerCamouflage(playerId: string, isActive: boolean, objectType?: string): void {
    const avatar = this.players.get(playerId);
    if (avatar) {
      avatar.setCamouflaged(isActive, objectType);
    }
  }

  public getPlayerPosition(playerId: string): Vector3 | null {
    const avatar = this.players.get(playerId);
    return avatar ? avatar.getPosition() : null;
  }

  public getAllPlayers(): Player[] {
    const players: Player[] = [];
    this.players.forEach((avatar) => {
      const position = avatar.getPosition();
      players.push({
        id: avatar.getPlayerId(),
        username: avatar.getPlayerId(), // This should be updated with actual username
        role: avatar.getRole(),
        position,
        avatar: {
          model: 'default',
          skin: 'default',
          accessories: []
        },
        camouflageState: {
          isActive: false,
          objectType: '',
          model: '',
          restrictions: []
        }
      });
    });
    return players;
  }

  public setCameraPosition(position: Vector3): void {
    const camera = this.scene.getCamera();
    camera.position.set(position.x, position.y, position.z);
  }

  public setCameraTarget(target: Vector3): void {
    const camera = this.scene.getCamera();
    camera.lookAt(target.x, target.y, target.z);
  }

  public getScene(): THREE.Scene {
    return this.scene.getScene();
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.scene.getCamera();
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.scene.getRenderer();
  }

  public isInitialized(): boolean {
    return this.isRunning;
  }

  public dispose(): void {
    this.isRunning = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Dispose all players
    this.players.forEach((avatar) => {
      avatar.dispose();
    });
    this.players.clear();

    // Dispose scene
    this.scene.dispose();

    // Remove event listeners
    window.removeEventListener('resize', this.handleResize.bind(this));
  }
}