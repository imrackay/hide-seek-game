import { Player } from '../types';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system' | 'whisper' | 'team';
  targetId?: string; // For whispers or team messages
  isModerated?: boolean;
  originalContent?: string; // Before moderation
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'global' | 'team' | 'proximity' | 'private';
  participants: string[];
  maxParticipants?: number;
  isActive: boolean;
  createdAt: number;
}

export interface TextChatOptions {
  enableProfanityFilter?: boolean;
  enableSpamProtection?: boolean;
  maxMessageLength?: number;
  maxMessagesPerMinute?: number;
  enableMessageHistory?: boolean;
  maxHistorySize?: number;
  enableWhispers?: boolean;
  enableTeamChat?: boolean;
}

export class TextChatManager {
  private options: Required<TextChatOptions>;
  private channels: Map<string, ChatChannel> = new Map();
  private messageHistory: Map<string, ChatMessage[]> = new Map();
  private playerMessageCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private messageCallbacks: Map<string, Function[]> = new Map();
  private profanityWords: Set<string> = new Set();
  private mutedPlayers: Set<string> = new Set();

  constructor(options: TextChatOptions = {}) {
    this.options = {
      enableProfanityFilter: options.enableProfanityFilter !== false,
      enableSpamProtection: options.enableSpamProtection !== false,
      maxMessageLength: options.maxMessageLength || 200,
      maxMessagesPerMinute: options.maxMessagesPerMinute || 10,
      enableMessageHistory: options.enableMessageHistory !== false,
      maxHistorySize: options.maxHistorySize || 100,
      enableWhispers: options.enableWhispers !== false,
      enableTeamChat: options.enableTeamChat !== false
    };

    this.initializeProfanityFilter();
    this.createDefaultChannels();
  }

  private initializeProfanityFilter(): void {
    // Basic profanity words - in production, this would be more comprehensive
    const basicProfanity = [
      'damn', 'hell', 'stupid', 'idiot', 'noob', 'trash', 'suck', 'hate'
    ];
    
    basicProfanity.forEach(word => this.profanityWords.add(word.toLowerCase()));
  }

  private createDefaultChannels(): void {
    // Global channel
    this.createChannel({
      id: 'global',
      name: 'Global Chat',
      type: 'global',
      participants: [],
      isActive: true,
      createdAt: Date.now()
    });

    // Team channels
    if (this.options.enableTeamChat) {
      this.createChannel({
        id: 'team-hiders',
        name: 'Hiders Team',
        type: 'team',
        participants: [],
        isActive: true,
        createdAt: Date.now()
      });

      this.createChannel({
        id: 'team-seekers',
        name: 'Seekers Team',
        type: 'team',
        participants: [],
        isActive: true,
        createdAt: Date.now()
      });
    }
  }

  // Channel management
  createChannel(channelData: Omit<ChatChannel, 'id'> & { id?: string }): ChatChannel {
    const channel: ChatChannel = {
      id: channelData.id || this.generateChannelId(),
      name: channelData.name,
      type: channelData.type,
      participants: [...channelData.participants],
      maxParticipants: channelData.maxParticipants,
      isActive: channelData.isActive,
      createdAt: channelData.createdAt
    };

    this.channels.set(channel.id, channel);
    
    if (this.options.enableMessageHistory) {
      this.messageHistory.set(channel.id, []);
    }

    return channel;
  }

  private generateChannelId(): string {
    return `channel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  joinChannel(channelId: string, playerId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel || !channel.isActive) return false;

    if (channel.maxParticipants && channel.participants.length >= channel.maxParticipants) {
      return false;
    }

    if (!channel.participants.includes(playerId)) {
      channel.participants.push(playerId);
      this.emitChannelEvent('player_joined', { channelId, playerId });
    }

    return true;
  }

  leaveChannel(channelId: string, playerId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const index = channel.participants.indexOf(playerId);
    if (index !== -1) {
      channel.participants.splice(index, 1);
      this.emitChannelEvent('player_left', { channelId, playerId });
      return true;
    }

    return false;
  }

  // Message sending
  async sendMessage(
    senderId: string,
    senderName: string,
    content: string,
    channelId: string = 'global',
    type: ChatMessage['type'] = 'text',
    targetId?: string
  ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    // Validation checks
    const validationResult = this.validateMessage(senderId, content, channelId, type);
    if (!validationResult.valid) {
      return { success: false, error: validationResult.error };
    }

    // Content moderation
    const moderatedContent = this.moderateContent(content);
    const isModerated = moderatedContent !== content;

    // Create message
    const message: ChatMessage = {
      id: this.generateMessageId(),
      senderId,
      senderName,
      content: moderatedContent,
      timestamp: Date.now(),
      type,
      targetId,
      isModerated,
      originalContent: isModerated ? content : undefined
    };

    // Update spam protection
    this.updatePlayerMessageCount(senderId);

    // Store message in history
    if (this.options.enableMessageHistory) {
      this.addToHistory(channelId, message);
    }

    // Broadcast message
    this.broadcastMessage(message, channelId);

    return { success: true, message };
  }

  private validateMessage(
    senderId: string,
    content: string,
    channelId: string,
    type: ChatMessage['type']
  ): { valid: boolean; error?: string } {
    // Check if player is muted
    if (this.mutedPlayers.has(senderId)) {
      return { valid: false, error: 'You are muted and cannot send messages' };
    }

    // Check message length
    if (content.length > this.options.maxMessageLength) {
      return { valid: false, error: `Message too long (max ${this.options.maxMessageLength} characters)` };
    }

    // Check empty message
    if (content.trim().length === 0) {
      return { valid: false, error: 'Message cannot be empty' };
    }

    // Check channel exists
    const channel = this.channels.get(channelId);
    if (!channel || !channel.isActive) {
      return { valid: false, error: 'Channel not found or inactive' };
    }

    // Check if player is in channel
    if (!channel.participants.includes(senderId)) {
      return { valid: false, error: 'You are not in this channel' };
    }

    // Check whisper permissions
    if (type === 'whisper' && !this.options.enableWhispers) {
      return { valid: false, error: 'Whispers are disabled' };
    }

    // Check team chat permissions
    if (type === 'team' && !this.options.enableTeamChat) {
      return { valid: false, error: 'Team chat is disabled' };
    }

    // Check spam protection
    if (this.options.enableSpamProtection && this.isSpamming(senderId)) {
      return { valid: false, error: 'You are sending messages too quickly' };
    }

    return { valid: true };
  }

  private moderateContent(content: string): string {
    if (!this.options.enableProfanityFilter) return content;

    let moderatedContent = content;
    
    for (const word of this.profanityWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      moderatedContent = moderatedContent.replace(regex, '*'.repeat(word.length));
    }

    return moderatedContent;
  }

  private isSpamming(playerId: string): boolean {
    const playerData = this.playerMessageCounts.get(playerId);
    if (!playerData) return false;

    const now = Date.now();
    
    // Reset count if minute has passed
    if (now - playerData.resetTime >= 60000) {
      playerData.count = 0;
      playerData.resetTime = now;
      return false;
    }

    return playerData.count >= this.options.maxMessagesPerMinute;
  }

  private updatePlayerMessageCount(playerId: string): void {
    const now = Date.now();
    const playerData = this.playerMessageCounts.get(playerId);

    if (!playerData) {
      this.playerMessageCounts.set(playerId, { count: 1, resetTime: now });
    } else {
      if (now - playerData.resetTime >= 60000) {
        playerData.count = 1;
        playerData.resetTime = now;
      } else {
        playerData.count++;
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private addToHistory(channelId: string, message: ChatMessage): void {
    const history = this.messageHistory.get(channelId);
    if (!history) return;

    history.push(message);

    // Limit history size
    if (history.length > this.options.maxHistorySize) {
      history.splice(0, history.length - this.options.maxHistorySize);
    }
  }

  private broadcastMessage(message: ChatMessage, channelId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    // Determine recipients based on message type
    let recipients: string[] = [];

    switch (message.type) {
      case 'whisper':
        recipients = message.targetId ? [message.targetId, message.senderId] : [];
        break;
      case 'team':
        recipients = channel.participants.filter(id => id !== message.senderId);
        break;
      default:
        recipients = channel.participants;
        break;
    }

    // Emit message to callbacks
    this.emitMessageEvent('message_sent', {
      message,
      channelId,
      recipients
    });
  }

  // System messages
  sendSystemMessage(content: string, channelId: string = 'global'): void {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      senderId: 'system',
      senderName: 'System',
      content,
      timestamp: Date.now(),
      type: 'system'
    };

    if (this.options.enableMessageHistory) {
      this.addToHistory(channelId, message);
    }

    this.broadcastMessage(message, channelId);
  }

  // Whisper functionality
  async sendWhisper(
    senderId: string,
    senderName: string,
    targetId: string,
    content: string
  ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    if (!this.options.enableWhispers) {
      return { success: false, error: 'Whispers are disabled' };
    }

    // Create private channel for whisper if it doesn't exist
    const whisperChannelId = this.getOrCreateWhisperChannel(senderId, targetId);
    
    return this.sendMessage(senderId, senderName, content, whisperChannelId, 'whisper', targetId);
  }

  private getOrCreateWhisperChannel(playerId1: string, playerId2: string): string {
    const channelId = `whisper_${[playerId1, playerId2].sort().join('_')}`;
    
    if (!this.channels.has(channelId)) {
      this.createChannel({
        id: channelId,
        name: `Whisper: ${playerId1} & ${playerId2}`,
        type: 'private',
        participants: [playerId1, playerId2],
        maxParticipants: 2,
        isActive: true,
        createdAt: Date.now()
      });
    }

    return channelId;
  }

  // Message history
  getMessageHistory(channelId: string, limit?: number): ChatMessage[] {
    const history = this.messageHistory.get(channelId) || [];
    
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    
    return [...history];
  }

  getRecentMessages(channelId: string, timeWindow: number = 300000): ChatMessage[] {
    const history = this.messageHistory.get(channelId) || [];
    const cutoff = Date.now() - timeWindow;
    
    return history.filter(message => message.timestamp >= cutoff);
  }

  // Moderation
  mutePlayer(playerId: string, duration?: number): void {
    this.mutedPlayers.add(playerId);
    
    if (duration && duration > 0) {
      setTimeout(() => {
        this.unmutePlayer(playerId);
      }, duration);
    }

    this.sendSystemMessage(`Player ${playerId} has been muted`, 'global');
  }

  unmutePlayer(playerId: string): void {
    this.mutedPlayers.delete(playerId);
    this.sendSystemMessage(`Player ${playerId} has been unmuted`, 'global');
  }

  isPlayerMuted(playerId: string): boolean {
    return this.mutedPlayers.has(playerId);
  }

  addProfanityWord(word: string): void {
    this.profanityWords.add(word.toLowerCase());
  }

  removeProfanityWord(word: string): void {
    this.profanityWords.delete(word.toLowerCase());
  }

  // Query methods
  getChannel(channelId: string): ChatChannel | null {
    return this.channels.get(channelId) || null;
  }

  getChannelsByType(type: ChatChannel['type']): ChatChannel[] {
    return Array.from(this.channels.values()).filter(channel => channel.type === type);
  }

  getPlayerChannels(playerId: string): ChatChannel[] {
    return Array.from(this.channels.values()).filter(channel => 
      channel.participants.includes(playerId)
    );
  }

  getAllChannels(): ChatChannel[] {
    return Array.from(this.channels.values());
  }

  // Event system
  addMessageCallback(event: string, callback: Function): void {
    if (!this.messageCallbacks.has(event)) {
      this.messageCallbacks.set(event, []);
    }
    this.messageCallbacks.get(event)!.push(callback);
  }

  removeMessageCallback(event: string, callback: Function): void {
    const callbacks = this.messageCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitMessageEvent(event: string, data: any): void {
    const callbacks = this.messageCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Message callback error:', error);
      }
    });
  }

  private emitChannelEvent(event: string, data: any): void {
    const callbacks = this.messageCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Channel callback error:', error);
      }
    });
  }

  // Statistics
  getStatistics(): {
    totalChannels: number;
    activeChannels: number;
    totalMessages: number;
    mutedPlayers: number;
    messagesPerChannel: Record<string, number>;
  } {
    const activeChannels = Array.from(this.channels.values()).filter(c => c.isActive).length;
    let totalMessages = 0;
    const messagesPerChannel: Record<string, number> = {};

    for (const [channelId, history] of this.messageHistory.entries()) {
      messagesPerChannel[channelId] = history.length;
      totalMessages += history.length;
    }

    return {
      totalChannels: this.channels.size,
      activeChannels,
      totalMessages,
      mutedPlayers: this.mutedPlayers.size,
      messagesPerChannel
    };
  }

  // Configuration updates
  updateOptions(newOptions: Partial<TextChatOptions>): void {
    Object.assign(this.options, newOptions);
  }

  getOptions(): TextChatOptions {
    return { ...this.options };
  }

  // Cleanup
  clearHistory(channelId?: string): void {
    if (channelId) {
      const history = this.messageHistory.get(channelId);
      if (history) {
        history.length = 0;
      }
    } else {
      for (const history of this.messageHistory.values()) {
        history.length = 0;
      }
    }
  }

  dispose(): void {
    this.channels.clear();
    this.messageHistory.clear();
    this.playerMessageCounts.clear();
    this.messageCallbacks.clear();
    this.mutedPlayers.clear();
    this.profanityWords.clear();
  }
}