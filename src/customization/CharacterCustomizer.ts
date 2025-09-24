import * as THREE from 'three';
import { 
  CosmeticItem, 
  CharacterAppearance, 
  ItemType, 
  CustomizationPreset,
  ItemPreview 
} from './CosmeticItem';
import { CosmeticItemManager } from './CosmeticItem';
import { InventoryManager } from './InventoryManager';

export interface CustomizationOptions {
  enablePreview?: boolean;
  enablePresets?: boolean;
  maxPresets?: number;
  previewQuality?: 'low' | 'medium' | 'high';
  enableRealTimePreview?: boolean;
  cachePreviewModels?: boolean;
}

export interface PreviewConfiguration {
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  lighting: {
    ambient: number;
    directional: {
      intensity: number;
      position: THREE.Vector3;
    };
  };
  background: string | THREE.Color;
  animations?: string[];
}

export interface CustomizationSession {
  playerId: string;
  originalAppearance: CharacterAppearance;
  currentAppearance: CharacterAppearance;
  previewItems: Map<ItemType, string>;
  isActive: boolean;
  startedAt: number;
  lastUpdated: number;
}

export class CharacterCustomizer {
  private itemManager: CosmeticItemManager;
  private inventoryManager: InventoryManager;
  private options: Required<CustomizationOptions>;
  private sessions: Map<string, CustomizationSession> = new Map();
  private presets: Map<string, CustomizationPreset[]> = new Map();
  private previewCache: Map<string, ItemPreview> = new Map();
  private customizerCallbacks: Map<string, Function[]> = new Map();
  
  // Three.js preview components
  private previewScene: THREE.Scene | null = null;
  private previewCamera: THREE.PerspectiveCamera | null = null;
  private previewRenderer: THREE.WebGLRenderer | null = null;
  private previewModels: Map<string, THREE.Object3D> = new Map();

  constructor(
    itemManager: CosmeticItemManager,
    inventoryManager: InventoryManager,
    options: CustomizationOptions = {}
  ) {
    this.itemManager = itemManager;
    this.inventoryManager = inventoryManager;
    
    this.options = {
      enablePreview: options.enablePreview !== false,
      enablePresets: options.enablePresets !== false,
      maxPresets: options.maxPresets || 10,
      previewQuality: options.previewQuality || 'medium',
      enableRealTimePreview: options.enableRealTimePreview !== false,
      cachePreviewModels: options.cachePreviewModels !== false
    };

    if (this.options.enablePreview) {
      this.initializePreviewSystem();
    }
  }

  // Session management
  async startCustomizationSession(playerId: string): Promise<{ success: boolean; session?: CustomizationSession; error?: string }> {
    try {
      // Check if session already exists
      if (this.sessions.has(playerId)) {
        return { success: false, error: 'Customization session already active' };
      }

      // Get current appearance
      const currentAppearance = this.inventoryManager.getPlayerAppearance(playerId);
      if (!currentAppearance) {
        return { success: false, error: 'Player appearance not found' };
      }

      // Create session
      const session: CustomizationSession = {
        playerId,
        originalAppearance: JSON.parse(JSON.stringify(currentAppearance)), // Deep copy
        currentAppearance: JSON.parse(JSON.stringify(currentAppearance)),
        previewItems: new Map(),
        isActive: true,
        startedAt: Date.now(),
        lastUpdated: Date.now()
      };

      this.sessions.set(playerId, session);
      
      this.emitCustomizerEvent('session_started', { playerId, session });
      return { success: true, session };
    } catch (error) {
      console.error('Failed to start customization session:', error);
      return { success: false, error: 'Failed to start customization session' };
    }
  }

  async endCustomizationSession(
    playerId: string, 
    saveChanges: boolean = true
  ): Promise<{ success: boolean; finalAppearance?: CharacterAppearance; error?: string }> {
    const session = this.sessions.get(playerId);
    if (!session) {
      return { success: false, error: 'No active customization session' };
    }

    try {
      let finalAppearance: CharacterAppearance;

      if (saveChanges) {
        // Apply all preview items to inventory
        for (const [itemType, itemId] of session.previewItems) {
          const hasItem = this.inventoryManager.hasItem(playerId, itemId);
          if (hasItem) {
            await this.inventoryManager.equipItem(playerId, itemId, itemType);
          }
        }
        
        finalAppearance = session.currentAppearance;
      } else {
        // Revert to original appearance
        finalAppearance = session.originalAppearance;
      }

      this.sessions.delete(playerId);
      
      this.emitCustomizerEvent('session_ended', { 
        playerId, 
        saveChanges, 
        finalAppearance 
      });

      return { success: true, finalAppearance };
    } catch (error) {
      console.error('Failed to end customization session:', error);
      return { success: false, error: 'Failed to end customization session' };
    }
  }

  // Item preview
  async previewItem(
    playerId: string, 
    itemId: string, 
    itemType: ItemType
  ): Promise<{ success: boolean; previewAppearance?: CharacterAppearance; error?: string }> {
    const session = this.sessions.get(playerId);
    if (!session) {
      return { success: false, error: 'No active customization session' };
    }

    const item = this.itemManager.getItem(itemId);
    if (!item) {
      return { success: false, error: 'Item not found' };
    }

    try {
      // Update preview items
      session.previewItems.set(itemType, itemId);
      
      // Update current appearance
      session.currentAppearance.equippedItems[itemType] = {
        itemId,
        customizations: []
      };
      
      session.lastUpdated = Date.now();

      // Generate 3D preview if enabled
      if (this.options.enablePreview && this.options.enableRealTimePreview) {
        await this.generateItemPreview(itemId);
      }

      this.emitCustomizerEvent('item_previewed', { 
        playerId, 
        itemId, 
        itemType, 
        previewAppearance: session.currentAppearance 
      });

      return { success: true, previewAppearance: session.currentAppearance };
    } catch (error) {
      console.error('Failed to preview item:', error);
      return { success: false, error: 'Failed to preview item' };
    }
  }

  async removePreviewItem(
    playerId: string, 
    itemType: ItemType
  ): Promise<{ success: boolean; previewAppearance?: CharacterAppearance; error?: string }> {
    const session = this.sessions.get(playerId);
    if (!session) {
      return { success: false, error: 'No active customization session' };
    }

    // Remove from preview
    session.previewItems.delete(itemType);
    
    // Revert to original item for this slot
    const originalItem = session.originalAppearance.equippedItems[itemType];
    if (originalItem) {
      session.currentAppearance.equippedItems[itemType] = originalItem;
    } else {
      delete session.currentAppearance.equippedItems[itemType];
    }
    
    session.lastUpdated = Date.now();

    this.emitCustomizerEvent('preview_item_removed', { 
      playerId, 
      itemType, 
      previewAppearance: session.currentAppearance 
    });

    return { success: true, previewAppearance: session.currentAppearance };
  }

  // 3D Preview system
  private async initializePreviewSystem(): Promise<void> {
    if (typeof window === 'undefined') return; // Skip on server-side

    try {
      // Create preview scene
      this.previewScene = new THREE.Scene();
      
      // Create camera
      this.previewCamera = new THREE.PerspectiveCamera(
        75, 
        1, // Will be updated based on container
        0.1, 
        1000
      );
      
      // Create renderer
      this.previewRenderer = new THREE.WebGLRenderer({ 
        antialias: this.options.previewQuality !== 'low',
        alpha: true 
      });
      
      // Set up lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      this.previewScene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      this.previewScene.add(directionalLight);
      
      // Set camera position
      this.previewCamera.position.set(0, 1.6, 3);
      this.previewCamera.lookAt(0, 1, 0);
      
    } catch (error) {
      console.error('Failed to initialize preview system:', error);
    }
  }

  async generateItemPreview(itemId: string): Promise<ItemPreview | null> {
    if (!this.options.enablePreview || !this.previewScene || !this.previewRenderer) {
      return null;
    }

    // Check cache first
    if (this.options.cachePreviewModels && this.previewCache.has(itemId)) {
      return this.previewCache.get(itemId)!;
    }

    const item = this.itemManager.getItem(itemId);
    if (!item) return null;

    try {
      // Create preview
      const preview: ItemPreview = {
        itemId,
        previewType: '3d_model',
        previewData: '', // Would contain actual 3D model data
        isLoaded: false
      };

      // Simulate loading 3D model (in real implementation, load from item.modelUrl)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Generate thumbnail
      if (this.previewRenderer && this.previewCamera) {
        this.previewRenderer.setSize(256, 256);
        this.previewRenderer.render(this.previewScene, this.previewCamera);
        
        preview.thumbnailUrl = this.previewRenderer.domElement.toDataURL();
        preview.isLoaded = true;
      }

      // Cache if enabled
      if (this.options.cachePreviewModels) {
        this.previewCache.set(itemId, preview);
      }

      return preview;
    } catch (error) {
      console.error('Failed to generate item preview:', error);
      return null;
    }
  }

  getItemPreview(itemId: string): ItemPreview | null {
    return this.previewCache.get(itemId) || null;
  }

  // Preset management
  async savePreset(
    playerId: string, 
    name: string, 
    description?: string,
    isPublic: boolean = false
  ): Promise<{ success: boolean; preset?: CustomizationPreset; error?: string }> {
    if (!this.options.enablePresets) {
      return { success: false, error: 'Presets are disabled' };
    }

    const session = this.sessions.get(playerId);
    if (!session) {
      return { success: false, error: 'No active customization session' };
    }

    // Check preset limit
    const playerPresets = this.presets.get(playerId) || [];
    if (playerPresets.length >= this.options.maxPresets) {
      return { success: false, error: `Maximum ${this.options.maxPresets} presets allowed` };
    }

    // Check for duplicate names
    if (playerPresets.some(p => p.name === name)) {
      return { success: false, error: 'Preset name already exists' };
    }

    try {
      const preset: CustomizationPreset = {
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name,
        description,
        playerId,
        appearance: JSON.parse(JSON.stringify(session.currentAppearance)),
        isPublic,
        likes: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      playerPresets.push(preset);
      this.presets.set(playerId, playerPresets);
      
      // Save to storage
      await this.savePresetsToStorage(playerId);

      this.emitCustomizerEvent('preset_saved', { playerId, preset });
      return { success: true, preset };
    } catch (error) {
      console.error('Failed to save preset:', error);
      return { success: false, error: 'Failed to save preset' };
    }
  }

  async loadPreset(
    playerId: string, 
    presetId: string
  ): Promise<{ success: boolean; previewAppearance?: CharacterAppearance; error?: string }> {
    const session = this.sessions.get(playerId);
    if (!session) {
      return { success: false, error: 'No active customization session' };
    }

    const playerPresets = this.presets.get(playerId) || [];
    const preset = playerPresets.find(p => p.id === presetId);
    
    if (!preset) {
      return { success: false, error: 'Preset not found' };
    }

    try {
      // Apply preset to current session
      session.currentAppearance = JSON.parse(JSON.stringify(preset.appearance));
      session.previewItems.clear();
      
      // Update preview items map
      for (const [itemType, itemData] of Object.entries(preset.appearance.equippedItems)) {
        if (itemData) {
          session.previewItems.set(itemType as ItemType, itemData.itemId);
        }
      }
      
      session.lastUpdated = Date.now();

      this.emitCustomizerEvent('preset_loaded', { 
        playerId, 
        presetId, 
        previewAppearance: session.currentAppearance 
      });

      return { success: true, previewAppearance: session.currentAppearance };
    } catch (error) {
      console.error('Failed to load preset:', error);
      return { success: false, error: 'Failed to load preset' };
    }
  }

  async deletePreset(playerId: string, presetId: string): Promise<{ success: boolean; error?: string }> {
    const playerPresets = this.presets.get(playerId) || [];
    const presetIndex = playerPresets.findIndex(p => p.id === presetId);
    
    if (presetIndex === -1) {
      return { success: false, error: 'Preset not found' };
    }

    try {
      playerPresets.splice(presetIndex, 1);
      this.presets.set(playerId, playerPresets);
      
      // Save to storage
      await this.savePresetsToStorage(playerId);

      this.emitCustomizerEvent('preset_deleted', { playerId, presetId });
      return { success: true };
    } catch (error) {
      console.error('Failed to delete preset:', error);
      return { success: false, error: 'Failed to delete preset' };
    }
  }

  getPlayerPresets(playerId: string): CustomizationPreset[] {
    return this.presets.get(playerId) || [];
  }

  // Utility methods
  getAvailableItems(playerId: string, itemType?: ItemType): CosmeticItem[] {
    const ownedItems = this.inventoryManager.getOwnedItems(playerId);
    const ownedItemIds = new Set(ownedItems.map(item => item.itemId));
    
    let availableItems = this.itemManager.getAllItems().filter(item => 
      ownedItemIds.has(item.id)
    );

    if (itemType) {
      availableItems = availableItems.filter(item => item.type === itemType);
    }

    return availableItems;
  }

  getCurrentSession(playerId: string): CustomizationSession | null {
    return this.sessions.get(playerId) || null;
  }

  isSessionActive(playerId: string): boolean {
    return this.sessions.has(playerId);
  }

  // Storage management
  private async savePresetsToStorage(playerId: string): Promise<void> {
    try {
      const presets = this.presets.get(playerId) || [];
      localStorage.setItem(`hideSeekPresets_${playerId}`, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save presets to storage:', error);
      throw error;
    }
  }

  private loadPresetsFromStorage(playerId: string): CustomizationPreset[] {
    try {
      const stored = localStorage.getItem(`hideSeekPresets_${playerId}`);
      if (stored) {
        const presets = JSON.parse(stored) as CustomizationPreset[];
        return Array.isArray(presets) ? presets : [];
      }
    } catch (error) {
      console.error('Failed to load presets from storage:', error);
    }
    
    return [];
  }

  // Configuration and preview settings
  updatePreviewConfiguration(config: Partial<PreviewConfiguration>): void {
    if (!this.previewCamera || !this.previewScene) return;

    if (config.cameraPosition) {
      this.previewCamera.position.copy(config.cameraPosition);
    }
    
    if (config.cameraTarget) {
      this.previewCamera.lookAt(config.cameraTarget);
    }
    
    if (config.lighting) {
      // Update lighting (would need to store light references)
    }
    
    if (config.background) {
      this.previewScene.background = typeof config.background === 'string' 
        ? new THREE.Color(config.background) 
        : config.background;
    }
  }

  getPreviewRenderer(): THREE.WebGLRenderer | null {
    return this.previewRenderer;
  }

  // Statistics
  getCustomizationStatistics(playerId: string): {
    totalSessions: number;
    totalPresets: number;
    mostUsedItems: { itemId: string; count: number }[];
    averageSessionDuration: number;
  } {
    // In a real implementation, this would track usage statistics
    const presets = this.getPlayerPresets(playerId);
    
    return {
      totalSessions: 0, // Would track from usage history
      totalPresets: presets.length,
      mostUsedItems: [], // Would analyze from session history
      averageSessionDuration: 0 // Would calculate from session data
    };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.customizerCallbacks.has(event)) {
      this.customizerCallbacks.set(event, []);
    }
    this.customizerCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.customizerCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitCustomizerEvent(event: string, data: any): void {
    const callbacks = this.customizerCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Customizer event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<CustomizationOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    if (this.options.enablePreview && !this.previewScene) {
      this.initializePreviewSystem();
    }
  }

  getOptions(): CustomizationOptions {
    return { ...this.options };
  }

  // Cleanup
  async dispose(): Promise<void> {
    // End all active sessions
    for (const playerId of this.sessions.keys()) {
      await this.endCustomizationSession(playerId, false);
    }

    // Save all presets
    for (const playerId of this.presets.keys()) {
      try {
        await this.savePresetsToStorage(playerId);
      } catch (error) {
        console.error(`Failed to save presets for player ${playerId}:`, error);
      }
    }

    // Dispose Three.js resources
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }

    // Clear data
    this.sessions.clear();
    this.presets.clear();
    this.previewCache.clear();
    this.previewModels.clear();
    this.customizerCallbacks.clear();
    this.previewScene = null;
    this.previewCamera = null;
  }
}