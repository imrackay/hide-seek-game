import { MapData } from '../types';

export const basicTestMap: MapData = {
  id: 'basic-test-map',
  name: 'Basic Test Map',
  description: 'A simple test map for development and testing',
  version: '1.0.0',
  author: 'System',
  theme: 'playground',
  
  ground: {
    width: 50,
    height: 50,
    y: 0,
    color: 0x90EE90 // Light green
  },
  
  environment: {
    skyColor: 0x87CEEB, // Sky blue
    ambientColor: 0x404040,
    ambientIntensity: 0.4,
    sunColor: 0xffffff,
    sunIntensity: 0.8,
    sunPosition: { x: 10, y: 20, z: 10 },
    fogEnabled: false
  },
  
  objects: [
    // Central building
    {
      id: 'central-building',
      type: 'box',
      position: { x: 0, y: 2, z: 0 },
      size: { width: 8, height: 4, depth: 6 },
      color: 0x8B4513, // Brown
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Central Building'
    },
    
    // Corner boxes
    {
      id: 'corner-box-1',
      type: 'box',
      position: { x: 15, y: 1, z: 15 },
      size: { width: 3, height: 2, depth: 3 },
      color: 0xFF6347, // Tomato
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Corner Box 1'
    },
    
    {
      id: 'corner-box-2',
      type: 'box',
      position: { x: -15, y: 1, z: 15 },
      size: { width: 3, height: 2, depth: 3 },
      color: 0xFF6347,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Corner Box 2'
    },
    
    {
      id: 'corner-box-3',
      type: 'box',
      position: { x: 15, y: 1, z: -15 },
      size: { width: 3, height: 2, depth: 3 },
      color: 0xFF6347,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Corner Box 3'
    },
    
    {
      id: 'corner-box-4',
      type: 'box',
      position: { x: -15, y: 1, z: -15 },
      size: { width: 3, height: 2, depth: 3 },
      color: 0xFF6347,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Corner Box 4'
    },
    
    // Cylindrical pillars
    {
      id: 'pillar-1',
      type: 'cylinder',
      position: { x: 8, y: 2.5, z: 0 },
      radius: 1,
      height: 5,
      color: 0x32CD32, // Lime green
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Pillar 1'
    },
    
    {
      id: 'pillar-2',
      type: 'cylinder',
      position: { x: -8, y: 2.5, z: 0 },
      radius: 1,
      height: 5,
      color: 0x32CD32,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Pillar 2'
    },
    
    // Spherical objects
    {
      id: 'sphere-1',
      type: 'sphere',
      position: { x: 0, y: 1, z: 12 },
      radius: 1.5,
      color: 0x9370DB, // Medium purple
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Purple Sphere'
    },
    
    {
      id: 'sphere-2',
      type: 'sphere',
      position: { x: 0, y: 1, z: -12 },
      radius: 1.5,
      color: 0x9370DB,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Purple Sphere 2'
    },
    
    // Walls
    {
      id: 'wall-north',
      type: 'wall',
      position: { x: 0, y: 1.5, z: 20 },
      size: { width: 15, height: 3, depth: 0.5 },
      color: 0x696969, // Dim gray
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'North Wall'
    },
    
    {
      id: 'wall-south',
      type: 'wall',
      position: { x: 0, y: 1.5, z: -20 },
      size: { width: 15, height: 3, depth: 0.5 },
      color: 0x696969,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'South Wall'
    }
  ],
  
  spawnPoints: [
    // Hider spawn points
    {
      id: 'hider-spawn-1',
      position: { x: -18, y: 0.5, z: -18 },
      type: 'hider',
      priority: 1,
      name: 'Hider Spawn 1'
    },
    {
      id: 'hider-spawn-2',
      position: { x: 18, y: 0.5, z: -18 },
      type: 'hider',
      priority: 1,
      name: 'Hider Spawn 2'
    },
    {
      id: 'hider-spawn-3',
      position: { x: -18, y: 0.5, z: 18 },
      type: 'hider',
      priority: 1,
      name: 'Hider Spawn 3'
    },
    {
      id: 'hider-spawn-4',
      position: { x: 18, y: 0.5, z: 18 },
      type: 'hider',
      priority: 1,
      name: 'Hider Spawn 4'
    },
    
    // Seeker spawn points
    {
      id: 'seeker-spawn-1',
      position: { x: 0, y: 0.5, z: -22 },
      type: 'seeker',
      priority: 1,
      name: 'Seeker Spawn 1'
    },
    {
      id: 'seeker-spawn-2',
      position: { x: 0, y: 0.5, z: 22 },
      type: 'seeker',
      priority: 1,
      name: 'Seeker Spawn 2'
    },
    
    // Any type spawn points
    {
      id: 'any-spawn-1',
      position: { x: -10, y: 0.5, z: 0 },
      type: 'any',
      priority: 2,
      name: 'Any Spawn 1'
    },
    {
      id: 'any-spawn-2',
      position: { x: 10, y: 0.5, z: 0 },
      type: 'any',
      priority: 2,
      name: 'Any Spawn 2'
    }
  ],
  
  bounds: {
    min: { x: -25, y: -1, z: -25 },
    max: { x: 25, y: 10, z: 25 }
  },
  
  metadata: {
    maxPlayers: 10,
    recommendedPlayers: 6,
    difficulty: 'easy',
    estimatedGameTime: 300, // 5 minutes
    tags: ['test', 'basic', 'playground'],
    createdAt: new Date(),
    updatedAt: new Date(),
    playCount: 0,
    rating: 0,
    isPublic: true
  }
};

export const complexTestMap: MapData = {
  id: 'complex-test-map',
  name: 'Complex Test Map',
  description: 'A more complex map with various hiding spots and obstacles',
  version: '1.0.0',
  author: 'System',
  theme: 'urban',
  
  ground: {
    width: 80,
    height: 80,
    y: 0,
    color: 0x808080 // Gray
  },
  
  environment: {
    skyColor: 0x87CEEB,
    ambientColor: 0x404040,
    ambientIntensity: 0.3,
    sunColor: 0xffffff,
    sunIntensity: 1.0,
    sunPosition: { x: 20, y: 30, z: 15 },
    fogEnabled: true,
    fogColor: 0xcccccc,
    fogNear: 20,
    fogFar: 60
  },
  
  objects: [
    // Large central structure
    {
      id: 'main-building',
      type: 'box',
      position: { x: 0, y: 3, z: 0 },
      size: { width: 12, height: 6, depth: 8 },
      color: 0x654321,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: 'Main Building'
    },
    
    // Multiple hiding spots
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `hiding-box-${i + 1}`,
      type: 'box' as const,
      position: {
        x: (Math.random() - 0.5) * 60,
        y: 1,
        z: (Math.random() - 0.5) * 60
      },
      size: { width: 2 + Math.random() * 2, height: 1 + Math.random() * 2, depth: 2 + Math.random() * 2 },
      color: Math.floor(Math.random() * 0xffffff),
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: true,
      name: `Hiding Box ${i + 1}`
    })),
    
    // Perimeter walls
    {
      id: 'wall-north-complex',
      type: 'wall',
      position: { x: 0, y: 2, z: 35 },
      size: { width: 70, height: 4, depth: 1 },
      color: 0x696969,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'North Wall'
    },
    {
      id: 'wall-south-complex',
      type: 'wall',
      position: { x: 0, y: 2, z: -35 },
      size: { width: 70, height: 4, depth: 1 },
      color: 0x696969,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'South Wall'
    },
    {
      id: 'wall-east-complex',
      type: 'wall',
      position: { x: 35, y: 2, z: 0 },
      size: { width: 1, height: 4, depth: 70 },
      color: 0x696969,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'East Wall'
    },
    {
      id: 'wall-west-complex',
      type: 'wall',
      position: { x: -35, y: 2, z: 0 },
      size: { width: 1, height: 4, depth: 70 },
      color: 0x696969,
      collidable: true,
      castShadow: true,
      receiveShadow: true,
      canCamouflage: false,
      name: 'West Wall'
    }
  ],
  
  spawnPoints: [
    // More spawn points for complex map
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `hider-spawn-${i + 1}`,
      position: {
        x: Math.cos((i / 8) * Math.PI * 2) * 25,
        y: 0.5,
        z: Math.sin((i / 8) * Math.PI * 2) * 25
      },
      type: 'hider' as const,
      priority: 1,
      name: `Hider Spawn ${i + 1}`
    })),
    
    {
      id: 'seeker-spawn-center',
      position: { x: 0, y: 0.5, z: 0 },
      type: 'seeker',
      priority: 1,
      name: 'Seeker Spawn Center'
    }
  ],
  
  bounds: {
    min: { x: -40, y: -1, z: -40 },
    max: { x: 40, y: 15, z: 40 }
  },
  
  metadata: {
    maxPlayers: 16,
    recommendedPlayers: 10,
    difficulty: 'medium',
    estimatedGameTime: 600, // 10 minutes
    tags: ['complex', 'urban', 'challenging'],
    createdAt: new Date(),
    updatedAt: new Date(),
    playCount: 0,
    rating: 0,
    isPublic: true
  }
};

export const sampleMaps = {
  basic: basicTestMap,
  complex: complexTestMap
};