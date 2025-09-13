import {
    validateUser,
    validateUserProfile,
    validateInventoryItem,
    validatePlayerStats,
    validateUserPreferences,
    validatePlayer,
    validateGameState,
    validateGameSettings,
    validateGameSession,
    validateGameEvent,
    isValidEmail,
    isValidUsername,
    isValidId,
    isValidDate,
    isValidVector3
} from '../validation'; import {
    User, Player, UserProfile, InventoryItem, PlayerStats, UserPreferences
} from '../../types';

describe('Validation Utils', () => {
    describe('Helper Functions', () => {
        describe('isValidEmail', () => {
            it('should validate correct email addresses', () => {
                expect(isValidEmail('test@example.com')).toBe(true);
                expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
            });

            it('should reject invalid email addresses', () => {
                expect(isValidEmail('invalid-email')).toBe(false);
                expect(isValidEmail('test@')).toBe(false);
                expect(isValidEmail('@domain.com')).toBe(false);
            });
        });

        describe('isValidUsername', () => {
            it('should validate correct usernames', () => {
                expect(isValidUsername('user123')).toBe(true);
                expect(isValidUsername('test_user')).toBe(true);
                expect(isValidUsername('player-1')).toBe(true);
            });

            it('should reject invalid usernames', () => {
                expect(isValidUsername('ab')).toBe(false); // too short
                expect(isValidUsername('a'.repeat(21))).toBe(false); // too long
                expect(isValidUsername('user@name')).toBe(false); // invalid characters
            });
        });
    });

    describe('validateUser', () => {
        const validUser: User = {
            id: 'user123',
            username: 'testuser',
            email: 'test@example.com',
            createdAt: new Date(),
            lastActive: new Date(),
            profile: {
                displayName: 'Test User',
                avatar: 'avatar1',
                level: 5,
                experience: 1000,
                title: 'Beginner'
            },
            statistics: {
                gamesPlayed: 10,
                gamesWon: 5,
                totalHideTime: 3600,
                totalSeekTime: 1800,
                successfulHides: 8,
                successfulFinds: 12,
                averageHideTime: 360,
                bestHidingSpot: 'Behind the tree'
            },
            preferences: {
                voiceChatEnabled: true,
                textChatEnabled: true,
                arModeEnabled: false,
                soundEffectsVolume: 0.8,
                musicVolume: 0.6,
                language: 'en',
                autoMatchmaking: true
            },
            inventory: []
        };

        it('should validate a correct user', () => {
            const result = validateUser(validUser);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject user with invalid email', () => {
            const invalidUser = { ...validUser, email: 'invalid-email' };
            const result = validateUser(invalidUser);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Email must be a valid email address');
        });
    });
});