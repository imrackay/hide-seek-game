export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar?: {
    url?: string;
    model?: string;
    skin?: string;
    accessories?: string[];
  };
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    soundEnabled: boolean;
    musicEnabled: boolean;
    voiceChatEnabled: boolean;
    positionalAudioEnabled: boolean;
    masterVolume: number;
    voiceVolume: number;
    effectsVolume: number;
    musicVolume: number;
    showPlayerNames: boolean;
    showMinimap: boolean;
    enableNotifications: boolean;
    autoJoinVoice: boolean;
  };
  statistics: {
    gamesPlayed: number;
    gamesWon: number;
    totalPlayTime: number; // in milliseconds
    bestHideTime: number; // in milliseconds
    fastestSeekTime: number; // in milliseconds
    favoriteRole: 'hider' | 'seeker' | 'none';
    achievementsUnlocked: string[];
    lastPlayedAt: number;
    createdAt: number;
    level: number;
    experience: number;
    streakCount: number;
    longestStreak: number;
  };
  social: {
    friends: string[];
    blockedUsers: string[];
    friendRequests: {
      incoming: string[];
      outgoing: string[];
    };
    status: 'online' | 'away' | 'busy' | 'offline';
    statusMessage?: string;
  };
  settings: {
    privacy: {
      showOnlineStatus: boolean;
      allowFriendRequests: boolean;
      allowDirectMessages: boolean;
      showStatistics: boolean;
    };
    gameplay: {
      preferredMaps: string[];
      maxGameDuration: number;
      autoReadyUp: boolean;
      spectatorMode: boolean;
    };
  };
  isGuest: boolean;
  isPremium: boolean;
  subscriptionExpiry?: number;
  lastUpdated: number;
}

export interface ProfileUpdateData {
  displayName?: string;
  email?: string;
  avatar?: Partial<UserProfile['avatar']>;
  preferences?: Partial<UserProfile['preferences']>;
  settings?: Partial<UserProfile['settings']>;
  social?: Partial<UserProfile['social']>;
}

export interface ProfileStatistics {
  gamesPlayed: number;
  winRate: number;
  averageGameDuration: number;
  totalPlayTime: number;
  level: number;
  experience: number;
  nextLevelExperience: number;
  achievements: Achievement[];
  recentGames: GameRecord[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: number;
  progress?: {
    current: number;
    required: number;
  };
}

export interface GameRecord {
  id: string;
  gameMode: string;
  mapName: string;
  role: 'hider' | 'seeker';
  result: 'won' | 'lost' | 'draw';
  duration: number;
  playedAt: number;
  experienceGained: number;
  playersCount: number;
}

export interface ProfileOptions {
  enableStatistics?: boolean;
  enableSocialFeatures?: boolean;
  enableAchievements?: boolean;
  autoSaveInterval?: number;
  maxRecentGames?: number;
  experienceMultiplier?: number;
}

export class UserProfileManager {
  private profile: UserProfile | null = null;
  private options: Required<ProfileOptions>;
  private profileCallbacks: Map<string, Function[]> = new Map();
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(options: ProfileOptions = {}) {
    this.options = {
      enableStatistics: options.enableStatistics !== false,
      enableSocialFeatures: options.enableSocialFeatures !== false,
      enableAchievements: options.enableAchievements !== false,
      autoSaveInterval: options.autoSaveInterval || 30000, // 30 seconds
      maxRecentGames: options.maxRecentGames || 50,
      experienceMultiplier: options.experienceMultiplier || 1.0
    };
  }

  // Profile management
  async loadProfile(userId: string): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    try {
      // Try to load from localStorage first
      const storedProfile = this.loadFromStorage(userId);
      if (storedProfile) {
        this.profile = storedProfile;
        this.startAutoSave();
        this.emitProfileEvent('profile_loaded', { profile: this.profile });
        return { success: true, profile: this.profile };
      }

      // Create new profile if not found
      const newProfile = this.createDefaultProfile(userId);
      this.profile = newProfile;
      await this.saveProfile();
      this.startAutoSave();
      
      this.emitProfileEvent('profile_created', { profile: this.profile });
      return { success: true, profile: this.profile };
    } catch (error) {
      console.error('Failed to load profile:', error);
      return { success: false, error: 'Failed to load user profile' };
    }
  }

  async createProfile(userId: string, initialData?: Partial<UserProfile>): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    try {
      const profile = this.createDefaultProfile(userId, initialData);
      this.profile = profile;
      
      await this.saveProfile();
      this.startAutoSave();
      
      this.emitProfileEvent('profile_created', { profile: this.profile });
      return { success: true, profile: this.profile };
    } catch (error) {
      console.error('Failed to create profile:', error);
      return { success: false, error: 'Failed to create user profile' };
    }
  }

  private createDefaultProfile(userId: string, initialData?: Partial<UserProfile>): UserProfile {
    const now = Date.now();
    
    return {
      id: userId,
      username: initialData?.username || `Player_${userId.slice(-6)}`,
      displayName: initialData?.displayName || initialData?.username || `Player_${userId.slice(-6)}`,
      email: initialData?.email,
      avatar: {
        url: undefined,
        model: 'default',
        skin: 'default',
        accessories: []
      },
      preferences: {
        theme: 'auto',
        language: 'en',
        soundEnabled: true,
        musicEnabled: true,
        voiceChatEnabled: true,
        positionalAudioEnabled: true,
        masterVolume: 0.8,
        voiceVolume: 0.8,
        effectsVolume: 0.7,
        musicVolume: 0.5,
        showPlayerNames: true,
        showMinimap: true,
        enableNotifications: true,
        autoJoinVoice: false
      },
      statistics: {
        gamesPlayed: 0,
        gamesWon: 0,
        totalPlayTime: 0,
        bestHideTime: 0,
        fastestSeekTime: 0,
        favoriteRole: 'none',
        achievementsUnlocked: [],
        lastPlayedAt: 0,
        createdAt: now,
        level: 1,
        experience: 0,
        streakCount: 0,
        longestStreak: 0
      },
      social: {
        friends: [],
        blockedUsers: [],
        friendRequests: {
          incoming: [],
          outgoing: []
        },
        status: 'online',
        statusMessage: undefined
      },
      settings: {
        privacy: {
          showOnlineStatus: true,
          allowFriendRequests: true,
          allowDirectMessages: true,
          showStatistics: true
        },
        gameplay: {
          preferredMaps: [],
          maxGameDuration: 600000, // 10 minutes
          autoReadyUp: false,
          spectatorMode: false
        }
      },
      isGuest: initialData?.isGuest || false,
      isPremium: false,
      subscriptionExpiry: undefined,
      lastUpdated: now,
      ...initialData
    };
  }

  // Profile updates
  async updateProfile(updates: ProfileUpdateData): Promise<{ success: boolean; error?: string }> {
    if (!this.profile) {
      return { success: false, error: 'No profile loaded' };
    }

    try {
      // Validate updates
      const validationError = this.validateProfileUpdates(updates);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Apply updates
      if (updates.displayName) {
        this.profile.displayName = updates.displayName;
      }
      
      if (updates.email) {
        this.profile.email = updates.email;
      }

      if (updates.avatar) {
        this.profile.avatar = { ...this.profile.avatar, ...updates.avatar };
      }

      if (updates.preferences) {
        this.profile.preferences = { ...this.profile.preferences, ...updates.preferences };
      }

      if (updates.settings) {
        this.profile.settings = {
          ...this.profile.settings,
          privacy: { ...this.profile.settings.privacy, ...updates.settings.privacy },
          gameplay: { ...this.profile.settings.gameplay, ...updates.settings.gameplay }
        };
      }

      if (updates.social) {
        this.profile.social = { ...this.profile.social, ...updates.social };
      }

      this.profile.lastUpdated = Date.now();
      this.markDirty();

      this.emitProfileEvent('profile_updated', { 
        profile: this.profile, 
        updates 
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to update profile:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  }

  private validateProfileUpdates(updates: ProfileUpdateData): string | null {
    if (updates.displayName) {
      if (updates.displayName.trim().length < 1) {
        return 'Display name cannot be empty';
      }
      if (updates.displayName.length > 50) {
        return 'Display name must be 50 characters or less';
      }
    }

    if (updates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        return 'Invalid email format';
      }
    }

    if (updates.preferences) {
      const prefs = updates.preferences;
      
      if (prefs.masterVolume !== undefined && (prefs.masterVolume < 0 || prefs.masterVolume > 1)) {
        return 'Master volume must be between 0 and 1';
      }
      
      if (prefs.voiceVolume !== undefined && (prefs.voiceVolume < 0 || prefs.voiceVolume > 1)) {
        return 'Voice volume must be between 0 and 1';
      }
      
      if (prefs.effectsVolume !== undefined && (prefs.effectsVolume < 0 || prefs.effectsVolume > 1)) {
        return 'Effects volume must be between 0 and 1';
      }
      
      if (prefs.musicVolume !== undefined && (prefs.musicVolume < 0 || prefs.musicVolume > 1)) {
        return 'Music volume must be between 0 and 1';
      }
    }

    return null;
  }

  // Statistics management
  recordGameResult(gameData: {
    gameMode: string;
    mapName: string;
    role: 'hider' | 'seeker';
    result: 'won' | 'lost' | 'draw';
    duration: number;
    playersCount: number;
    hideTime?: number;
    seekTime?: number;
  }): void {
    if (!this.profile || !this.options.enableStatistics) return;

    const stats = this.profile.statistics;
    const now = Date.now();

    // Update basic statistics
    stats.gamesPlayed++;
    stats.totalPlayTime += gameData.duration;
    stats.lastPlayedAt = now;

    if (gameData.result === 'won') {
      stats.gamesWon++;
      stats.streakCount++;
      stats.longestStreak = Math.max(stats.longestStreak, stats.streakCount);
    } else {
      stats.streakCount = 0;
    }

    // Update role-specific statistics
    if (gameData.role === 'hider' && gameData.hideTime) {
      if (stats.bestHideTime === 0 || gameData.hideTime > stats.bestHideTime) {
        stats.bestHideTime = gameData.hideTime;
      }
    }

    if (gameData.role === 'seeker' && gameData.seekTime) {
      if (stats.fastestSeekTime === 0 || gameData.seekTime < stats.fastestSeekTime) {
        stats.fastestSeekTime = gameData.seekTime;
      }
    }

    // Update favorite role
    this.updateFavoriteRole();

    // Add experience
    const baseExperience = this.calculateExperience(gameData);
    const experience = Math.floor(baseExperience * this.options.experienceMultiplier);
    this.addExperience(experience);

    // Create game record
    const gameRecord: GameRecord = {
      id: `game_${now}_${Math.random().toString(36).substring(2, 9)}`,
      gameMode: gameData.gameMode,
      mapName: gameData.mapName,
      role: gameData.role,
      result: gameData.result,
      duration: gameData.duration,
      playedAt: now,
      experienceGained: experience,
      playersCount: gameData.playersCount
    };

    // Store recent games (limited)
    if (!this.profile.statistics.recentGames) {
      (this.profile.statistics as any).recentGames = [];
    }
    
    const recentGames = (this.profile.statistics as any).recentGames as GameRecord[];
    recentGames.unshift(gameRecord);
    
    if (recentGames.length > this.options.maxRecentGames) {
      recentGames.splice(this.options.maxRecentGames);
    }

    this.markDirty();
    this.emitProfileEvent('game_recorded', { gameRecord, statistics: stats });

    // Check for achievements
    if (this.options.enableAchievements) {
      this.checkAchievements(gameData);
    }
  }

  private updateFavoriteRole(): void {
    if (!this.profile) return;

    const recentGames = (this.profile.statistics as any).recentGames as GameRecord[] || [];
    const last10Games = recentGames.slice(0, 10);
    
    if (last10Games.length < 5) return; // Need at least 5 games

    const roleCounts = last10Games.reduce((counts, game) => {
      counts[game.role] = (counts[game.role] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const favoriteRole = Object.entries(roleCounts).reduce((a, b) => 
      roleCounts[a[0]] > roleCounts[b[0]] ? a : b
    )[0] as 'hider' | 'seeker';

    this.profile.statistics.favoriteRole = favoriteRole;
  }

  private calculateExperience(gameData: {
    result: 'won' | 'lost' | 'draw';
    duration: number;
    playersCount: number;
  }): number {
    let baseExp = 10; // Base experience

    // Result bonus
    if (gameData.result === 'won') {
      baseExp += 25;
    } else if (gameData.result === 'draw') {
      baseExp += 15;
    }

    // Duration bonus (longer games give more exp)
    const durationMinutes = gameData.duration / 60000;
    baseExp += Math.floor(durationMinutes * 2);

    // Player count bonus
    baseExp += Math.max(0, gameData.playersCount - 2) * 2;

    return baseExp;
  }

  private addExperience(amount: number): void {
    if (!this.profile) return;

    const stats = this.profile.statistics;
    const oldLevel = stats.level;
    
    stats.experience += amount;

    // Check for level up
    while (stats.experience >= this.getExperienceForLevel(stats.level + 1)) {
      stats.level++;
    }

    if (stats.level > oldLevel) {
      this.emitProfileEvent('level_up', { 
        oldLevel, 
        newLevel: stats.level, 
        experienceGained: amount 
      });
    }
  }

  private getExperienceForLevel(level: number): number {
    // Exponential experience curve
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  // Achievements
  private checkAchievements(gameData: any): void {
    if (!this.profile) return;

    const achievements = this.getAvailableAchievements();
    const stats = this.profile.statistics;

    for (const achievement of achievements) {
      if (stats.achievementsUnlocked.includes(achievement.id)) continue;

      let unlocked = false;

      switch (achievement.id) {
        case 'first_game':
          unlocked = stats.gamesPlayed >= 1;
          break;
        case 'first_win':
          unlocked = stats.gamesWon >= 1;
          break;
        case 'veteran':
          unlocked = stats.gamesPlayed >= 100;
          break;
        case 'winner':
          unlocked = stats.gamesWon >= 50;
          break;
        case 'streak_master':
          unlocked = stats.longestStreak >= 10;
          break;
        case 'time_master':
          unlocked = stats.totalPlayTime >= 36000000; // 10 hours
          break;
        case 'level_10':
          unlocked = stats.level >= 10;
          break;
        case 'level_25':
          unlocked = stats.level >= 25;
          break;
        case 'level_50':
          unlocked = stats.level >= 50;
          break;
      }

      if (unlocked) {
        this.unlockAchievement(achievement.id);
      }
    }
  }

  private unlockAchievement(achievementId: string): void {
    if (!this.profile) return;

    this.profile.statistics.achievementsUnlocked.push(achievementId);
    this.markDirty();

    const achievement = this.getAvailableAchievements().find(a => a.id === achievementId);
    if (achievement) {
      achievement.unlockedAt = Date.now();
      this.emitProfileEvent('achievement_unlocked', { achievement });
    }
  }

  private getAvailableAchievements(): Achievement[] {
    return [
      {
        id: 'first_game',
        name: 'First Steps',
        description: 'Play your first game',
        icon: '🎮',
        rarity: 'common'
      },
      {
        id: 'first_win',
        name: 'Victory!',
        description: 'Win your first game',
        icon: '🏆',
        rarity: 'common'
      },
      {
        id: 'veteran',
        name: 'Veteran Player',
        description: 'Play 100 games',
        icon: '⭐',
        rarity: 'rare'
      },
      {
        id: 'winner',
        name: 'Champion',
        description: 'Win 50 games',
        icon: '👑',
        rarity: 'rare'
      },
      {
        id: 'streak_master',
        name: 'Streak Master',
        description: 'Win 10 games in a row',
        icon: '🔥',
        rarity: 'epic'
      },
      {
        id: 'time_master',
        name: 'Time Master',
        description: 'Play for 10 hours total',
        icon: '⏰',
        rarity: 'epic'
      },
      {
        id: 'level_10',
        name: 'Rising Star',
        description: 'Reach level 10',
        icon: '🌟',
        rarity: 'rare'
      },
      {
        id: 'level_25',
        name: 'Expert',
        description: 'Reach level 25',
        icon: '💎',
        rarity: 'epic'
      },
      {
        id: 'level_50',
        name: 'Master',
        description: 'Reach level 50',
        icon: '🏅',
        rarity: 'legendary'
      }
    ];
  }

  // Social features
  async sendFriendRequest(targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.profile || !this.options.enableSocialFeatures) {
      return { success: false, error: 'Social features not available' };
    }

    if (this.profile.social.friends.includes(targetUserId)) {
      return { success: false, error: 'User is already a friend' };
    }

    if (this.profile.social.friendRequests.outgoing.includes(targetUserId)) {
      return { success: false, error: 'Friend request already sent' };
    }

    this.profile.social.friendRequests.outgoing.push(targetUserId);
    this.markDirty();

    this.emitProfileEvent('friend_request_sent', { targetUserId });
    return { success: true };
  }

  async acceptFriendRequest(fromUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.profile || !this.options.enableSocialFeatures) {
      return { success: false, error: 'Social features not available' };
    }

    const requestIndex = this.profile.social.friendRequests.incoming.indexOf(fromUserId);
    if (requestIndex === -1) {
      return { success: false, error: 'Friend request not found' };
    }

    // Remove from incoming requests and add to friends
    this.profile.social.friendRequests.incoming.splice(requestIndex, 1);
    this.profile.social.friends.push(fromUserId);
    this.markDirty();

    this.emitProfileEvent('friend_request_accepted', { fromUserId });
    return { success: true };
  }

  async blockUser(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.profile || !this.options.enableSocialFeatures) {
      return { success: false, error: 'Social features not available' };
    }

    if (this.profile.social.blockedUsers.includes(userId)) {
      return { success: false, error: 'User is already blocked' };
    }

    // Remove from friends and friend requests if present
    this.profile.social.friends = this.profile.social.friends.filter(id => id !== userId);
    this.profile.social.friendRequests.incoming = this.profile.social.friendRequests.incoming.filter(id => id !== userId);
    this.profile.social.friendRequests.outgoing = this.profile.social.friendRequests.outgoing.filter(id => id !== userId);

    // Add to blocked list
    this.profile.social.blockedUsers.push(userId);
    this.markDirty();

    this.emitProfileEvent('user_blocked', { userId });
    return { success: true };
  }

  // Storage management
  private loadFromStorage(userId: string): UserProfile | null {
    try {
      const stored = localStorage.getItem(`hideSeekProfile_${userId}`);
      if (stored) {
        const profile = JSON.parse(stored) as UserProfile;
        
        // Validate profile structure
        if (this.isValidProfile(profile)) {
          return profile;
        }
      }
    } catch (error) {
      console.error('Failed to load profile from storage:', error);
    }
    
    return null;
  }

  private async saveProfile(): Promise<void> {
    if (!this.profile) return;

    try {
      const profileData = JSON.stringify(this.profile);
      localStorage.setItem(`hideSeekProfile_${this.profile.id}`, profileData);
      this.isDirty = false;
      
      this.emitProfileEvent('profile_saved', { profile: this.profile });
    } catch (error) {
      console.error('Failed to save profile:', error);
      throw error;
    }
  }

  private isValidProfile(profile: any): profile is UserProfile {
    return (
      profile &&
      typeof profile.id === 'string' &&
      typeof profile.username === 'string' &&
      typeof profile.displayName === 'string' &&
      profile.preferences &&
      profile.statistics &&
      profile.social &&
      profile.settings
    );
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.saveProfile();
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, this.options.autoSaveInterval);
  }

  // Query methods
  getProfile(): UserProfile | null {
    return this.profile ? { ...this.profile } : null;
  }

  getStatistics(): ProfileStatistics | null {
    if (!this.profile) return null;

    const stats = this.profile.statistics;
    const winRate = stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed) * 100 : 0;
    const avgDuration = stats.gamesPlayed > 0 ? stats.totalPlayTime / stats.gamesPlayed : 0;
    const nextLevelExp = this.getExperienceForLevel(stats.level + 1);

    const achievements = this.getAvailableAchievements().map(achievement => ({
      ...achievement,
      unlockedAt: stats.achievementsUnlocked.includes(achievement.id) ? 
        Date.now() : undefined // In real app, store actual unlock time
    }));

    const recentGames = (stats as any).recentGames as GameRecord[] || [];

    return {
      gamesPlayed: stats.gamesPlayed,
      winRate,
      averageGameDuration: avgDuration,
      totalPlayTime: stats.totalPlayTime,
      level: stats.level,
      experience: stats.experience,
      nextLevelExperience: nextLevelExp,
      achievements,
      recentGames: recentGames.slice(0, 10) // Last 10 games
    };
  }

  getPreferences(): UserProfile['preferences'] | null {
    return this.profile ? { ...this.profile.preferences } : null;
  }

  getSocialData(): UserProfile['social'] | null {
    return this.profile ? { ...this.profile.social } : null;
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.profileCallbacks.has(event)) {
      this.profileCallbacks.set(event, []);
    }
    this.profileCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.profileCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitProfileEvent(event: string, data: any): void {
    const callbacks = this.profileCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Profile event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<ProfileOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): ProfileOptions {
    return { ...this.options };
  }

  // Cleanup
  async dispose(): Promise<void> {
    // Save profile before disposing
    if (this.isDirty && this.profile) {
      await this.saveProfile();
    }

    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Clear callbacks
    this.profileCallbacks.clear();
    
    // Clear profile data
    this.profile = null;
    this.isDirty = false;
  }
}