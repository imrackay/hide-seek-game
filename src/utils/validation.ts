import { 
  User, 
  Player, 
  GameState, 
  GameSession, 
  Vector3, 
  UserProfile, 
  InventoryItem, 
  PlayerStats, 
  UserPreferences,
  GameSettings,
  GameEvent
} from '../types';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Helper validation functions
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidUsername = (username: string): boolean => {
  return username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(username);
};

export const isValidId = (id: string): boolean => {
  return typeof id === 'string' && id.length > 0;
};

export const isValidDate = (date: Date): boolean => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const isValidVector3 = (vector: Vector3): boolean => {
  return (
    typeof vector.x === 'number' && 
    typeof vector.y === 'number' && 
    typeof vector.z === 'number' &&
    !isNaN(vector.x) && 
    !isNaN(vector.y) && 
    !isNaN(vector.z)
  );
};

// User validation
export const validateUser = (user: User): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(user.id)) {
    errors.push('User ID is required and must be a non-empty string');
  }

  if (!isValidUsername(user.username)) {
    errors.push('Username must be 3-20 characters long and contain only letters, numbers, hyphens, and underscores');
  }

  if (!isValidEmail(user.email)) {
    errors.push('Email must be a valid email address');
  }

  if (!isValidDate(user.createdAt)) {
    errors.push('Created date must be a valid Date object');
  }

  if (!isValidDate(user.lastActive)) {
    errors.push('Last active date must be a valid Date object');
  }

  // Validate nested objects
  const profileValidation = validateUserProfile(user.profile);
  if (!profileValidation.isValid) {
    errors.push(...profileValidation.errors.map(err => `Profile: ${err}`));
  }

  const statsValidation = validatePlayerStats(user.statistics);
  if (!statsValidation.isValid) {
    errors.push(...statsValidation.errors.map(err => `Statistics: ${err}`));
  }

  const preferencesValidation = validateUserPreferences(user.preferences);
  if (!preferencesValidation.isValid) {
    errors.push(...preferencesValidation.errors.map(err => `Preferences: ${err}`));
  }

  // Validate inventory items
  user.inventory.forEach((item, index) => {
    const itemValidation = validateInventoryItem(item);
    if (!itemValidation.isValid) {
      errors.push(...itemValidation.errors.map(err => `Inventory item ${index}: ${err}`));
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

// UserProfile validation
export const validateUserProfile = (profile: UserProfile): ValidationResult => {
  const errors: string[] = [];

  if (!profile.displayName || profile.displayName.length < 1 || profile.displayName.length > 50) {
    errors.push('Display name must be 1-50 characters long');
  }

  if (!profile.avatar || profile.avatar.length === 0) {
    errors.push('Avatar is required');
  }

  if (typeof profile.level !== 'number' || profile.level < 1) {
    errors.push('Level must be a positive number');
  }

  if (typeof profile.experience !== 'number' || profile.experience < 0) {
    errors.push('Experience must be a non-negative number');
  }

  if (profile.title && (profile.title.length < 1 || profile.title.length > 100)) {
    errors.push('Title must be 1-100 characters long if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// InventoryItem validation
export const validateInventoryItem = (item: InventoryItem): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(item.id)) {
    errors.push('Item ID is required');
  }

  const validTypes = ['skin', 'accessory', 'emote', 'title'];
  if (!validTypes.includes(item.type)) {
    errors.push(`Item type must be one of: ${validTypes.join(', ')}`);
  }

  if (!item.name || item.name.length < 1 || item.name.length > 100) {
    errors.push('Item name must be 1-100 characters long');
  }

  const validRarities = ['common', 'rare', 'epic', 'legendary'];
  if (!validRarities.includes(item.rarity)) {
    errors.push(`Item rarity must be one of: ${validRarities.join(', ')}`);
  }

  if (typeof item.equipped !== 'boolean') {
    errors.push('Equipped status must be a boolean');
  }

  if (!isValidDate(item.acquiredAt)) {
    errors.push('Acquired date must be a valid Date object');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// PlayerStats validation
export const validatePlayerStats = (stats: PlayerStats): ValidationResult => {
  const errors: string[] = [];

  if (typeof stats.gamesPlayed !== 'number' || stats.gamesPlayed < 0) {
    errors.push('Games played must be a non-negative number');
  }

  if (typeof stats.gamesWon !== 'number' || stats.gamesWon < 0) {
    errors.push('Games won must be a non-negative number');
  }

  if (stats.gamesWon > stats.gamesPlayed) {
    errors.push('Games won cannot exceed games played');
  }

  if (typeof stats.totalHideTime !== 'number' || stats.totalHideTime < 0) {
    errors.push('Total hide time must be a non-negative number');
  }

  if (typeof stats.totalSeekTime !== 'number' || stats.totalSeekTime < 0) {
    errors.push('Total seek time must be a non-negative number');
  }

  if (typeof stats.successfulHides !== 'number' || stats.successfulHides < 0) {
    errors.push('Successful hides must be a non-negative number');
  }

  if (typeof stats.successfulFinds !== 'number' || stats.successfulFinds < 0) {
    errors.push('Successful finds must be a non-negative number');
  }

  if (typeof stats.averageHideTime !== 'number' || stats.averageHideTime < 0) {
    errors.push('Average hide time must be a non-negative number');
  }

  if (stats.bestHidingSpot && (stats.bestHidingSpot.length < 1 || stats.bestHidingSpot.length > 100)) {
    errors.push('Best hiding spot must be 1-100 characters long if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// UserPreferences validation
export const validateUserPreferences = (preferences: UserPreferences): ValidationResult => {
  const errors: string[] = [];

  if (typeof preferences.voiceChatEnabled !== 'boolean') {
    errors.push('Voice chat enabled must be a boolean');
  }

  if (typeof preferences.textChatEnabled !== 'boolean') {
    errors.push('Text chat enabled must be a boolean');
  }

  if (typeof preferences.arModeEnabled !== 'boolean') {
    errors.push('AR mode enabled must be a boolean');
  }

  if (typeof preferences.soundEffectsVolume !== 'number' || preferences.soundEffectsVolume < 0 || preferences.soundEffectsVolume > 1) {
    errors.push('Sound effects volume must be a number between 0 and 1');
  }

  if (typeof preferences.musicVolume !== 'number' || preferences.musicVolume < 0 || preferences.musicVolume > 1) {
    errors.push('Music volume must be a number between 0 and 1');
  }

  if (!preferences.language || preferences.language.length < 2 || preferences.language.length > 10) {
    errors.push('Language must be 2-10 characters long');
  }

  if (typeof preferences.autoMatchmaking !== 'boolean') {
    errors.push('Auto matchmaking must be a boolean');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Player validation
export const validatePlayer = (player: Player): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(player.id)) {
    errors.push('Player ID is required');
  }

  if (!isValidUsername(player.username)) {
    errors.push('Username must be 3-20 characters long and contain only letters, numbers, hyphens, and underscores');
  }

  const validRoles = ['hider', 'seeker'];
  if (!validRoles.includes(player.role)) {
    errors.push(`Player role must be one of: ${validRoles.join(', ')}`);
  }

  if (!isValidVector3(player.position)) {
    errors.push('Player position must be a valid Vector3 with numeric x, y, z values');
  }

  // Validate avatar
  if (!player.avatar.model || player.avatar.model.length === 0) {
    errors.push('Player avatar model is required');
  }

  if (!player.avatar.skin || player.avatar.skin.length === 0) {
    errors.push('Player avatar skin is required');
  }

  if (!Array.isArray(player.avatar.accessories)) {
    errors.push('Player avatar accessories must be an array');
  }

  // Validate camouflage state
  if (typeof player.camouflageState.isActive !== 'boolean') {
    errors.push('Camouflage state isActive must be a boolean');
  }

  if (player.camouflageState.isActive) {
    if (!player.camouflageState.objectType || player.camouflageState.objectType.length === 0) {
      errors.push('Object type is required when camouflage is active');
    }

    if (!player.camouflageState.model || player.camouflageState.model.length === 0) {
      errors.push('Model is required when camouflage is active');
    }
  }

  if (!Array.isArray(player.camouflageState.restrictions)) {
    errors.push('Camouflage restrictions must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// GameState validation
export const validateGameState = (gameState: GameState): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(gameState.id)) {
    errors.push('Game state ID is required');
  }

  const validPhases = ['waiting', 'hiding', 'seeking', 'ended'];
  if (!validPhases.includes(gameState.phase)) {
    errors.push(`Game phase must be one of: ${validPhases.join(', ')}`);
  }

  if (!Array.isArray(gameState.players)) {
    errors.push('Players must be an array');
  }

  // Validate each player
  gameState.players.forEach((player, index) => {
    const playerValidation = validatePlayer(player);
    if (!playerValidation.isValid) {
      errors.push(...playerValidation.errors.map(err => `Player ${index}: ${err}`));
    }
  });

  if (typeof gameState.timeRemaining !== 'number' || gameState.timeRemaining < 0) {
    errors.push('Time remaining must be a non-negative number');
  }

  // Validate settings
  const settingsValidation = validateGameSettings(gameState.settings);
  if (!settingsValidation.isValid) {
    errors.push(...settingsValidation.errors.map(err => `Settings: ${err}`));
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// GameSettings validation
export const validateGameSettings = (settings: GameSettings): ValidationResult => {
  const errors: string[] = [];

  if (typeof settings.maxPlayers !== 'number' || settings.maxPlayers < 2 || settings.maxPlayers > 50) {
    errors.push('Max players must be a number between 2 and 50');
  }

  if (typeof settings.hidingTime !== 'number' || settings.hidingTime < 30 || settings.hidingTime > 300) {
    errors.push('Hiding time must be a number between 30 and 300 seconds');
  }

  if (typeof settings.seekingTime !== 'number' || settings.seekingTime < 60 || settings.seekingTime > 600) {
    errors.push('Seeking time must be a number between 60 and 600 seconds');
  }

  if (!isValidId(settings.mapId)) {
    errors.push('Map ID is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// GameSession validation
export const validateGameSession = (session: GameSession): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(session.id)) {
    errors.push('Game session ID is required');
  }

  if (!session.roomCode || session.roomCode.length < 4 || session.roomCode.length > 10) {
    errors.push('Room code must be 4-10 characters long');
  }

  if (!isValidId(session.mapId)) {
    errors.push('Map ID is required');
  }

  if (!Array.isArray(session.players)) {
    errors.push('Players must be an array');
  }

  // Validate game state
  const gameStateValidation = validateGameState(session.gameState);
  if (!gameStateValidation.isValid) {
    errors.push(...gameStateValidation.errors.map(err => `Game state: ${err}`));
  }

  // Validate settings
  const settingsValidation = validateGameSettings(session.settings);
  if (!settingsValidation.isValid) {
    errors.push(...settingsValidation.errors.map(err => `Settings: ${err}`));
  }

  if (!isValidDate(session.startTime)) {
    errors.push('Start time must be a valid Date object');
  }

  if (typeof session.duration !== 'number' || session.duration < 0) {
    errors.push('Duration must be a non-negative number');
  }

  if (!Array.isArray(session.events)) {
    errors.push('Events must be an array');
  }

  // Validate events
  session.events.forEach((event, index) => {
    const eventValidation = validateGameEvent(event);
    if (!eventValidation.isValid) {
      errors.push(...eventValidation.errors.map(err => `Event ${index}: ${err}`));
    }
  });

  if (!isValidId(session.createdBy)) {
    errors.push('Created by user ID is required');
  }

  if (typeof session.isPrivate !== 'boolean') {
    errors.push('Is private must be a boolean');
  }

  if (typeof session.maxPlayers !== 'number' || session.maxPlayers < 2 || session.maxPlayers > 50) {
    errors.push('Max players must be a number between 2 and 50');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// GameEvent validation
export const validateGameEvent = (event: GameEvent): ValidationResult => {
  const errors: string[] = [];

  if (!isValidId(event.id)) {
    errors.push('Event ID is required');
  }

  const validTypes = ['player_joined', 'player_left', 'game_started', 'player_found', 'camouflage_activated', 'game_ended'];
  if (!validTypes.includes(event.type)) {
    errors.push(`Event type must be one of: ${validTypes.join(', ')}`);
  }

  if (event.playerId && !isValidId(event.playerId)) {
    errors.push('Player ID must be a valid ID if provided');
  }

  if (!isValidDate(event.timestamp)) {
    errors.push('Event timestamp must be a valid Date object');
  }

  if (event.data && typeof event.data !== 'object') {
    errors.push('Event data must be an object if provided');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};