export interface CosmeticItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  type: ItemType;
  price: number;
  currency: 'coins' | 'gems' | 'premium';
  unlockRequirements?: UnlockRequirement[];
  previewUrl?: string;
  modelUrl?: string;
  textureUrl?: string;
  animationUrl?: string;
  tags: string[];
  isLimited?: boolean;
  limitedUntil?: number;
  createdAt: number;
  updatedAt: number;
  metadata: ItemMetadata;
}

export type ItemCategory = 
  | 'skin' 
  | 'hat' 
  | 'accessory' 
  | 'clothing' 
  | 'emote' 
  | 'effect' 
  | 'voice' 
  | 'trail';

export type ItemRarity = 
  | 'common' 
  | 'uncommon' 
  | 'rare' 
  | 'epic' 
  | 'legendary' 
  | 'mythic';

export type ItemType = 
  | 'head' 
  | 'body' 
  | 'legs' 
  | 'feet' 
  | 'hands' 
  | 'back' 
  | 'face' 
  | 'full_body' 
  | 'emote' 
  | 'effect';

export interface UnlockRequirement {
  type: 'level' | 'achievement' | 'playtime' | 'wins' | 'event' | 'purchase';
  value: number | string;
  description: string;
}

export interface ItemMetadata {
  author?: string;
  version: string;
  compatibility: string[];
  fileSize?: number;
  downloadCount?: number;
  rating?: number;
  reviews?: number;
  seasonal?: boolean;
  event?: string;
  collection?: string;
}

export interface PlayerInventory {
  playerId: string;
  items: Map<string, InventoryItem>;
  equippedItems: Map<ItemType, string>;
  currencies: {
    coins: number;
    gems: number;
    premiumCredits: number;
  };
  lastUpdated: number;
}

export interface InventoryItem {
  itemId: string;
  quantity: number;
  acquiredAt: number;
  source: 'purchase' | 'reward' | 'gift' | 'event' | 'achievement';
  isEquipped: boolean;
  customizations?: ItemCustomization[];
}

export interface ItemCustomization {
  property: string;
  value: any;
  appliedAt: number;
}

export interface CharacterAppearance {
  playerId: string;
  baseModel: string;
  equippedItems: {
    [key in ItemType]?: {
      itemId: string;
      customizations?: ItemCustomization[];
    };
  };
  colorScheme?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  lastUpdated: number;
}

export interface ItemPreview {
  itemId: string;
  previewType: 'image' | '3d_model' | 'animation';
  previewData: string | ArrayBuffer;
  thumbnailUrl?: string;
  isLoaded: boolean;
}

export interface CustomizationPreset {
  id: string;
  name: string;
  description?: string;
  playerId: string;
  appearance: CharacterAppearance;
  isPublic: boolean;
  likes: number;
  createdAt: number;
  updatedAt: number;
}

export class CosmeticItemManager {
  private items: Map<string, CosmeticItem> = new Map();
  private itemsByCategory: Map<ItemCategory, CosmeticItem[]> = new Map();
  private itemsByRarity: Map<ItemRarity, CosmeticItem[]> = new Map();
  private itemCallbacks: Map<string, Function[]> = new Map();

  constructor() {
    this.initializeDefaultItems();
  }

  // Item management
  addItem(item: CosmeticItem): void {
    this.items.set(item.id, item);
    this.updateCategoryIndex(item);
    this.updateRarityIndex(item);
    this.emitItemEvent('item_added', { item });
  }

  removeItem(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    this.items.delete(itemId);
    this.removeCategoryIndex(item);
    this.removeRarityIndex(item);
    this.emitItemEvent('item_removed', { itemId });
    return true;
  }

  getItem(itemId: string): CosmeticItem | null {
    return this.items.get(itemId) || null;
  }

  getAllItems(): CosmeticItem[] {
    return Array.from(this.items.values());
  }

  getItemsByCategory(category: ItemCategory): CosmeticItem[] {
    return this.itemsByCategory.get(category) || [];
  }

  getItemsByRarity(rarity: ItemRarity): CosmeticItem[] {
    return this.itemsByRarity.get(rarity) || [];
  }

  getItemsByType(type: ItemType): CosmeticItem[] {
    return Array.from(this.items.values()).filter(item => item.type === type);
  }

  searchItems(query: string, filters?: {
    category?: ItemCategory;
    rarity?: ItemRarity;
    type?: ItemType;
    priceRange?: [number, number];
    tags?: string[];
  }): CosmeticItem[] {
    let results = Array.from(this.items.values());

    // Text search
    if (query.trim()) {
      const searchTerm = query.toLowerCase();
      results = results.filter(item => 
        item.name.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm) ||
        item.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    // Apply filters
    if (filters) {
      if (filters.category) {
        results = results.filter(item => item.category === filters.category);
      }
      
      if (filters.rarity) {
        results = results.filter(item => item.rarity === filters.rarity);
      }
      
      if (filters.type) {
        results = results.filter(item => item.type === filters.type);
      }
      
      if (filters.priceRange) {
        const [min, max] = filters.priceRange;
        results = results.filter(item => item.price >= min && item.price <= max);
      }
      
      if (filters.tags && filters.tags.length > 0) {
        results = results.filter(item => 
          filters.tags!.some(tag => item.tags.includes(tag))
        );
      }
    }

    return results;
  }

  // Item availability
  isItemAvailable(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    // Check if limited time item is still available
    if (item.isLimited && item.limitedUntil) {
      return Date.now() < item.limitedUntil;
    }

    return true;
  }

  canPlayerUnlockItem(itemId: string, playerData: {
    level: number;
    achievements: string[];
    playtime: number;
    wins: number;
    currencies: PlayerInventory['currencies'];
  }): { canUnlock: boolean; missingRequirements: string[] } {
    const item = this.items.get(itemId);
    if (!item) {
      return { canUnlock: false, missingRequirements: ['Item not found'] };
    }

    const missingRequirements: string[] = [];

    // Check unlock requirements
    if (item.unlockRequirements) {
      for (const requirement of item.unlockRequirements) {
        switch (requirement.type) {
          case 'level':
            if (playerData.level < requirement.value) {
              missingRequirements.push(`Requires level ${requirement.value}`);
            }
            break;
          case 'achievement':
            if (!playerData.achievements.includes(requirement.value as string)) {
              missingRequirements.push(requirement.description);
            }
            break;
          case 'playtime':
            if (playerData.playtime < requirement.value) {
              missingRequirements.push(requirement.description);
            }
            break;
          case 'wins':
            if (playerData.wins < requirement.value) {
              missingRequirements.push(requirement.description);
            }
            break;
        }
      }
    }

    // Check currency requirements
    const currency = item.currency;
    const requiredAmount = item.price;
    
    if (playerData.currencies[currency] < requiredAmount) {
      missingRequirements.push(`Requires ${requiredAmount} ${currency}`);
    }

    return {
      canUnlock: missingRequirements.length === 0,
      missingRequirements
    };
  }

  // Indexing helpers
  private updateCategoryIndex(item: CosmeticItem): void {
    if (!this.itemsByCategory.has(item.category)) {
      this.itemsByCategory.set(item.category, []);
    }
    this.itemsByCategory.get(item.category)!.push(item);
  }

  private removeCategoryIndex(item: CosmeticItem): void {
    const categoryItems = this.itemsByCategory.get(item.category);
    if (categoryItems) {
      const index = categoryItems.findIndex(i => i.id === item.id);
      if (index !== -1) {
        categoryItems.splice(index, 1);
      }
    }
  }

  private updateRarityIndex(item: CosmeticItem): void {
    if (!this.itemsByRarity.has(item.rarity)) {
      this.itemsByRarity.set(item.rarity, []);
    }
    this.itemsByRarity.get(item.rarity)!.push(item);
  }

  private removeRarityIndex(item: CosmeticItem): void {
    const rarityItems = this.itemsByRarity.get(item.rarity);
    if (rarityItems) {
      const index = rarityItems.findIndex(i => i.id === item.id);
      if (index !== -1) {
        rarityItems.splice(index, 1);
      }
    }
  }

  // Default items initialization
  private initializeDefaultItems(): void {
    const defaultItems: CosmeticItem[] = [
      {
        id: 'default_skin',
        name: 'Default Skin',
        description: 'The classic player appearance',
        category: 'skin',
        rarity: 'common',
        type: 'full_body',
        price: 0,
        currency: 'coins',
        tags: ['default', 'free'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      },
      {
        id: 'red_cap',
        name: 'Red Baseball Cap',
        description: 'A stylish red baseball cap',
        category: 'hat',
        rarity: 'common',
        type: 'head',
        price: 100,
        currency: 'coins',
        tags: ['hat', 'red', 'casual'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      },
      {
        id: 'sunglasses',
        name: 'Cool Sunglasses',
        description: 'Look cool with these stylish sunglasses',
        category: 'accessory',
        rarity: 'uncommon',
        type: 'face',
        price: 250,
        currency: 'coins',
        tags: ['sunglasses', 'cool', 'accessory'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      },
      {
        id: 'ninja_outfit',
        name: 'Ninja Outfit',
        description: 'Become a stealthy ninja',
        category: 'clothing',
        rarity: 'rare',
        type: 'full_body',
        price: 500,
        currency: 'coins',
        unlockRequirements: [
          {
            type: 'level',
            value: 10,
            description: 'Reach level 10'
          }
        ],
        tags: ['ninja', 'stealth', 'dark'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      },
      {
        id: 'golden_crown',
        name: 'Golden Crown',
        description: 'A majestic golden crown for true champions',
        category: 'hat',
        rarity: 'legendary',
        type: 'head',
        price: 1000,
        currency: 'gems',
        unlockRequirements: [
          {
            type: 'wins',
            value: 100,
            description: 'Win 100 games'
          }
        ],
        tags: ['crown', 'gold', 'legendary', 'champion'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      }
    ];

    defaultItems.forEach(item => this.addItem(item));
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.itemCallbacks.has(event)) {
      this.itemCallbacks.set(event, []);
    }
    this.itemCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.itemCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitItemEvent(event: string, data: any): void {
    const callbacks = this.itemCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Cosmetic item event callback error:', error);
      }
    });
  }

  // Statistics
  getItemStatistics(): {
    totalItems: number;
    itemsByCategory: Record<ItemCategory, number>;
    itemsByRarity: Record<ItemRarity, number>;
    averagePrice: number;
    mostExpensiveItem: CosmeticItem | null;
    newestItem: CosmeticItem | null;
  } {
    const items = this.getAllItems();
    
    const categoryStats = {} as Record<ItemCategory, number>;
    const rarityStats = {} as Record<ItemRarity, number>;
    
    let totalPrice = 0;
    let mostExpensive: CosmeticItem | null = null;
    let newest: CosmeticItem | null = null;

    for (const item of items) {
      // Category stats
      categoryStats[item.category] = (categoryStats[item.category] || 0) + 1;
      
      // Rarity stats
      rarityStats[item.rarity] = (rarityStats[item.rarity] || 0) + 1;
      
      // Price stats
      totalPrice += item.price;
      if (!mostExpensive || item.price > mostExpensive.price) {
        mostExpensive = item;
      }
      
      // Newest item
      if (!newest || item.createdAt > newest.createdAt) {
        newest = item;
      }
    }

    return {
      totalItems: items.length,
      itemsByCategory: categoryStats,
      itemsByRarity: rarityStats,
      averagePrice: items.length > 0 ? totalPrice / items.length : 0,
      mostExpensiveItem: mostExpensive,
      newestItem: newest
    };
  }

  // Cleanup
  dispose(): void {
    this.items.clear();
    this.itemsByCategory.clear();
    this.itemsByRarity.clear();
    this.itemCallbacks.clear();
  }
}