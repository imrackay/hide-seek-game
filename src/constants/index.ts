// Game constants
export const GAME_CONFIG = {
  MAX_PLAYERS_PER_ROOM: 50,
  MIN_PLAYERS_PER_ROOM: 10,
  DEFAULT_HIDING_TIME: 60, // seconds
  DEFAULT_SEEKING_TIME: 300, // seconds
  RECONNECTION_TIMEOUT: 3000, // milliseconds
  MAX_RECONNECTION_ATTEMPTS: 5,
} as const;

export const PLAYER_ROLES = {
  HIDER: 'hider',
  SEEKER: 'seeker',
} as const;

export const GAME_PHASES = {
  WAITING: 'waiting',
  HIDING: 'hiding',
  SEEKING: 'seeking',
  ENDED: 'ended',
} as const;

export const MAP_THEMES = {
  SHOPPING_MALL: 'shopping_mall',
  FOREST: 'forest',
  SCHOOL: 'school',
  CITY: 'city',
} as const;

export const CAMOUFLAGE_RESTRICTIONS = {
  SPEED: 'speed',
  DIRECTION: 'direction',
  ACTION: 'action',
} as const;
