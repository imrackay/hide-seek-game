import { CosmeticItemManager, CosmeticItem, ItemCategory, ItemRarity, ItemType } from '../CosmeticItem';

describe('CosmeticItemManager', () => {
  let itemManager: CosmeticItemManager;

  beforeEach(() => {
    itemManager = new CosmeticItemManager();
  });

  afterEach(() => {
    itemManager.dispose();
  });

  describe('Item Management', () => {
    it('should initialize with default items', () => {
      const items = itemManager.getAllItems();
      
      expect(items.length).toBeGreaterThan(0);
      expect(items.some(item => item.id === 'default_skin')).toBe(true);
      expect(items.some(item => item.id === 'red_cap')).toBe(true);
    });

    it('should add new item successfully', () => {
      const newItem: CosmeticItem = {
        id: 'test_item',
        name: 'Test Item',
        description: 'A test item',
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

      itemManager.addItem(newItem);
      
      const retrievedItem = itemManager.getItem('test_item');
      expect(retrievedItem).toEqual(newItem);
    });

    it('should remove item successfully', () => {
      const removed = itemManager.removeItem('red_cap');
      
      expect(removed).toBe(true);
      expect(itemManager.getItem('red_cap')).toBeNull();
    });

    it('should return false when removing non-existent item', () => {
      const removed = itemManager.removeItem('non_existent');
      
      expect(removed).toBe(false);
    });
  });

  describe('Item Queries', () => {
    it('should get items by category', () => {
      const hatItems = itemManager.getItemsByCategory('hat');
      
      expect(hatItems.length).toBeGreaterThan(0);
      expect(hatItems.every(item => item.category === 'hat')).toBe(true);
    });

    it('should get items by rarity', () => {
      const commonItems = itemManager.getItemsByRarity('common');
      
      expect(commonItems.length).toBeGreaterThan(0);
      expect(commonItems.every(item => item.rarity === 'common')).toBe(true);
    });

    it('should get items by type', () => {
      const headItems = itemManager.getItemsByType('head');
      
      expect(headItems.length).toBeGreaterThan(0);
      expect(headItems.every(item => item.type === 'head')).toBe(true);
    });

    it('should search items by name', () => {
      const results = itemManager.searchItems('cap');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(item => item.name.toLowerCase().includes('cap'))).toBe(true);
    });

    it('should search items with filters', () => {
      const results = itemManager.searchItems('', {
        category: 'hat',
        rarity: 'common'
      });
      
      expect(results.every(item => item.category === 'hat' && item.rarity === 'common')).toBe(true);
    });

    it('should filter by price range', () => {
      const results = itemManager.searchItems('', {
        priceRange: [0, 200]
      });
      
      expect(results.every(item => item.price >= 0 && item.price <= 200)).toBe(true);
    });

    it('should filter by tags', () => {
      const results = itemManager.searchItems('', {
        tags: ['default']
      });
      
      expect(results.every(item => item.tags.includes('default'))).toBe(true);
    });
  });

  describe('Item Availability', () => {
    it('should check if item is available', () => {
      const available = itemManager.isItemAvailable('default_skin');
      
      expect(available).toBe(true);
    });

    it('should return false for non-existent item', () => {
      const available = itemManager.isItemAvailable('non_existent');
      
      expect(available).toBe(false);
    });

    it('should check limited time items', () => {
      const limitedItem: CosmeticItem = {
        id: 'limited_item',
        name: 'Limited Item',
        description: 'A limited time item',
        category: 'hat',
        rarity: 'rare',
        type: 'head',
        price: 500,
        currency: 'gems',
        tags: ['limited'],
        isLimited: true,
        limitedUntil: Date.now() + 86400000, // 24 hours from now
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      };

      itemManager.addItem(limitedItem);
      
      expect(itemManager.isItemAvailable('limited_item')).toBe(true);
      
      // Test expired limited item
      limitedItem.limitedUntil = Date.now() - 1000; // 1 second ago
      itemManager.addItem(limitedItem); // Update item
      
      expect(itemManager.isItemAvailable('limited_item')).toBe(false);
    });
  });

  describe('Unlock Requirements', () => {
    const playerData = {
      level: 5,
      achievements: ['first_win'],
      playtime: 3600000, // 1 hour
      wins: 10,
      currencies: {
        coins: 500,
        gems: 50,
        premiumCredits: 0
      }
    };

    it('should check if player can unlock item with sufficient requirements', () => {
      const result = itemManager.canPlayerUnlockItem('red_cap', playerData);
      
      expect(result.canUnlock).toBe(true);
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should check level requirements', () => {
      const result = itemManager.canPlayerUnlockItem('ninja_outfit', playerData);
      
      expect(result.canUnlock).toBe(false);
      expect(result.missingRequirements).toContain('Requires level 10');
    });

    it('should check currency requirements', () => {
      const result = itemManager.canPlayerUnlockItem('golden_crown', playerData);
      
      expect(result.canUnlock).toBe(false);
      expect(result.missingRequirements.some(req => req.includes('gems'))).toBe(true);
    });

    it('should check achievement requirements', () => {
      const itemWithAchievement: CosmeticItem = {
        id: 'achievement_item',
        name: 'Achievement Item',
        description: 'Requires specific achievement',
        category: 'accessory',
        rarity: 'rare',
        type: 'face',
        price: 0,
        currency: 'coins',
        unlockRequirements: [
          {
            type: 'achievement',
            value: 'master_hider',
            description: 'Complete Master Hider achievement'
          }
        ],
        tags: ['achievement'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      };

      itemManager.addItem(itemWithAchievement);
      
      const result = itemManager.canPlayerUnlockItem('achievement_item', playerData);
      
      expect(result.canUnlock).toBe(false);
      expect(result.missingRequirements).toContain('Complete Master Hider achievement');
    });

    it('should check multiple requirements', () => {
      const complexItem: CosmeticItem = {
        id: 'complex_item',
        name: 'Complex Item',
        description: 'Multiple requirements',
        category: 'clothing',
        rarity: 'epic',
        type: 'full_body',
        price: 1000,
        currency: 'coins',
        unlockRequirements: [
          {
            type: 'level',
            value: 20,
            description: 'Reach level 20'
          },
          {
            type: 'wins',
            value: 50,
            description: 'Win 50 games'
          }
        ],
        tags: ['complex'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          version: '1.0.0',
          compatibility: ['all']
        }
      };

      itemManager.addItem(complexItem);
      
      const result = itemManager.canPlayerUnlockItem('complex_item', playerData);
      
      expect(result.canUnlock).toBe(false);
      expect(result.missingRequirements.length).toBeGreaterThan(1);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate item statistics', () => {
      const stats = itemManager.getItemStatistics();
      
      expect(stats.totalItems).toBeGreaterThan(0);
      expect(stats.itemsByCategory).toBeDefined();
      expect(stats.itemsByRarity).toBeDefined();
      expect(stats.averagePrice).toBeGreaterThanOrEqual(0);
      expect(stats.mostExpensiveItem).toBeDefined();
      expect(stats.newestItem).toBeDefined();
    });

    it('should calculate average price correctly', () => {
      const items = itemManager.getAllItems();
      const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
      const expectedAverage = totalPrice / items.length;
      
      const stats = itemManager.getItemStatistics();
      
      expect(stats.averagePrice).toBe(expectedAverage);
    });

    it('should identify most expensive item', () => {
      const items = itemManager.getAllItems();
      const mostExpensive = items.reduce((max, item) => 
        item.price > max.price ? item : max
      );
      
      const stats = itemManager.getItemStatistics();
      
      expect(stats.mostExpensiveItem?.id).toBe(mostExpensive.id);
    });
  });

  describe('Event System', () => {
    it('should emit item added event', (done) => {
      itemManager.addEventListener('item_added', (data: any) => {
        expect(data.item.id).toBe('event_test_item');
        done();
      });

      const testItem: CosmeticItem = {
        id: 'event_test_item',
        name: 'Event Test Item',
        description: 'Test item for events',
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

      itemManager.addItem(testItem);
    });

    it('should emit item removed event', (done) => {
      itemManager.addEventListener('item_removed', (data: any) => {
        expect(data.itemId).toBe('red_cap');
        done();
      });

      itemManager.removeItem('red_cap');
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      itemManager.addEventListener('item_added', callback);
      itemManager.removeEventListener('item_added', callback);

      const testItem: CosmeticItem = {
        id: 'no_event_item',
        name: 'No Event Item',
        description: 'Should not trigger event',
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

      itemManager.addItem(testItem);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid item data gracefully', () => {
      // This would depend on validation implementation
      expect(() => {
        itemManager.getItem('');
      }).not.toThrow();
    });

    it('should handle callback errors gracefully', () => {
      itemManager.addEventListener('item_added', () => {
        throw new Error('Callback error');
      });

      expect(() => {
        const testItem: CosmeticItem = {
          id: 'error_test_item',
          name: 'Error Test Item',
          description: 'Test item for error handling',
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

        itemManager.addItem(testItem);
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', () => {
      const callback = jest.fn();
      itemManager.addEventListener('test', callback);
      
      itemManager.dispose();
      
      expect(itemManager.getAllItems()).toHaveLength(0);
    });
  });
});