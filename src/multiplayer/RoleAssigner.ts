import { Player } from '@/types';
import { PlayerManager } from './PlayerManager';

export interface RoleAssignmentConfig {
  seekerRatio: number; // Ratio of seekers to total players (0.0 to 1.0)
  minSeekers: number;
  maxSeekers: number;
  autoAssign: boolean;
  allowRoleSwitch: boolean;
}

export interface RoleAssignmentResult {
  seekers: string[]; // Player IDs
  hiders: string[]; // Player IDs
  success: boolean;
  message?: string;
}

export class RoleAssigner {
  private playerManager: PlayerManager;
  private config: RoleAssignmentConfig;
  private assignedRoles: Map<string, 'hider' | 'seeker'> = new Map();

  constructor(playerManager: PlayerManager, config?: Partial<RoleAssignmentConfig>) {
    this.playerManager = playerManager;
    this.config = {
      seekerRatio: 0.2, // 20% seekers by default
      minSeekers: 1,
      maxSeekers: 3,
      autoAssign: true,
      allowRoleSwitch: true,
      ...config
    };
  }

  public updateConfig(config: Partial<RoleAssignmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): RoleAssignmentConfig {
    return { ...this.config };
  }

  public assignRoles(): RoleAssignmentResult {
    const players = this.playerManager.getAllPlayers();
    
    if (players.length === 0) {
      return {
        seekers: [],
        hiders: [],
        success: false,
        message: 'No players to assign roles to'
      };
    }

    const totalPlayers = players.length;
    const idealSeekers = Math.max(
      this.config.minSeekers,
      Math.min(
        this.config.maxSeekers,
        Math.ceil(totalPlayers * this.config.seekerRatio)
      )
    );

    // If we don't have enough players for minimum seekers
    if (totalPlayers < this.config.minSeekers + 1) {
      return {
        seekers: [],
        hiders: [],
        success: false,
        message: `Need at least ${this.config.minSeekers + 1} players to start the game`
      };
    }

    const seekerIds = this.selectSeekers(players, idealSeekers);
    const hiderIds = players
      .filter(player => !seekerIds.includes(player.id))
      .map(player => player.id);

    // Apply role assignments
    this.applyRoleAssignments(seekerIds, hiderIds);

    return {
      seekers: seekerIds,
      hiders: hiderIds,
      success: true,
      message: `Assigned ${seekerIds.length} seekers and ${hiderIds.length} hiders`
    };
  }

  private selectSeekers(players: Player[], targetCount: number): string[] {
    const availablePlayers = [...players];
    const seekerIds: string[] = [];

    // Strategy 1: Try to balance based on previous games (if we had that data)
    // For now, we'll use random selection with some preferences

    // Prefer players who haven't been seekers recently (if we track that)
    // For now, just random selection
    while (seekerIds.length < targetCount && availablePlayers.length > 0) {
      const randomIndex = Math.floor(Math.random() * availablePlayers.length);
      const selectedPlayer = availablePlayers.splice(randomIndex, 1)[0];
      seekerIds.push(selectedPlayer.id);
    }

    return seekerIds;
  }

  private applyRoleAssignments(seekerIds: string[], hiderIds: string[]): void {
    // Assign seeker roles
    for (const playerId of seekerIds) {
      this.assignedRoles.set(playerId, 'seeker');
      this.playerManager.assignPlayerRole(playerId, 'seeker');
    }

    // Assign hider roles
    for (const playerId of hiderIds) {
      this.assignedRoles.set(playerId, 'hider');
      this.playerManager.assignPlayerRole(playerId, 'hider');
    }
  }

  public assignSpecificRole(playerId: string, role: 'hider' | 'seeker'): boolean {
    if (!this.config.allowRoleSwitch) {
      console.warn('Role switching is disabled');
      return false;
    }

    const player = this.playerManager.getPlayer(playerId);
    if (!player) {
      console.warn(`Player ${playerId} not found`);
      return false;
    }

    // Check if this assignment would violate constraints
    if (role === 'seeker') {
      const currentSeekers = this.getCurrentSeekers();
      if (currentSeekers.length >= this.config.maxSeekers && !currentSeekers.includes(playerId)) {
        console.warn('Maximum number of seekers reached');
        return false;
      }
    } else {
      const currentSeekers = this.getCurrentSeekers();
      if (currentSeekers.length <= this.config.minSeekers && currentSeekers.includes(playerId)) {
        console.warn('Cannot reduce seekers below minimum');
        return false;
      }
    }

    this.assignedRoles.set(playerId, role);
    this.playerManager.assignPlayerRole(playerId, role);
    return true;
  }

  public swapPlayerRoles(playerId1: string, playerId2: string): boolean {
    if (!this.config.allowRoleSwitch) {
      console.warn('Role switching is disabled');
      return false;
    }

    const player1 = this.playerManager.getPlayer(playerId1);
    const player2 = this.playerManager.getPlayer(playerId2);

    if (!player1 || !player2) {
      console.warn('One or both players not found');
      return false;
    }

    const role1 = this.assignedRoles.get(playerId1) || player1.role;
    const role2 = this.assignedRoles.get(playerId2) || player2.role;

    if (role1 === role2) {
      console.warn('Players already have the same role');
      return false;
    }

    // Swap roles
    this.assignedRoles.set(playerId1, role2);
    this.assignedRoles.set(playerId2, role1);
    
    this.playerManager.assignPlayerRole(playerId1, role2);
    this.playerManager.assignPlayerRole(playerId2, role1);

    return true;
  }

  public getCurrentSeekers(): string[] {
    return this.playerManager.getPlayersByRole('seeker').map(player => player.id);
  }

  public getCurrentHiders(): string[] {
    return this.playerManager.getPlayersByRole('hider').map(player => player.id);
  }

  public getPlayerRole(playerId: string): 'hider' | 'seeker' | null {
    return this.assignedRoles.get(playerId) || null;
  }

  public isBalanced(): boolean {
    const seekers = this.getCurrentSeekers();
    const hiders = this.getCurrentHiders();
    const totalPlayers = seekers.length + hiders.length;

    if (totalPlayers === 0) return true;

    return (
      seekers.length >= this.config.minSeekers &&
      seekers.length <= this.config.maxSeekers &&
      hiders.length >= 1 // Need at least one hider
    );
  }

  public getRecommendedRoleCount(totalPlayers: number): { seekers: number; hiders: number } {
    if (totalPlayers === 0) {
      return { seekers: 0, hiders: 0 };
    }

    const idealSeekers = Math.max(
      this.config.minSeekers,
      Math.min(
        this.config.maxSeekers,
        Math.ceil(totalPlayers * this.config.seekerRatio)
      )
    );

    return {
      seekers: idealSeekers,
      hiders: totalPlayers - idealSeekers
    };
  }

  public autoRebalance(): RoleAssignmentResult {
    if (!this.config.autoAssign) {
      return {
        seekers: this.getCurrentSeekers(),
        hiders: this.getCurrentHiders(),
        success: false,
        message: 'Auto-assignment is disabled'
      };
    }

    return this.assignRoles();
  }

  // Handle player leaving - rebalance if necessary
  public handlePlayerLeft(playerId: string): void {
    this.assignedRoles.delete(playerId);

    if (this.config.autoAssign && !this.isBalanced()) {
      console.log('Rebalancing roles after player left');
      this.autoRebalance();
    }
  }

  // Handle player joining - assign role if auto-assign is enabled
  public handlePlayerJoined(playerId: string): void {
    if (!this.config.autoAssign) return;

    const currentSeekers = this.getCurrentSeekers();
    const currentHiders = this.getCurrentHiders();
    const totalPlayers = currentSeekers.length + currentHiders.length + 1; // +1 for new player

    const recommended = this.getRecommendedRoleCount(totalPlayers);
    
    // Assign role based on what's needed
    if (currentSeekers.length < recommended.seekers) {
      this.assignSpecificRole(playerId, 'seeker');
    } else {
      this.assignSpecificRole(playerId, 'hider');
    }
  }

  public getRoleAssignmentSummary(): {
    totalPlayers: number;
    seekers: number;
    hiders: number;
    isBalanced: boolean;
    recommended: { seekers: number; hiders: number };
  } {
    const seekers = this.getCurrentSeekers();
    const hiders = this.getCurrentHiders();
    const totalPlayers = seekers.length + hiders.length;
    const recommended = this.getRecommendedRoleCount(totalPlayers);

    return {
      totalPlayers,
      seekers: seekers.length,
      hiders: hiders.length,
      isBalanced: this.isBalanced(),
      recommended
    };
  }

  public dispose(): void {
    this.assignedRoles.clear();
  }
}