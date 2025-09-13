/**
 * @jest-environment jsdom
 */

import { RoleAssigner } from '../RoleAssigner';
import { Player } from '@/types';

// Mock PlayerManager
const mockPlayerManager = {
  getAllPlayers: jest.fn(),
  getPlayer: jest.fn(),
  getPlayersByRole: jest.fn(),
  assignPlayerRole: jest.fn(),
};

describe('RoleAssigner', () => {
  let roleAssigner: RoleAssigner;
  let mockPlayers: Player[];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPlayers = [
      {
        id: 'player1',
        username: 'user1',
        role: 'hider',
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      },
      {
        id: 'player2',
        username: 'user2',
        role: 'hider',
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      },
      {
        id: 'player3',
        username: 'user3',
        role: 'hider',
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      },
      {
        id: 'player4',
        username: 'user4',
        role: 'hider',
        position: { x: 0, y: 0, z: 0 },
        avatar: { model: 'default', skin: 'default', accessories: [] },
        camouflageState: { isActive: false, objectType: '', model: '', restrictions: [] }
      }
    ];

    mockPlayerManager.getAllPlayers.mockReturnValue(mockPlayers);
    mockPlayerManager.getPlayersByRole.mockImplementation((role) => 
      mockPlayers.filter(p => p.role === role)
    );
    mockPlayerManager.getPlayer.mockImplementation((id) => 
      mockPlayers.find(p => p.id === id) || null
    );

    roleAssigner = new RoleAssigner(mockPlayerManager as any);
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = roleAssigner.getConfig();
      expect(config).toEqual({
        seekerRatio: 0.2,
        minSeekers: 1,
        maxSeekers: 3,
        autoAssign: true,
        allowRoleSwitch: true
      });
    });

    it('should update configuration', () => {
      roleAssigner.updateConfig({ seekerRatio: 0.3, minSeekers: 2 });
      
      const config = roleAssigner.getConfig();
      expect(config.seekerRatio).toBe(0.3);
      expect(config.minSeekers).toBe(2);
      expect(config.maxSeekers).toBe(3); // unchanged
    });
  });

  describe('role assignment', () => {
    it('should assign roles successfully', () => {
      const result = roleAssigner.assignRoles();
      
      expect(result.success).toBe(true);
      expect(result.seekers.length).toBeGreaterThan(0);
      expect(result.hiders.length).toBeGreaterThan(0);
      expect(result.seekers.length + result.hiders.length).toBe(4);
      expect(mockPlayerManager.assignPlayerRole).toHaveBeenCalled();
    });

    it('should fail with no players', () => {
      mockPlayerManager.getAllPlayers.mockReturnValue([]);
      
      const result = roleAssigner.assignRoles();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No players');
    });

    it('should fail with insufficient players', () => {
      mockPlayerManager.getAllPlayers.mockReturnValue([mockPlayers[0]]);
      
      const result = roleAssigner.assignRoles();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Need at least');
    });

    it('should respect minimum seekers', () => {
      roleAssigner.updateConfig({ minSeekers: 2 });
      
      const result = roleAssigner.assignRoles();
      
      expect(result.success).toBe(true);
      expect(result.seekers.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect maximum seekers', () => {
      roleAssigner.updateConfig({ maxSeekers: 1 });
      
      const result = roleAssigner.assignRoles();
      
      expect(result.success).toBe(true);
      expect(result.seekers.length).toBeLessThanOrEqual(1);
    });
  });

  describe('specific role assignment', () => {
    beforeEach(() => {
      // Set up initial roles
      mockPlayers[0].role = 'seeker';
      mockPlayers[1].role = 'hider';
      mockPlayers[2].role = 'hider';
      mockPlayers[3].role = 'hider';
      
      mockPlayerManager.getPlayersByRole.mockImplementation((role) => 
        mockPlayers.filter(p => p.role === role)
      );
    });

    it('should assign specific role successfully', () => {
      const result = roleAssigner.assignSpecificRole('player2', 'seeker');
      
      expect(result).toBe(true);
      expect(mockPlayerManager.assignPlayerRole).toHaveBeenCalledWith('player2', 'seeker');
    });

    it('should fail when role switching is disabled', () => {
      roleAssigner.updateConfig({ allowRoleSwitch: false });
      
      const result = roleAssigner.assignSpecificRole('player2', 'seeker');
      
      expect(result).toBe(false);
    });

    it('should fail when exceeding max seekers', () => {
      roleAssigner.updateConfig({ maxSeekers: 1 });
      
      const result = roleAssigner.assignSpecificRole('player2', 'seeker');
      
      expect(result).toBe(false);
    });

    it('should fail when reducing below min seekers', () => {
      roleAssigner.updateConfig({ minSeekers: 1 });
      
      const result = roleAssigner.assignSpecificRole('player1', 'hider');
      
      expect(result).toBe(false);
    });

    it('should fail for non-existent player', () => {
      const result = roleAssigner.assignSpecificRole('nonexistent', 'seeker');
      
      expect(result).toBe(false);
    });
  });

  describe('role swapping', () => {
    beforeEach(() => {
      mockPlayers[0].role = 'seeker';
      mockPlayers[1].role = 'hider';
    });

    it('should swap roles successfully', () => {
      const result = roleAssigner.swapPlayerRoles('player1', 'player2');
      
      expect(result).toBe(true);
      expect(mockPlayerManager.assignPlayerRole).toHaveBeenCalledWith('player1', 'hider');
      expect(mockPlayerManager.assignPlayerRole).toHaveBeenCalledWith('player2', 'seeker');
    });

    it('should fail when role switching is disabled', () => {
      roleAssigner.updateConfig({ allowRoleSwitch: false });
      
      const result = roleAssigner.swapPlayerRoles('player1', 'player2');
      
      expect(result).toBe(false);
    });

    it('should fail when players have same role', () => {
      mockPlayers[1].role = 'seeker';
      
      const result = roleAssigner.swapPlayerRoles('player1', 'player2');
      
      expect(result).toBe(false);
    });

    it('should fail for non-existent players', () => {
      const result = roleAssigner.swapPlayerRoles('nonexistent1', 'nonexistent2');
      
      expect(result).toBe(false);
    });
  });

  describe('role queries', () => {
    beforeEach(() => {
      mockPlayers[0].role = 'seeker';
      mockPlayers[1].role = 'hider';
      mockPlayers[2].role = 'hider';
      mockPlayers[3].role = 'hider';
    });

    it('should get current seekers', () => {
      const seekers = roleAssigner.getCurrentSeekers();
      expect(seekers).toEqual(['player1']);
    });

    it('should get current hiders', () => {
      const hiders = roleAssigner.getCurrentHiders();
      expect(hiders).toEqual(['player2', 'player3', 'player4']);
    });

    it('should check if roles are balanced', () => {
      expect(roleAssigner.isBalanced()).toBe(true);
    });

    it('should detect unbalanced roles', () => {
      // Make all players seekers
      mockPlayers.forEach(p => p.role = 'seeker');
      mockPlayerManager.getPlayersByRole.mockImplementation((role) => 
        role === 'seeker' ? mockPlayers : []
      );
      
      expect(roleAssigner.isBalanced()).toBe(false);
    });
  });

  describe('recommendations', () => {
    it('should get recommended role count', () => {
      const recommended = roleAssigner.getRecommendedRoleCount(5);
      
      expect(recommended.seekers).toBeGreaterThan(0);
      expect(recommended.hiders).toBeGreaterThan(0);
      expect(recommended.seekers + recommended.hiders).toBe(5);
    });

    it('should handle zero players', () => {
      const recommended = roleAssigner.getRecommendedRoleCount(0);
      
      expect(recommended).toEqual({ seekers: 0, hiders: 0 });
    });
  });

  describe('auto-rebalancing', () => {
    it('should auto-rebalance when enabled', () => {
      const result = roleAssigner.autoRebalance();
      
      expect(result.success).toBe(true);
    });

    it('should not auto-rebalance when disabled', () => {
      roleAssigner.updateConfig({ autoAssign: false });
      
      const result = roleAssigner.autoRebalance();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('disabled');
    });
  });

  describe('player events', () => {
    it('should handle player leaving', () => {
      roleAssigner.assignRoles();
      
      expect(() => roleAssigner.handlePlayerLeft('player1')).not.toThrow();
    });

    it('should handle player joining', () => {
      expect(() => roleAssigner.handlePlayerJoined('newPlayer')).not.toThrow();
    });
  });

  describe('summary', () => {
    it('should provide role assignment summary', () => {
      mockPlayers[0].role = 'seeker';
      
      const summary = roleAssigner.getRoleAssignmentSummary();
      
      expect(summary).toEqual(expect.objectContaining({
        totalPlayers: 4,
        seekers: 1,
        hiders: 3,
        isBalanced: expect.any(Boolean),
        recommended: expect.objectContaining({
          seekers: expect.any(Number),
          hiders: expect.any(Number)
        })
      }));
    });
  });

  describe('disposal', () => {
    it('should dispose properly', () => {
      roleAssigner.assignRoles();
      
      expect(() => roleAssigner.dispose()).not.toThrow();
    });
  });
});