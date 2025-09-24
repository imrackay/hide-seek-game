import { MapBuilder, MapObject, MapData, MapObjectType } from '../MapBuilder';
import * as THREE from 'three';

// Mock Three.js components
const mockScene = {
  add: jest.fn(),
  remove: jest.fn()
} as unknown as THREE.Scene;

const mockCamera = {
  position: new THREE.Vector3(0, 10, 10)
} as THREE.Camera;

const mockRenderer = {
  domElement: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: jest.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600
    }))
  }
} as unknown as THREE.WebGLRenderer;

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: jest.fn((key: string) => mockLocalStorage.store[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorage.store[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorage.store = {};
  })
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('MapBuilder', () => {
  let mapBuilder: MapBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mapBuilder = new MapBuilder(mockScene, mockCamera, mockRenderer, {
      enableSnapToGrid: true,
      gridSize: 1,
      enableUndo: true,
      maxUndoSteps: 10,
      enableAutoSave: false // Disable for testing
    });
  });

  afterEach(() => {
    mapBuilder.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with empty map', () => {
      const mapData = mapBuilder.getMapData();
      
      expect(mapData.objects).toHaveLength(0);
      expect(mapData.name).toBe('Untitled Map');
      expect(mapData.metadata.objectCount).toBe(0);
    });

    it('should set up grid when snap-to-grid is enabled', () => {
      expect(mockScene.add).toHaveBeenCalled();
    });

    it('should set up event listeners', () => {
      expect(mockRenderer.domElement.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(mockRenderer.domElement.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(mockRenderer.domElement.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });
  });

  describe('Object Management', () => {
    it('should add object successfully', () => {
      const position = new THREE.Vector3(5, 0, 3);
      const object = mapBuilder.addObject('wall', position, { color: '#ff0000' });
      
      expect(object.type).toBe('wall');
      expect(object.position).toEqual(new THREE.Vector3(5, 0, 3)); // Snapped to grid
      expect(object.properties.color).toBe('#ff0000');
      expect(object.mesh).toBeDefined();
      expect(mockScene.add).toHaveBeenCalledWith(object.mesh);
    });

    it('should snap position to grid', () => {
      const position = new THREE.Vector3(5.7, 2.3, 3.8);
      const object = mapBuilder.addObject('wall', position);
      
      expect(object.position).toEqual(new THREE.Vector3(6, 2, 4)); // Snapped to nearest grid
    });

    it('should remove object successfully', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const objectId = object.id;
      
      const removed = mapBuilder.removeObject(objectId);
      
      expect(removed).toBe(true);
      expect(mapBuilder.getObject(objectId)).toBeNull();
      expect(mockScene.remove).toHaveBeenCalledWith(object.mesh);
    });

    it('should return false when removing non-existent object', () => {
      const removed = mapBuilder.removeObject('non-existent');
      
      expect(removed).toBe(false);
    });

    it('should move object successfully', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const newPosition = new THREE.Vector3(5, 0, 3);
      
      const moved = mapBuilder.moveObject(object.id, newPosition);
      
      expect(moved).toBe(true);
      expect(object.position).toEqual(newPosition);
      expect(object.mesh!.position).toEqual(newPosition);
    });

    it('should not move locked object', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      object.isLocked = true;
      
      const moved = mapBuilder.moveObject(object.id, new THREE.Vector3(5, 0, 3));
      
      expect(moved).toBe(false);
      expect(object.position).toEqual(new THREE.Vector3(0, 0, 0));
    });

    it('should rotate object successfully', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const rotation = new THREE.Euler(0, Math.PI / 2, 0);
      
      const rotated = mapBuilder.rotateObject(object.id, rotation);
      
      expect(rotated).toBe(true);
      expect(object.rotation).toEqual(rotation);
      expect(object.mesh!.rotation).toEqual(rotation);
    });

    it('should scale object successfully', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const scale = new THREE.Vector3(2, 1, 0.5);
      
      const scaled = mapBuilder.scaleObject(object.id, scale);
      
      expect(scaled).toBe(true);
      expect(object.scale).toEqual(scale);
      expect(object.mesh!.scale).toEqual(scale);
    });

    it('should not scale with invalid values', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const invalidScale = new THREE.Vector3(0, 1, 1); // Zero scale
      
      const scaled = mapBuilder.scaleObject(object.id, invalidScale);
      
      expect(scaled).toBe(false);
      expect(object.scale).toEqual(new THREE.Vector3(1, 1, 1));
    });

    it('should modify object properties', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const newProperties = { color: '#00ff00', transparent: true };
      
      const modified = mapBuilder.modifyObjectProperties(object.id, newProperties);
      
      expect(modified).toBe(true);
      expect(object.properties.color).toBe('#00ff00');
      expect(object.properties.transparent).toBe(true);
    });
  });

  describe('Object Types', () => {
    const objectTypes: MapObjectType[] = [
      'wall', 'floor', 'ceiling', 'obstacle', 'decoration',
      'spawn_point', 'hiding_spot', 'light', 'trigger', 'boundary'
    ];

    objectTypes.forEach(type => {
      it(`should create ${type} object with appropriate geometry`, () => {
        const object = mapBuilder.addObject(type, new THREE.Vector3(0, 0, 0));
        
        expect(object.type).toBe(type);
        expect(object.mesh).toBeDefined();
        expect(object.mesh instanceof THREE.Mesh).toBe(true);
      });
    });
  });

  describe('Selection System', () => {
    let object1: MapObject;
    let object2: MapObject;

    beforeEach(() => {
      object1 = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      object2 = mapBuilder.addObject('floor', new THREE.Vector3(5, 0, 0));
    });

    it('should select object', () => {
      const selected = mapBuilder.selectObject(object1.id);
      
      expect(selected).toBe(true);
      expect(object1.isSelected).toBe(true);
      expect(mapBuilder.getSelectedObjects()).toHaveLength(1);
    });

    it('should add to selection when specified', () => {
      mapBuilder.selectObject(object1.id);
      mapBuilder.selectObject(object2.id, true); // Add to selection
      
      expect(mapBuilder.getSelectedObjects()).toHaveLength(2);
      expect(object1.isSelected).toBe(true);
      expect(object2.isSelected).toBe(true);
    });

    it('should replace selection when not adding', () => {
      mapBuilder.selectObject(object1.id);
      mapBuilder.selectObject(object2.id, false); // Replace selection
      
      expect(mapBuilder.getSelectedObjects()).toHaveLength(1);
      expect(object1.isSelected).toBe(false);
      expect(object2.isSelected).toBe(true);
    });

    it('should deselect object', () => {
      mapBuilder.selectObject(object1.id);
      const deselected = mapBuilder.deselectObject(object1.id);
      
      expect(deselected).toBe(true);
      expect(object1.isSelected).toBe(false);
      expect(mapBuilder.getSelectedObjects()).toHaveLength(0);
    });

    it('should clear all selection', () => {
      mapBuilder.selectObject(object1.id);
      mapBuilder.selectObject(object2.id, true);
      
      mapBuilder.clearSelection();
      
      expect(mapBuilder.getSelectedObjects()).toHaveLength(0);
      expect(object1.isSelected).toBe(false);
      expect(object2.isSelected).toBe(false);
    });
  });

  describe('Undo/Redo System', () => {
    it('should record add action and allow undo', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      
      expect(mapBuilder.canUndo()).toBe(true);
      expect(mapBuilder.canRedo()).toBe(false);
      
      const undone = mapBuilder.undo();
      
      expect(undone).toBe(true);
      expect(mapBuilder.getObject(object.id)).toBeNull();
    });

    it('should allow redo after undo', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const objectId = object.id;
      
      mapBuilder.undo(); // Remove object
      expect(mapBuilder.getObject(objectId)).toBeNull();
      
      const redone = mapBuilder.redo();
      
      expect(redone).toBe(true);
      expect(mapBuilder.getObject(objectId)).toBeDefined();
    });

    it('should record move action and allow undo', () => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const originalPosition = object.position.clone();
      
      mapBuilder.moveObject(object.id, new THREE.Vector3(5, 0, 3));
      expect(object.position).not.toEqual(originalPosition);
      
      mapBuilder.undo();
      expect(object.position).toEqual(originalPosition);
    });

    it('should limit undo history', () => {
      // Add more objects than max undo steps
      for (let i = 0; i < 15; i++) {
        mapBuilder.addObject('wall', new THREE.Vector3(i, 0, 0));
      }
      
      // Should only be able to undo up to maxUndoSteps
      let undoCount = 0;
      while (mapBuilder.canUndo()) {
        mapBuilder.undo();
        undoCount++;
      }
      
      expect(undoCount).toBeLessThanOrEqual(10); // maxUndoSteps
    });
  });

  describe('Map Data Management', () => {
    it('should update metadata when objects are added', () => {
      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      mapBuilder.addObject('spawn_point', new THREE.Vector3(5, 0, 0));
      mapBuilder.addObject('hiding_spot', new THREE.Vector3(10, 0, 0));
      
      const mapData = mapBuilder.getMapData();
      
      expect(mapData.metadata.objectCount).toBe(3);
      expect(mapData.metadata.spawnPoints).toBe(1);
      expect(mapData.metadata.hidingSpots).toBe(1);
    });

    it('should save map to localStorage', () => {
      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      
      const mapJson = mapBuilder.saveMap();
      
      expect(typeof mapJson).toBe('string');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      
      const parsedMap = JSON.parse(mapJson);
      expect(parsedMap.objects).toHaveLength(1);
    });

    it('should load map from data', () => {
      const mapData: MapData = {
        id: 'test_map',
        name: 'Test Map',
        description: 'A test map',
        author: 'Test Author',
        version: '1.0.0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          dimensions: { width: 100, height: 50, depth: 100 },
          objectCount: 1,
          spawnPoints: 0,
          hidingSpots: 0,
          estimatedPlayTime: 300,
          difficulty: 'medium',
          tags: []
        },
        objects: [{
          id: 'test_object',
          type: 'wall',
          name: 'Test Wall',
          position: new THREE.Vector3(0, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          scale: new THREE.Vector3(1, 1, 1),
          properties: { collision: true },
          isSelected: false,
          isLocked: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }],
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
            timeLimit: 600,
            boundaries: new THREE.Box3(
              new THREE.Vector3(-50, 0, -50),
              new THREE.Vector3(50, 25, 50)
            )
          }
        }
      };
      
      mapBuilder.loadMap(mapData);
      
      const loadedMap = mapBuilder.getMapData();
      expect(loadedMap.name).toBe('Test Map');
      expect(loadedMap.objects).toHaveLength(1);
      expect(mockScene.add).toHaveBeenCalled(); // Mesh should be added to scene
    });

    it('should clear map', () => {
      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      mapBuilder.addObject('floor', new THREE.Vector3(5, 0, 0));
      
      mapBuilder.clearMap();
      
      const mapData = mapBuilder.getMapData();
      expect(mapData.objects).toHaveLength(0);
      expect(mapData.name).toBe('Untitled Map');
      expect(mockScene.remove).toHaveBeenCalled();
    });
  });

  describe('Boundary Validation', () => {
    it('should reject positions outside boundaries', () => {
      const outsidePosition = new THREE.Vector3(1000, 0, 0); // Outside max map size
      
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const moved = mapBuilder.moveObject(object.id, outsidePosition);
      
      expect(moved).toBe(false);
      expect(object.position).toEqual(new THREE.Vector3(0, 0, 0));
    });

    it('should accept positions within boundaries', () => {
      const insidePosition = new THREE.Vector3(10, 5, 10);
      
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      const moved = mapBuilder.moveObject(object.id, insidePosition);
      
      expect(moved).toBe(true);
      expect(object.position).toEqual(insidePosition);
    });
  });

  describe('Event System', () => {
    it('should emit object added event', (done) => {
      mapBuilder.addEventListener('object_added', (data: any) => {
        expect(data.object.type).toBe('wall');
        done();
      });

      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
    });

    it('should emit object removed event', (done) => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      
      mapBuilder.addEventListener('object_removed', (data: any) => {
        expect(data.objectId).toBe(object.id);
        done();
      });

      mapBuilder.removeObject(object.id);
    });

    it('should emit selection events', (done) => {
      const object = mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      
      mapBuilder.addEventListener('object_selected', (data: any) => {
        expect(data.objectId).toBe(object.id);
        done();
      });

      mapBuilder.selectObject(object.id);
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      mapBuilder.addEventListener('object_added', callback);
      mapBuilder.removeEventListener('object_added', callback);
      
      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Tool Management', () => {
    it('should set and get current tool', () => {
      expect(mapBuilder.getCurrentTool()).toBe('select');
      
      mapBuilder.setTool('move');
      expect(mapBuilder.getCurrentTool()).toBe('move');
    });

    it('should emit tool changed event', (done) => {
      mapBuilder.addEventListener('tool_changed', (data: any) => {
        expect(data.tool).toBe('rotate');
        done();
      });

      mapBuilder.setTool('rotate');
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        gridSize: 2,
        enableSnapToGrid: false
      };

      mapBuilder.updateOptions(newOptions);
      const options = mapBuilder.getOptions();

      expect(options.gridSize).toBe(2);
      expect(options.enableSnapToGrid).toBe(false);
    });

    it('should return current options', () => {
      const options = mapBuilder.getOptions();
      
      expect(options.enableSnapToGrid).toBe(true);
      expect(options.gridSize).toBe(1);
      expect(options.enableUndo).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', () => {
      mapBuilder.addObject('wall', new THREE.Vector3(0, 0, 0));
      mapBuilder.addObject('floor', new THREE.Vector3(5, 0, 0));
      
      mapBuilder.dispose();
      
      expect(mockRenderer.domElement.removeEventListener).toHaveBeenCalled();
      expect(mockScene.remove).toHaveBeenCalled(); // Grid and objects removed
    });
  });
});