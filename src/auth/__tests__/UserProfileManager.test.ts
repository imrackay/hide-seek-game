import { UserProfileManager, UserProfile, ProfileUpdateData, GameRecord } from '../UserProfileManager';

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

describe('UserProfileManager', () => {
  let profileManager: UserProfileManager;
  const testUserId = 'test_user_123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    profileManager = new UserProfileManager({
      enableStatistics: true,
      enableSocialFeatures: true,
      enableAchievements: true,
      autoSaveInterval: 1000, // 1 second for testing
      maxRecentGames: 10,
      experienceMultiplier: 1.0
    });
  });

  afterEach(async () => {
    await profileManager.dispose();
  });

  describe('Profile Creation and Loading', () => {
    it('should create a new profile with default values', async () => {
      const result = await profileManager.createProfile(testUserId);
      
      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile!.id).toBe(testUserId);
      expect(result.profile!.username).toMatch(/^Player_/);
      expect(result.profile!.statistics.level).toBe(1);
      expect(result.profile!.statistics.experience).toBe(0);
      expect(result.profile!.statistics.gamesPlayed).toBe(0);
    });

    it('should create profile with initial data', async () => {
      const initialData = {
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com'
      };

      const result = await profileManager.createProfile(testUserId, initialData);
      
      expect(result.success).toBe(true);
      expect(result.profile!.username).toBe('testuser');
      expect(result.profile!.displayName).toBe('Test User');
      expect(result.profile!.email).toBe('test@example.com');
    });

    it('should load existing profile from storage', async () => {
      // Create and save a profile first
      await profileManager.createProfile(testUserId, { username: 'existinguser' });
      
      // Create new manager and load profile
      const newManager = new UserProfileManager();
      const result = await newManager.loadProfile(testUserId);
      
      expect(result.success).toBe(true);
      expect(result.profile!.username).toBe('existinguser');
      
      await newManager.dispose();
    });

    it('should create new profile if not found in storage', async () => {
      const result = await profileManager.loadProfile('nonexistent_user');
      
      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile!.id).toBe('nonexistent_user');
    });
  });

  describe('Profile Updates', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should update display name', async () => {
      const updates: ProfileUpdateData = {
        displayName: 'New Display Name'
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.displayName).toBe('New Display Name');
    });

    it('should update email', async () => {
      const updates: ProfileUpdateData = {
        email: 'newemail@example.com'
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.email).toBe('newemail@example.com');
    });

    it('should update preferences', async () => {
      const updates: ProfileUpdateData = {
        preferences: {
          theme: 'dark',
          masterVolume: 0.5,
          voiceChatEnabled: false
        }
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.preferences.theme).toBe('dark');
      expect(profile!.preferences.masterVolume).toBe(0.5);
      expect(profile!.preferences.voiceChatEnabled).toBe(false);
    });

    it('should update avatar settings', async () => {
      const updates: ProfileUpdateData = {
        avatar: {
          model: 'custom',
          skin: 'blue',
          accessories: ['hat', 'glasses']
        }
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.avatar!.model).toBe('custom');
      expect(profile!.avatar!.skin).toBe('blue');
      expect(profile!.avatar!.accessories).toEqual(['hat', 'glasses']);
    });

    it('should validate display name length', async () => {
      const updates: ProfileUpdateData = {
        displayName: 'A'.repeat(51) // Too long
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Display name must be 50 characters or less');
    });

    it('should validate email format', async () => {
      const updates: ProfileUpdateData = {
        email: 'invalid-email'
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email format');
    });

    it('should validate volume ranges', async () => {
      const updates: ProfileUpdateData = {
        preferences: {
          masterVolume: 1.5 // Invalid range
        }
      };

      const result = await profileManager.updateProfile(updates);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Master volume must be between 0 and 1');
    });
  });

  describe('Game Statistics', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should record game result and update statistics', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000, // 5 minutes
        playersCount: 8,
        hideTime: 240000 // 4 minutes
      };

      profileManager.recordGameResult(gameData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.gamesPlayed).toBe(1);
      expect(profile!.statistics.gamesWon).toBe(1);
      expect(profile!.statistics.totalPlayTime).toBe(300000);
      expect(profile!.statistics.bestHideTime).toBe(240000);
      expect(profile!.statistics.streakCount).toBe(1);
    });

    it('should update streak on consecutive wins', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      // Record 3 wins
      profileManager.recordGameResult(gameData);
      profileManager.recordGameResult(gameData);
      profileManager.recordGameResult(gameData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.streakCount).toBe(3);
      expect(profile!.statistics.longestStreak).toBe(3);
    });

    it('should reset streak on loss', () => {
      const winData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      const lossData = {
        ...winData,
        result: 'lost' as const
      };

      // Win, win, lose
      profileManager.recordGameResult(winData);
      profileManager.recordGameResult(winData);
      profileManager.recordGameResult(lossData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.streakCount).toBe(0);
      expect(profile!.statistics.longestStreak).toBe(2);
    });

    it('should calculate and add experience', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 600000, // 10 minutes
        playersCount: 10
      };

      profileManager.recordGameResult(gameData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.experience).toBeGreaterThan(0);
    });

    it('should level up when enough experience is gained', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 600000,
        playersCount: 10
      };

      // Record many games to gain enough experience
      for (let i = 0; i < 10; i++) {
        profileManager.recordGameResult(gameData);
      }
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.level).toBeGreaterThan(1);
    });

    it('should track recent games', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      profileManager.recordGameResult(gameData);
      
      const stats = profileManager.getStatistics();
      expect(stats!.recentGames).toHaveLength(1);
      expect(stats!.recentGames[0].gameMode).toBe('classic');
      expect(stats!.recentGames[0].result).toBe('won');
    });
  });

  describe('Achievements', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should unlock first game achievement', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'lost' as const,
        duration: 300000,
        playersCount: 8
      };

      profileManager.recordGameResult(gameData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.achievementsUnlocked).toContain('first_game');
    });

    it('should unlock first win achievement', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      profileManager.recordGameResult(gameData);
      
      const profile = profileManager.getProfile();
      expect(profile!.statistics.achievementsUnlocked).toContain('first_win');
    });

    it('should emit achievement unlocked event', (done) => {
      profileManager.addEventListener('achievement_unlocked', (data: any) => {
        expect(data.achievement.id).toBe('first_game');
        done();
      });

      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'lost' as const,
        duration: 300000,
        playersCount: 8
      };

      profileManager.recordGameResult(gameData);
    });
  });

  describe('Social Features', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should send friend request', async () => {
      const result = await profileManager.sendFriendRequest('friend_user_123');
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.social.friendRequests.outgoing).toContain('friend_user_123');
    });

    it('should not send duplicate friend request', async () => {
      await profileManager.sendFriendRequest('friend_user_123');
      const result = await profileManager.sendFriendRequest('friend_user_123');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Friend request already sent');
    });

    it('should accept friend request', async () => {
      // Simulate incoming friend request
      const profile = profileManager.getProfile();
      profile!.social.friendRequests.incoming.push('friend_user_123');
      
      const result = await profileManager.acceptFriendRequest('friend_user_123');
      
      expect(result.success).toBe(true);
      
      const updatedProfile = profileManager.getProfile();
      expect(updatedProfile!.social.friends).toContain('friend_user_123');
      expect(updatedProfile!.social.friendRequests.incoming).not.toContain('friend_user_123');
    });

    it('should block user', async () => {
      const result = await profileManager.blockUser('blocked_user_123');
      
      expect(result.success).toBe(true);
      
      const profile = profileManager.getProfile();
      expect(profile!.social.blockedUsers).toContain('blocked_user_123');
    });

    it('should remove blocked user from friends and requests', async () => {
      // Add user as friend and in requests
      const profile = profileManager.getProfile();
      profile!.social.friends.push('user_to_block');
      profile!.social.friendRequests.incoming.push('user_to_block');
      profile!.social.friendRequests.outgoing.push('user_to_block');
      
      await profileManager.blockUser('user_to_block');
      
      const updatedProfile = profileManager.getProfile();
      expect(updatedProfile!.social.friends).not.toContain('user_to_block');
      expect(updatedProfile!.social.friendRequests.incoming).not.toContain('user_to_block');
      expect(updatedProfile!.social.friendRequests.outgoing).not.toContain('user_to_block');
      expect(updatedProfile!.social.blockedUsers).toContain('user_to_block');
    });
  });

  describe('Statistics Queries', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should calculate win rate correctly', () => {
      const winData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      const lossData = {
        ...winData,
        result: 'lost' as const
      };

      // 2 wins, 1 loss = 66.67% win rate
      profileManager.recordGameResult(winData);
      profileManager.recordGameResult(winData);
      profileManager.recordGameResult(lossData);
      
      const stats = profileManager.getStatistics();
      expect(Math.round(stats!.winRate * 100) / 100).toBeCloseTo(66.67, 1);
    });

    it('should calculate average game duration', () => {
      const gameData1 = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000, // 5 minutes
        playersCount: 8
      };

      const gameData2 = {
        ...gameData1,
        duration: 600000 // 10 minutes
      };

      profileManager.recordGameResult(gameData1);
      profileManager.recordGameResult(gameData2);
      
      const stats = profileManager.getStatistics();
      expect(stats!.averageGameDuration).toBe(450000); // 7.5 minutes
    });

    it('should return achievements with unlock status', () => {
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 300000,
        playersCount: 8
      };

      profileManager.recordGameResult(gameData);
      
      const stats = profileManager.getStatistics();
      const firstGameAchievement = stats!.achievements.find(a => a.id === 'first_game');
      const veteranAchievement = stats!.achievements.find(a => a.id === 'veteran');
      
      expect(firstGameAchievement!.unlockedAt).toBeDefined();
      expect(veteranAchievement!.unlockedAt).toBeUndefined();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await profileManager.createProfile(testUserId);
    });

    it('should emit profile updated event', (done) => {
      profileManager.addEventListener('profile_updated', (data: any) => {
        expect(data.updates.displayName).toBe('New Name');
        done();
      });

      profileManager.updateProfile({ displayName: 'New Name' });
    });

    it('should emit level up event', (done) => {
      profileManager.addEventListener('level_up', (data: any) => {
        expect(data.newLevel).toBeGreaterThan(data.oldLevel);
        done();
      });

      // Record enough games to level up
      const gameData = {
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider' as const,
        result: 'won' as const,
        duration: 600000,
        playersCount: 10
      };

      for (let i = 0; i < 5; i++) {
        profileManager.recordGameResult(gameData);
      }
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      profileManager.addEventListener('profile_updated', callback);
      profileManager.removeEventListener('profile_updated', callback);
      
      profileManager.updateProfile({ displayName: 'Test' });
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Storage and Persistence', () => {
    it('should auto-save profile when dirty', (done) => {
      profileManager.createProfile(testUserId).then(() => {
        profileManager.updateProfile({ displayName: 'Auto Save Test' });
        
        // Wait for auto-save interval
        setTimeout(() => {
          expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
            `hideSeekProfile_${testUserId}`,
            expect.any(String)
          );
          done();
        }, 1100);
      });
    }, 2000);

    it('should handle storage errors gracefully', async () => {
      // Mock localStorage to throw error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = await profileManager.createProfile(testUserId);
      
      // Should still succeed in creating profile, just fail to save
      expect(result.success).toBe(true);
    });

    it('should validate profile structure when loading', () => {
      // Store invalid profile data
      mockLocalStorage.setItem(`hideSeekProfile_${testUserId}`, JSON.stringify({
        id: testUserId,
        // Missing required fields
      }));

      const newManager = new UserProfileManager();
      
      return newManager.loadProfile(testUserId).then(result => {
        // Should create new profile instead of loading invalid one
        expect(result.success).toBe(true);
        expect(result.profile!.username).toMatch(/^Player_/);
        
        return newManager.dispose();
      });
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        maxRecentGames: 20,
        experienceMultiplier: 2.0
      };

      profileManager.updateOptions(newOptions);
      const options = profileManager.getOptions();

      expect(options.maxRecentGames).toBe(20);
      expect(options.experienceMultiplier).toBe(2.0);
    });

    it('should respect disabled features', async () => {
      const disabledManager = new UserProfileManager({
        enableStatistics: false,
        enableSocialFeatures: false,
        enableAchievements: false
      });

      await disabledManager.createProfile(testUserId);

      // Statistics should not be recorded
      disabledManager.recordGameResult({
        gameMode: 'classic',
        mapName: 'test_map',
        role: 'hider',
        result: 'won',
        duration: 300000,
        playersCount: 8
      });

      const profile = disabledManager.getProfile();
      expect(profile!.statistics.gamesPlayed).toBe(0);

      // Social features should not work
      const friendResult = await disabledManager.sendFriendRequest('friend_123');
      expect(friendResult.success).toBe(false);

      await disabledManager.dispose();
    });
  });

  describe('Cleanup', () => {
    it('should save profile on dispose', async () => {
      await profileManager.createProfile(testUserId);
      profileManager.updateProfile({ displayName: 'Dispose Test' });
      
      await profileManager.dispose();
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `hideSeekProfile_${testUserId}`,
        expect.stringContaining('Dispose Test')
      );
    });

    it('should clear intervals and callbacks on dispose', async () => {
      await profileManager.createProfile(testUserId);
      
      const callback = jest.fn();
      profileManager.addEventListener('test', callback);
      
      await profileManager.dispose();
      
      // Profile should be cleared
      expect(profileManager.getProfile()).toBeNull();
    });
  });
});