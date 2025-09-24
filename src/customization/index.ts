// Cosmetic Item System
export {
  CosmeticItemManager,
  type CosmeticItem,
  type ItemCategory,
  type ItemRarity,
  type ItemType,
  type UnlockRequirement,
  type ItemMetadata,
  type PlayerInventory,
  type InventoryItem,
  type ItemCustomization,
  type CharacterAppearance,
  type ItemPreview,
  type CustomizationPreset
} from './CosmeticItem';

// Inventory Management
export {
  InventoryManager,
  type InventoryOptions,
  type PurchaseResult,
  type EquipResult
} from './InventoryManager';

// Character Customization
export {
  CharacterCustomizer,
  type CustomizationOptions,
  type PreviewConfiguration,
  type CustomizationSession
} from './CharacterCustomizer';

// Re-export commonly used types
export type {
  CosmeticItem as Item,
  PlayerInventory as Inventory,
  CharacterAppearance as Appearance
} from './CosmeticItem';