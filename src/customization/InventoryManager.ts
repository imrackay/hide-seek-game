import { 
  PlayerInventory, 
  InventoryItem, 
  CosmeticItem, 
  ItemType, 
  CharacterAppearance,
  ItemCustomization 
} from './CosmeticItem';

export interface InventoryOptions {
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  maxItemsPerCategory?: number;
  enableItemStacking?: boolean;
}

export interface PurchaseResult {
  success: boolean;
  item?: InventoryItem;
  newBalance?: PlayerInventory['currencies'];
  error?: string;
}

export interface EquipResult {
  success: boolean;
  previousItem?: string;
  newAppearance?: CharacterAppearance;
  error?: string;
}

export class InventoryManager {
  private inventories: Map<string, PlayerInventory> = new Map();
  private appearances: Map<string, CharacterAppearance> = new Map();
  private options: Required<InventoryOptions>;
  private inventoryCallbacks: Map<string, Function[]> = new Map();
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private dirtyInventories: Set<string> = new Set();

  constructor(options: InventoryOptions = {}) {
    this.options = {
      enableAutoSave: options.enableAutoSave !== false,
      autoSaveInterval: options.autoSaveInterval || 30000, // 30 seconds
      maxItemsPerCategory: options.maxItemsPerCategory || 1000,
      enableItemStacking: options.enableItemStacking !== false
    };

    if (this.options.enableAutoSave) {
      this.startAutoSave();
    }
  }

  // Inventory management
  async loadInventory(playerId: string): Promise<{ success: boolean; inventory?: PlayerInventory; error?: string }> {
    try {
      // Try to load from storage
      const stored = this.loadFromStorage(playerId);
      if (stored) {
        this.inventories.set(playerId, stored);
        this.emitInventoryEvent('inventory_loaded', { playerId, inventory: stored });
        return { success: true, inventory: stored };
      }

      // Create new inventory if not found
      const newInventory = this.createDefaultInventory(playerId);
      this.inventories.set(playerId, newInventory);
      await this.saveInventory(playerId);
      
      this.emitInventoryEvent('inventory_created', { playerId, inventory: newInventory });
      return { success: true, inventory: newInventory };
    } catch (error) {
      console.error('Failed to load inventory:', error);
      return { success: false, error: 'Failed to load inventory' };
    }
  }

  private createDefaultInventory(playerId: string): PlayerInventory {
    const inventory: PlayerInventory = {
      playerId,
      items: new Map(),
      equippedItems: new Map(),
      currencies: {
        coins: 1000, // Starting coins
        gems: 0,
        premiumCredits: 0
      },
      lastUpdated: Date.now()
    };

    // Add default items
    const defaultItem: InventoryItem = {
      itemId: 'default_skin',
      quantity: 1,
      acquiredAt: Date.now(),
      source: 'reward',
      isEquipped: true
    };

    inventory.items.set('default_skin', defaultItem);
    inventory.equippedItems.set('full_body', 'default_skin');

    return inventory;
  }

  getInventory(playerId: string): PlayerInventory | null {
    return this.inventories.get(playerId) || null;
  }

  // Item purchasing
  async purchaseItem(
    playerId: string, 
    item: CosmeticItem, 
    quantity: number = 1
  ): Promise<PurchaseResult> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    // Check if player already owns the item (for non-stackable items)
    if (!this.options.enableItemStacking && inventory.items.has(item.id)) {
      return { success: false, error: 'Item already owned' };
    }

    // Calculate total cost
    const totalCost = item.price * quantity;
    const currency = item.currency;

    // Check if player has enough currency
    if (inventory.currencies[currency] < totalCost) {
      return { 
        success: false, 
        error: `Insufficient ${currency}. Need ${totalCost}, have ${inventory.currencies[currency]}` 
      };
    }

    // Deduct currency
    inventory.currencies[currency] -= totalCost;

    // Add or update item in inventory
    const existingItem = inventory.items.get(item.id);
    if (existingItem && this.options.enableItemStacking) {
      existingItem.quantity += quantity;
    } else {
      const newItem: InventoryItem = {
        itemId: item.id,
        quantity,
        acquiredAt: Date.now(),
        source: 'purchase',
        isEquipped: false
      };
      inventory.items.set(item.id, newItem);
    }

    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    const purchasedItem = inventory.items.get(item.id)!;
    
    this.emitInventoryEvent('item_purchased', { 
      playerId, 
      item: purchasedItem, 
      totalCost, 
      currency,
      newBalance: inventory.currencies 
    });

    return { 
      success: true, 
      item: purchasedItem, 
      newBalance: inventory.currencies 
    };
  }

  // Item gifting
  async giftItem(
    fromPlayerId: string,
    toPlayerId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    const fromInventory = this.inventories.get(fromPlayerId);
    const toInventory = this.inventories.get(toPlayerId);

    if (!fromInventory || !toInventory) {
      return { success: false, error: 'One or both inventories not loaded' };
    }

    const fromItem = fromInventory.items.get(itemId);
    if (!fromItem || fromItem.quantity < quantity) {
      return { success: false, error: 'Insufficient items to gift' };
    }

    // Remove from sender
    fromItem.quantity -= quantity;
    if (fromItem.quantity === 0) {
      fromInventory.items.delete(itemId);
      // Unequip if equipped
      if (fromItem.isEquipped) {
        this.unequipItemInternal(fromPlayerId, itemId);
      }
    }

    // Add to receiver
    const toItem = toInventory.items.get(itemId);
    if (toItem && this.options.enableItemStacking) {
      toItem.quantity += quantity;
    } else {
      const giftedItem: InventoryItem = {
        itemId,
        quantity,
        acquiredAt: Date.now(),
        source: 'gift',
        isEquipped: false
      };
      toInventory.items.set(itemId, giftedItem);
    }

    fromInventory.lastUpdated = Date.now();
    toInventory.lastUpdated = Date.now();
    this.markDirty(fromPlayerId);
    this.markDirty(toPlayerId);

    this.emitInventoryEvent('item_gifted', { 
      fromPlayerId, 
      toPlayerId, 
      itemId, 
      quantity 
    });

    return { success: true };
  }

  // Item equipping
  async equipItem(playerId: string, itemId: string, itemType: ItemType): Promise<EquipResult> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    const item = inventory.items.get(itemId);
    if (!item) {
      return { success: false, error: 'Item not found in inventory' };
    }

    // Unequip previous item of the same type
    const previousItemId = inventory.equippedItems.get(itemType);
    if (previousItemId) {
      const previousItem = inventory.items.get(previousItemId);
      if (previousItem) {
        previousItem.isEquipped = false;
      }
    }

    // Equip new item
    inventory.equippedItems.set(itemType, itemId);
    item.isEquipped = true;
    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    // Update appearance
    const appearance = this.updatePlayerAppearance(playerId);

    this.emitInventoryEvent('item_equipped', { 
      playerId, 
      itemId, 
      itemType, 
      previousItem: previousItemId,
      newAppearance: appearance 
    });

    return { 
      success: true, 
      previousItem: previousItemId, 
      newAppearance: appearance 
    };
  }

  async unequipItem(playerId: string, itemType: ItemType): Promise<EquipResult> {
    return this.unequipItemInternal(playerId, null, itemType);
  }

  private async unequipItemInternal(
    playerId: string, 
    itemId?: string | null, 
    itemType?: ItemType
  ): Promise<EquipResult> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    let unequippedItemId: string | undefined;
    let unequippedType: ItemType | undefined;

    if (itemId) {
      // Unequip specific item
      const item = inventory.items.get(itemId);
      if (!item || !item.isEquipped) {
        return { success: false, error: 'Item not equipped' };
      }

      // Find the item type
      for (const [type, equippedId] of inventory.equippedItems.entries()) {
        if (equippedId === itemId) {
          unequippedType = type;
          break;
        }
      }

      if (!unequippedType) {
        return { success: false, error: 'Item type not found' };
      }

      item.isEquipped = false;
      inventory.equippedItems.delete(unequippedType);
      unequippedItemId = itemId;
    } else if (itemType) {
      // Unequip by type
      const equippedItemId = inventory.equippedItems.get(itemType);
      if (!equippedItemId) {
        return { success: false, error: 'No item equipped in this slot' };
      }

      const item = inventory.items.get(equippedItemId);
      if (item) {
        item.isEquipped = false;
      }

      inventory.equippedItems.delete(itemType);
      unequippedItemId = equippedItemId;
      unequippedType = itemType;
    }

    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    // Update appearance
    const appearance = this.updatePlayerAppearance(playerId);

    this.emitInventoryEvent('item_unequipped', { 
      playerId, 
      itemId: unequippedItemId, 
      itemType: unequippedType,
      newAppearance: appearance 
    });

    return { 
      success: true, 
      previousItem: unequippedItemId, 
      newAppearance: appearance 
    };
  }

  // Appearance management
  private updatePlayerAppearance(playerId: string): CharacterAppearance {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      throw new Error('Inventory not loaded');
    }

    const appearance: CharacterAppearance = {
      playerId,
      baseModel: 'default',
      equippedItems: {},
      lastUpdated: Date.now()
    };

    // Build equipped items map
    for (const [itemType, itemId] of inventory.equippedItems.entries()) {
      const item = inventory.items.get(itemId);
      if (item) {
        appearance.equippedItems[itemType] = {
          itemId,
          customizations: item.customizations
        };
      }
    }

    this.appearances.set(playerId, appearance);
    return appearance;
  }

  getPlayerAppearance(playerId: string): CharacterAppearance | null {
    return this.appearances.get(playerId) || null;
  }

  // Item customization
  async customizeItem(
    playerId: string,
    itemId: string,
    customizations: ItemCustomization[]
  ): Promise<{ success: boolean; error?: string }> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    const item = inventory.items.get(itemId);
    if (!item) {
      return { success: false, error: 'Item not found in inventory' };
    }

    // Apply customizations
    item.customizations = customizations.map(c => ({
      ...c,
      appliedAt: Date.now()
    }));

    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    // Update appearance if item is equipped
    if (item.isEquipped) {
      this.updatePlayerAppearance(playerId);
    }

    this.emitInventoryEvent('item_customized', { 
      playerId, 
      itemId, 
      customizations 
    });

    return { success: true };
  }

  // Currency management
  async addCurrency(
    playerId: string,
    currency: keyof PlayerInventory['currencies'],
    amount: number,
    source: string = 'system'
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    if (amount < 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    inventory.currencies[currency] += amount;
    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    this.emitInventoryEvent('currency_added', { 
      playerId, 
      currency, 
      amount, 
      source,
      newBalance: inventory.currencies[currency] 
    });

    return { success: true, newBalance: inventory.currencies[currency] };
  }

  async deductCurrency(
    playerId: string,
    currency: keyof PlayerInventory['currencies'],
    amount: number,
    reason: string = 'system'
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) {
      return { success: false, error: 'Inventory not loaded' };
    }

    if (amount < 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    if (inventory.currencies[currency] < amount) {
      return { 
        success: false, 
        error: `Insufficient ${currency}. Need ${amount}, have ${inventory.currencies[currency]}` 
      };
    }

    inventory.currencies[currency] -= amount;
    inventory.lastUpdated = Date.now();
    this.markDirty(playerId);

    this.emitInventoryEvent('currency_deducted', { 
      playerId, 
      currency, 
      amount, 
      reason,
      newBalance: inventory.currencies[currency] 
    });

    return { success: true, newBalance: inventory.currencies[currency] };
  }

  getCurrencies(playerId: string): PlayerInventory['currencies'] | null {
    const inventory = this.inventories.get(playerId);
    return inventory ? { ...inventory.currencies } : null;
  }

  // Query methods
  getEquippedItems(playerId: string): Map<ItemType, string> | null {
    const inventory = this.inventories.get(playerId);
    return inventory ? new Map(inventory.equippedItems) : null;
  }

  getOwnedItems(playerId: string): InventoryItem[] {
    const inventory = this.inventories.get(playerId);
    return inventory ? Array.from(inventory.items.values()) : [];
  }

  hasItem(playerId: string, itemId: string): boolean {
    const inventory = this.inventories.get(playerId);
    return inventory ? inventory.items.has(itemId) : false;
  }

  getItemQuantity(playerId: string, itemId: string): number {
    const inventory = this.inventories.get(playerId);
    if (!inventory) return 0;
    
    const item = inventory.items.get(itemId);
    return item ? item.quantity : 0;
  }

  // Storage management
  private loadFromStorage(playerId: string): PlayerInventory | null {
    try {
      const stored = localStorage.getItem(`hideSeekInventory_${playerId}`);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Convert items Map from JSON
        const inventory: PlayerInventory = {
          ...data,
          items: new Map(data.items),
          equippedItems: new Map(data.equippedItems)
        };
        
        return this.isValidInventory(inventory) ? inventory : null;
      }
    } catch (error) {
      console.error('Failed to load inventory from storage:', error);
    }
    
    return null;
  }

  private async saveInventory(playerId: string): Promise<void> {
    const inventory = this.inventories.get(playerId);
    if (!inventory) return;

    try {
      // Convert Maps to arrays for JSON serialization
      const serializable = {
        ...inventory,
        items: Array.from(inventory.items.entries()),
        equippedItems: Array.from(inventory.equippedItems.entries())
      };

      localStorage.setItem(`hideSeekInventory_${playerId}`, JSON.stringify(serializable));
      this.emitInventoryEvent('inventory_saved', { playerId });
    } catch (error) {
      console.error('Failed to save inventory:', error);
      throw error;
    }
  }

  private isValidInventory(inventory: any): inventory is PlayerInventory {
    return (
      inventory &&
      typeof inventory.playerId === 'string' &&
      inventory.items instanceof Map &&
      inventory.equippedItems instanceof Map &&
      inventory.currencies &&
      typeof inventory.currencies.coins === 'number' &&
      typeof inventory.currencies.gems === 'number' &&
      typeof inventory.currencies.premiumCredits === 'number'
    );
  }

  // Auto-save functionality
  private markDirty(playerId: string): void {
    this.dirtyInventories.add(playerId);
  }

  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(async () => {
      for (const playerId of this.dirtyInventories) {
        try {
          await this.saveInventory(playerId);
          this.dirtyInventories.delete(playerId);
        } catch (error) {
          console.error(`Auto-save failed for player ${playerId}:`, error);
        }
      }
    }, this.options.autoSaveInterval);
  }

  // Statistics
  getInventoryStatistics(playerId: string): {
    totalItems: number;
    equippedItems: number;
    totalValue: number;
    itemsByRarity: Record<string, number>;
    currencies: PlayerInventory['currencies'];
  } | null {
    const inventory = this.inventories.get(playerId);
    if (!inventory) return null;

    const items = Array.from(inventory.items.values());
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const equippedItems = items.filter(item => item.isEquipped).length;

    // Note: Would need CosmeticItemManager to calculate total value and rarity stats
    return {
      totalItems,
      equippedItems,
      totalValue: 0, // Would calculate with item prices
      itemsByRarity: {}, // Would calculate with item rarities
      currencies: { ...inventory.currencies }
    };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.inventoryCallbacks.has(event)) {
      this.inventoryCallbacks.set(event, []);
    }
    this.inventoryCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.inventoryCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitInventoryEvent(event: string, data: any): void {
    const callbacks = this.inventoryCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Inventory event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<InventoryOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    if (this.options.enableAutoSave && !this.autoSaveInterval) {
      this.startAutoSave();
    } else if (!this.options.enableAutoSave && this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  getOptions(): InventoryOptions {
    return { ...this.options };
  }

  // Cleanup
  async dispose(): Promise<void> {
    // Save all dirty inventories
    for (const playerId of this.dirtyInventories) {
      try {
        await this.saveInventory(playerId);
      } catch (error) {
        console.error(`Failed to save inventory for player ${playerId} during disposal:`, error);
      }
    }

    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Clear data
    this.inventories.clear();
    this.appearances.clear();
    this.inventoryCallbacks.clear();
    this.dirtyInventories.clear();
  }
}