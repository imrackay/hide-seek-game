import { InventoryManager, PurchaseResult, EquipResult } from '../InventoryManager';
import { CosmeticItem, PlayerInventory, InventoryItem, ItemType } from '../CosmeticItem';

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

describe('InventoryManager', () => {
  let inventoryManager: InventoryManager;
  const testPlayerId = 'test_player_123';

  const mockItem: CosmeticItem = {
    id: 'test_hat',
    name: 'Test Hat',
    description: 'A test hat',
    category: 'hat',
    rarity: 'common',
    type: 'head',
    price: 100,
    currency: 'coins',
    tags: ['test'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      version: '1.0.0',
      compatibility: ['all']
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    inventoryManager = new InventoryManager({
      enableAutoSave: false, // Disable for testing
      enableItemStacking: true,
      maxItemsPerCategory: 100
    });
  });

  afterEach(async () => {
    await inventoryManager.dispose();
  });

  describe('Inventory Loading and Creation', () => {
    it('should create new inventory for new player', async () => {
      const result = await inventoryManager.loadInventory(testPlayerId);
      
      expect(result.success).toBe(true);
      expect(result.inventory).toBeDefined();
      expect(result.inventory!.playerId).toBe(testPlayerId);
      expect(result.inventory!.currencies.coins).toBe(1000); // Starting coins
      expect(result.inventory!.items.has('default_skin')).toBe(true);
    });

    it('should load existing inventory from storage', async () => {
      // Create and save inventory first
      await inventoryManager.loadInventory(testPlayerId);
      
      // Create new manager and load
      const newManager = new InventoryManager();
      const result = await newManager.loadInventory(testPlayerId);
      
      expect(result.success).toBe(true);
      expect(result.inventory!.playerId).toBe(testPlayerId);
      
      await newManager.dispose();
    });

    it('should get inventory after loading', async () => {
      await inventoryManager.loadInventory(testPlayerId);
      
      const inventory = inventoryManager.getInventory(testPlayerId);
      
      expect(inventory).toBeDefined();
      expect(inventory!.playerId).toBe(testPlayerId);
    });

    it('should return null for non-loaded inventory', () => {
      const inventory = inventoryManager.getInventory('non_existent');
      
      expect(inventory).toBeNull();
    });
  });

  describe('Item Purchasing', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
    });

    it('should purchase item successfully', async () => {
      const result = await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
      
      expect(result.success).toBe(true);
      expect(result.item).toBeDefined();
      expect(result.item!.itemId).toBe('test_hat');
      expect(result.item!.quantity).toBe(1);
      expect(result.newBalance!.coins).toBe(900); // 1000 - 100
    });

    it('should fail purchase with insufficient currency', async () => {
      const expensiveItem: CosmeticItem = {
        ...mockItem,
        id: 'expensive_item',
        price: 2000 // More than starting coins
      };

      const result = await inventoryManager.purchaseItem(testPlayerId, expensiveItem, 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient coins');
    });

    it('should stack items when enabled', async () => {
      // Purchase same item twice
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
      const result = await inventoryManager.purchaseItem(testPlayerId, mockItem, 2);
      
      expect(result.success).toBe(true);
      expect(result.item!.quantity).toBe(3); // 1 + 2
    });

    it('should fail to purchase already owned item when stacking disabled', async () => {
      const noStackManager = new InventoryManager({ enableItemStacking: false });
      await noStackManager.loadInventory(testPlayerId);
      
      await noStackManager.purchaseItem(testPlayerId, mockItem, 1);
      const result = await noStackManager.purchaseItem(testPlayerId, mockItem, 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Item already owned');
      
      await noStackManager.dispose();
    });

    it('should calculate total cost for multiple quantities', async () => {
      const result = await inventoryManager.purchaseItem(testPlayerId, mockItem, 3);
      
      expect(result.success).toBe(true);
      expect(result.newBalance!.coins).toBe(700); // 1000 - (100 * 3)
    });
  });

  describe('Item Gifting', () => {
    const fromPlayerId = 'from_player';
    const toPlayerId = 'to_player';

    beforeEach(async () => {
      await inventoryManager.loadInventory(fromPlayerId);
      await inventoryManager.loadInventory(toPlayerId);
      
      // Give sender the item
      await inventoryManager.purchaseItem(fromPlayerId, mockItem, 5);
    });

    it('should gift item successfully', async () => {
      const result = await inventoryManager.giftItem(fromPlayerId, toPlayerId, 'test_hat', 2);
      
      expect(result.success).toBe(true);
      
      // Check sender inventory
      const senderItem = inventoryManager.getInventory(fromPlayerId)!.items.get('test_hat');
      expect(senderItem!.quantity).toBe(3); // 5 - 2
      
      // Check receiver inventory
      const receiverItem = inventoryManager.getInventory(toPlayerId)!.items.get('test_hat');
      expect(receiverItem!.quantity).toBe(2);
      expect(receiverItem!.source).toBe('gift');
    });

    it('should fail gift with insufficient items', async () => {
      const result = await inventoryManager.giftItem(fromPlayerId, toPlayerId, 'test_hat', 10);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient items to gift');
    });

    it('should remove item completely when gifting all', async () => {
      const result = await inventoryManager.giftItem(fromPlayerId, toPlayerId, 'test_hat', 5);
      
      expect(result.success).toBe(true);
      
      const senderInventory = inventoryManager.getInventory(fromPlayerId)!;
      expect(senderInventory.items.has('test_hat')).toBe(false);
    });

    it('should fail gift with non-loaded inventories', async () => {
      const result = await inventoryManager.giftItem('non_existent1', 'non_existent2', 'test_hat', 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('One or both inventories not loaded');
    });
  });

  describe('Item Equipping', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
    });

    it('should equip item successfully', async () => {
      const result = await inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
      
      expect(result.success).toBe(true);
      expect(result.newAppearance).toBeDefined();
      
      const inventory = inventoryManager.getInventory(testPlayerId)!;
      expect(inventory.equippedItems.get('head')).toBe('test_hat');
      
      const item = inventory.items.get('test_hat')!;
      expect(item.isEquipped).toBe(true);
    });

    it('should unequip previous item when equipping new one', async () => {
      const anotherHat: CosmeticItem = {
        ...mockItem,
        id: 'another_hat',
        name: 'Another Hat'
      };

      await inventoryManager.purchaseItem(testPlayerId, anotherHat, 1);
      
      // Equip first hat
      await inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
      
      // Equip second hat
      const result = await inventoryManager.equipItem(testPlayerId, 'another_hat', 'head');
      
      expect(result.success).toBe(true);
      expect(result.previousItem).toBe('test_hat');
      
      const inventory = inventoryManager.getInventory(testPlayerId)!;
      expect(inventory.items.get('test_hat')!.isEquipped).toBe(false);
      expect(inventory.items.get('another_hat')!.isEquipped).toBe(true);
    });

    it('should fail to equip non-owned item', async () => {
      const result = await inventoryManager.equipItem(testPlayerId, 'non_owned_item', 'head');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Item not found in inventory');
    });

    it('should unequip item by type', async () => {
      await inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
      
      const result = await inventoryManager.unequipItem(testPlayerId, 'head');
      
      expect(result.success).toBe(true);
      
      const inventory = inventoryManager.getInventory(testPlayerId)!;
      expect(inventory.equippedItems.has('head')).toBe(false);
      expect(inventory.items.get('test_hat')!.isEquipped).toBe(false);
    });
  });

  describe('Currency Management', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
    });

    it('should add currency successfully', async () => {
      const result = await inventoryManager.addCurrency(testPlayerId, 'coins', 500, 'reward');
      
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1500); // 1000 + 500
      
      const currencies = inventoryManager.getCurrencies(testPlayerId);
      expect(currencies!.coins).toBe(1500);
    });

    it('should deduct currency successfully', async () => {
      const result = await inventoryManager.deductCurrency(testPlayerId, 'coins', 300, 'purchase');
      
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(700); // 1000 - 300
    });

    it('should fail to deduct insufficient currency', async () => {
      const result = await inventoryManager.deductCurrency(testPlayerId, 'coins', 2000, 'purchase');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient coins');
    });

    it('should fail to add negative currency', async () => {
      const result = await inventoryManager.addCurrency(testPlayerId, 'coins', -100);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Amount must be positive');
    });

    it('should get currencies for player', () => {
      const currencies = inventoryManager.getCurrencies(testPlayerId);
      
      expect(currencies).toBeDefined();
      expect(currencies!.coins).toBe(1000);
      expect(currencies!.gems).toBe(0);
      expect(currencies!.premiumCredits).toBe(0);
    });
  });

  describe('Item Customization', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
    });

    it('should customize item successfully', async () => {
      const customizations = [
        { property: 'color', value: '#ff0000', appliedAt: 0 },
        { property: 'pattern', value: 'stripes', appliedAt: 0 }
      ];

      const result = await inventoryManager.customizeItem(testPlayerId, 'test_hat', customizations);
      
      expect(result.success).toBe(true);
      
      const item = inventoryManager.getInventory(testPlayerId)!.items.get('test_hat')!;
      expect(item.customizations).toHaveLength(2);
      expect(item.customizations![0].property).toBe('color');
      expect(item.customizations![0].value).toBe('#ff0000');
    });

    it('should fail to customize non-owned item', async () => {
      const result = await inventoryManager.customizeItem(testPlayerId, 'non_owned', []);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Item not found in inventory');
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
    });

    it('should get equipped items', () => {
      const equippedItems = inventoryManager.getEquippedItems(testPlayerId);
      
      expect(equippedItems).toBeDefined();
      expect(equippedItems!.has('full_body')).toBe(true); // Default skin
    });

    it('should get owned items', () => {
      const ownedItems = inventoryManager.getOwnedItems(testPlayerId);
      
      expect(ownedItems.length).toBeGreaterThan(0);
      expect(ownedItems.some(item => item.itemId === 'test_hat')).toBe(true);
    });

    it('should check if player has item', () => {
      expect(inventoryManager.hasItem(testPlayerId, 'test_hat')).toBe(true);
      expect(inventoryManager.hasItem(testPlayerId, 'non_owned')).toBe(false);
    });

    it('should get item quantity', () => {
      expect(inventoryManager.getItemQuantity(testPlayerId, 'test_hat')).toBe(1);
      expect(inventoryManager.getItemQuantity(testPlayerId, 'non_owned')).toBe(0);
    });
  });

  describe('Player Appearance', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
    });

    it('should get player appearance', () => {
      const appearance = inventoryManager.getPlayerAppearance(testPlayerId);
      
      expect(appearance).toBeDefined();
      expect(appearance!.playerId).toBe(testPlayerId);
      expect(appearance!.equippedItems['full_body']).toBeDefined();
    });

    it('should update appearance when equipping items', async () => {
      await inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
      
      const appearance = inventoryManager.getPlayerAppearance(testPlayerId);
      
      expect(appearance!.equippedItems['head']).toBeDefined();
      expect(appearance!.equippedItems['head']!.itemId).toBe('test_hat');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 3);
      await inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
    });

    it('should provide inventory statistics', () => {
      const stats = inventoryManager.getInventoryStatistics(testPlayerId);
      
      expect(stats).toBeDefined();
      expect(stats!.totalItems).toBeGreaterThan(0);
      expect(stats!.equippedItems).toBeGreaterThan(0);
      expect(stats!.currencies.coins).toBe(700); // After purchase
    });

    it('should return null for non-loaded inventory', () => {
      const stats = inventoryManager.getInventoryStatistics('non_existent');
      
      expect(stats).toBeNull();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await inventoryManager.loadInventory(testPlayerId);
    });

    it('should emit item purchased event', (done) => {
      inventoryManager.addEventListener('item_purchased', (data: any) => {
        expect(data.playerId).toBe(testPlayerId);
        expect(data.item.itemId).toBe('test_hat');
        done();
      });

      inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
    });

    it('should emit item equipped event', (done) => {
      inventoryManager.addEventListener('item_equipped', (data: any) => {
        expect(data.playerId).toBe(testPlayerId);
        expect(data.itemId).toBe('test_hat');
        expect(data.itemType).toBe('head');
        done();
      });

      inventoryManager.purchaseItem(testPlayerId, mockItem, 1).then(() => {
        inventoryManager.equipItem(testPlayerId, 'test_hat', 'head');
      });
    });

    it('should emit currency added event', (done) => {
      inventoryManager.addEventListener('currency_added', (data: any) => {
        expect(data.playerId).toBe(testPlayerId);
        expect(data.currency).toBe('coins');
        expect(data.amount).toBe(500);
        done();
      });

      inventoryManager.addCurrency(testPlayerId, 'coins', 500);
    });
  });

  describe('Storage Management', () => {
    it('should save and load inventory from storage', async () => {
      await inventoryManager.loadInventory(testPlayerId);
      await inventoryManager.purchaseItem(testPlayerId, mockItem, 1);
      
      // Verify storage was called
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `hideSeekInventory_${testPlayerId}`,
        expect.any(String)
      );
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage to throw error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = await inventoryManager.loadInventory(testPlayerId);
      
      // Should still succeed in creating inventory
      expect(result.success).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        maxItemsPerCategory: 200,
        enableItemStacking: false
      };

      inventoryManager.updateOptions(newOptions);
      const options = inventoryManager.getOptions();

      expect(options.maxItemsPerCategory).toBe(200);
      expect(options.enableItemStacking).toBe(false);
    });

    it('should return current options', () => {
      const options = inventoryManager.getOptions();
      
      expect(options.enableAutoSave).toBe(false);
      expect(options.enableItemStacking).toBe(true);
      expect(options.maxItemsPerCategory).toBe(100);
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', async () => {
      await inventoryManager.loadInventory(testPlayerId);
      
      await inventoryManager.dispose();
      
      // Should clear all data
      expect(inventoryManager.getInventory(testPlayerId)).toBeNull();
    });

    it('should save dirty inventories on dispose', async () => {
      const autoSaveManager = new InventoryManager({ enableAutoSave: true });
      await autoSaveManager.loadInventory(testPlayerId);
      await autoSaveManager.purchaseItem(testPlayerId, mockItem, 1);
      
      await autoSaveManager.dispose();
      
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });
});