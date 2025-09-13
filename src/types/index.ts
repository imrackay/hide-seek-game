// Core game types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Player {
  id: string;
  username: string;
  role: 'hider' | 'seeker';
  position: Vector3;
  avatar: PlayerAvatar;
  camouflageState: CamouflageState;
}

export interface PlayerAvatar {
  model: string;
  skin: string;
  accessories: string[];
}

export interface CamouflageState {
  isActive: boolean;
  objectType?: string;
  model?: string;
  restrictions: MovementRestriction[];
}

export interface MovementRestriction {
  type: 'speed' | 'direction' | 'action';
  value: number;
}

export interface GameState {
  id: string;
  phase: 'waiting' | 'hiding' | 'seeking' | 'ended';
  players: Player[];
  timeRemaining: number;
  settings: GameSettings;
}

export interface GameSettings {
  maxPlayers: number;
  hidingTime: number;
  seekingTime: number;
  mapId: string;
}

export interface GameObject {
  id: string;
  type: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  model: string;
}

export interface GameMap {
  id: string;
  name: string;
  theme: string;
  bounds: BoundingBox;
  objects: GameObject[];
  spawnPoints: Vector3[];
  hidingSpots: HidingSpot[];
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

export interface HidingSpot {
  id: string;
  position: Vector3;
  radius: number;
  difficulty: number;
}

export interface CamouflageOption {
  objectType: string;
  model: string;
  scale: Vector3;
  believabilityScore: number;
  restrictions: MovementRestriction[];
  targetObject?: any;
  targetPosition?: Vector3;
  color?: number;
  duration?: number;
}

// User and Profile interfaces
export interface User {
  id: string;
  username: string;
  email: string;
  profile: UserProfile;
  inventory: InventoryItem[];
  statistics: PlayerStats;
  preferences: UserPreferences;
  createdAt: Date;
  lastActive: Date;
}

export interface UserProfile {
  displayName: string;
  avatar: string;
  level: number;
  experience: number;
  title?: string;
}

export interface InventoryItem {
  id: string;
  type: 'skin' | 'accessory' | 'emote' | 'title';
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  equipped: boolean;
  acquiredAt: Date;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalHideTime: number;
  totalSeekTime: number;
  successfulHides: number;
  successfulFinds: number;
  averageHideTime: number;
  bestHidingSpot?: string;
}

export interface UserPreferences {
  voiceChatEnabled: boolean;
  textChatEnabled: boolean;
  arModeEnabled: boolean;
  soundEffectsVolume: number;
  musicVolume: number;
  language: string;
  autoMatchmaking: boolean;
}

// Game Session interface
export interface GameSession {
  id: string;
  roomCode: string;
  mapId: string;
  players: Player[];
  gameState: GameState;
  settings: GameSettings;
  startTime: Date;
  duration: number;
  events: GameEvent[];
  createdBy: string;
  isPrivate: boolean;
  maxPlayers: number;
}

export interface GameEvent {
  id: string;
  type: 'player_joined' | 'player_left' | 'game_started' | 'player_found' | 'camouflage_activated' | 'game_ended';
  playerId?: string;
  timestamp: Date;
  data?: Record<string, any>;
}

// Map System Types
export interface MapData {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  theme: string;
  ground: GroundData;
  environment: EnvironmentData;
  objects: MapObject[];
  spawnPoints: SpawnPoint[];
  bounds: BoundingBox;
  metadata: MapMetadata;
}

export interface GroundData {
  width: number;
  height: number;
  y: number;
  color: number;
  texture?: string;
}

export interface EnvironmentData {
  skyColor: number;
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: Vector3;
  fogEnabled: boolean;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
}

export interface MapObject {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'wall' | 'custom';
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  color: number;
  texture?: string;
  model?: string;
  
  // Object properties
  collidable: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  canCamouflage: boolean;
  
  // Size properties (type-specific)
  size?: { width: number; height: number; depth: number };
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  
  // Metadata
  name?: string;
  tags?: string[];
}

export interface SpawnPoint {
  id: string;
  position: Vector3;
  rotation?: Vector3;
  type: 'hider' | 'seeker' | 'any';
  name?: string;
  priority: number;
}

export interface MapMetadata {
  maxPlayers: number;
  recommendedPlayers: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedGameTime: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  playCount: number;
  rating: number;
  isPublic: boolean;
}
