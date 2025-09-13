import { TextChatManager, TextChatOptions, ChatMessage } from '../TextChatManager';

describe('TextChatManager', () => {
  let textChatManager: TextChatManager;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    const options: TextChatOptions = {
      enableProfanityFilter: true,
      enableSpamProtection: true,
      maxMessageLength: 100,
      maxMessagesPerMinute: 5,
      enableMessageHistory: true,
      maxHistorySize: 50,
      enableWhispers: true,
      enableTeamChat: true
    };

    textChatManager = new TextChatManager(options);
    mockCallback = jest.fn();
  });

  afterEach(() => {
    textChatManager.dispose();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create TextChatManager instance', () => {
      expect(textChatManager).toBeInstanceOf(TextChatManager);
    });

    it('should create default channels', () => {
      const channels = textChatManager.getAllChannels();
      expect(channels.length).toBeGreaterThan(0);
      
      const globalChannel = channels.find(c => c.id === 'global');
      expect(globalChannel).toBeDefined();
      expect(globalChannel?.type).toBe('global');
    });

    it('should create team channels when enabled', () => {
      const channels = textChatManager.getAllChannels();
      
      const hiderChannel = channels.find(c => c.id === 'team-hiders');
      const seekerChannel = channels.find(c => c.id === 'team-seekers');
      
      expect(hiderChannel).toBeDefined();
      expect(seekerChannel).toBeDefined();
    });
  });

  describe('channel management', () => {
    it('should create custom channel', () => {
      const channel = textChatManager.createChannel({
        name: 'Test Channel',
        type: 'private',
        participants: [],
        isActive: true,
        createdAt: Date.now()
      });

      expect(channel).toBeDefined();
      expect(channel.name).toBe('Test Channel');
      expect(channel.type).toBe('private');
    });

    it('should join channel successfully', () => {
      const result = textChatManager.joinChannel('global', 'player1');
      expect(result).toBe(true);

      const channel = textChatManager.getChannel('global');
      expect(channel?.participants).toContain('player1');
    });

    it('should leave channel successfully', () => {
      textChatManager.joinChannel('global', 'player1');
      const result = textChatManager.leaveChannel('global', 'player1');
      
      expect(result).toBe(true);
      
      const channel = textChatManager.getChannel('global');
      expect(channel?.participants).not.toContain('player1');
    });

    it('should not join non-existent channel', () => {
      const result = textChatManager.joinChannel('non-existent', 'player1');
      expect(result).toBe(false);
    });
  });

  describe('message sending', () => {
    beforeEach(() => {
      textChatManager.joinChannel('global', 'player1');
    });

    it('should send message successfully', async () => {
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        'Hello world!',
        'global'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message?.content).toBe('Hello world!');
    });

    it('should reject empty message', async () => {
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        '',
        'global'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject message that is too long', async () => {
      const longMessage = 'a'.repeat(200);
      
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        longMessage,
        'global'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject message from player not in channel', async () => {
      const result = await textChatManager.sendMessage(
        'player2',
        'Player Two',
        'Hello!',
        'global'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in this channel');
    });
  });

  describe('content moderation', () => {
    beforeEach(() => {
      textChatManager.joinChannel('global', 'player1');
    });

    it('should filter profanity', async () => {
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        'You are stupid!',
        'global'
      );

      expect(result.success).toBe(true);
      expect(result.message?.content).toContain('*');
      expect(result.message?.isModerated).toBe(true);
      expect(result.message?.originalContent).toBe('You are stupid!');
    });

    it('should prevent spam', async () => {
      // Send maximum allowed messages
      for (let i = 0; i < 5; i++) {
        await textChatManager.sendMessage('player1', 'Player One', `Message ${i}`, 'global');
      }

      // Next message should be rejected
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        'Spam message',
        'global'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('too quickly');
    });

    it('should mute player', () => {
      textChatManager.mutePlayer('player1');
      expect(textChatManager.isPlayerMuted('player1')).toBe(true);
    });

    it('should reject message from muted player', async () => {
      textChatManager.mutePlayer('player1');
      
      const result = await textChatManager.sendMessage(
        'player1',
        'Player One',
        'Hello!',
        'global'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('muted');
    });

    it('should unmute player', () => {
      textChatManager.mutePlayer('player1');
      textChatManager.unmutePlayer('player1');
      expect(textChatManager.isPlayerMuted('player1')).toBe(false);
    });
  });

  describe('whisper functionality', () => {
    beforeEach(() => {
      textChatManager.joinChannel('global', 'player1');
      textChatManager.joinChannel('global', 'player2');
    });

    it('should send whisper successfully', async () => {
      const result = await textChatManager.sendWhisper(
        'player1',
        'Player One',
        'player2',
        'Secret message'
      );

      expect(result.success).toBe(true);
      expect(result.message?.type).toBe('whisper');
      expect(result.message?.targetId).toBe('player2');
    });

    it('should create whisper channel automatically', async () => {
      await textChatManager.sendWhisper('player1', 'Player One', 'player2', 'Hello');
      
      const channels = textChatManager.getAllChannels();
      const whisperChannel = channels.find(c => c.type === 'private' && c.name.includes('Whisper'));
      
      expect(whisperChannel).toBeDefined();
      expect(whisperChannel?.participants).toContain('player1');
      expect(whisperChannel?.participants).toContain('player2');
    });
  });

  describe('message history', () => {
    beforeEach(() => {
      textChatManager.joinChannel('global', 'player1');
    });

    it('should store message history', async () => {
      await textChatManager.sendMessage('player1', 'Player One', 'Message 1', 'global');
      await textChatManager.sendMessage('player1', 'Player One', 'Message 2', 'global');
      
      const history = textChatManager.getMessageHistory('global');
      expect(history.length).toBe(2);
      expect(history[0].content).toBe('Message 1');
      expect(history[1].content).toBe('Message 2');
    });

    it('should limit history size', async () => {
      // Send more messages than max history size
      for (let i = 0; i < 60; i++) {
        await textChatManager.sendMessage('player1', 'Player One', `Message ${i}`, 'global');
      }
      
      const history = textChatManager.getMessageHistory('global');
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('should get recent messages within time window', async () => {
      await textChatManager.sendMessage('player1', 'Player One', 'Old message', 'global');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await textChatManager.sendMessage('player1', 'Player One', 'New message', 'global');
      
      const recentMessages = textChatManager.getRecentMessages('global', 5); // 5ms window
      expect(recentMessages.length).toBe(1);
      expect(recentMessages[0].content).toBe('New message');
    });

    it('should clear history', async () => {
      await textChatManager.sendMessage('player1', 'Player One', 'Message', 'global');
      
      textChatManager.clearHistory('global');
      
      const history = textChatManager.getMessageHistory('global');
      expect(history.length).toBe(0);
    });
  });

  describe('system messages', () => {
    it('should send system message', () => {
      textChatManager.addMessageCallback('message_sent', mockCallback);
      
      textChatManager.sendSystemMessage('Server restart in 5 minutes');
      
      expect(mockCallback).toHaveBeenCalled();
      const callData = mockCallback.mock.calls[0][0];
      expect(callData.message.type).toBe('system');
      expect(callData.message.senderId).toBe('system');
      expect(callData.message.content).toBe('Server restart in 5 minutes');
    });
  });

  describe('event system', () => {
    it('should add and trigger message callback', async () => {
      textChatManager.addMessageCallback('message_sent', mockCallback);
      textChatManager.joinChannel('global', 'player1');
      
      await textChatManager.sendMessage('player1', 'Player One', 'Hello!', 'global');
      
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should remove message callback', async () => {
      textChatManager.addMessageCallback('message_sent', mockCallback);
      textChatManager.removeMessageCallback('message_sent', mockCallback);
      textChatManager.joinChannel('global', 'player1');
      
      await textChatManager.sendMessage('player1', 'Player One', 'Hello!', 'global');
      
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    it('should get statistics', async () => {
      textChatManager.joinChannel('global', 'player1');
      await textChatManager.sendMessage('player1', 'Player One', 'Hello!', 'global');
      textChatManager.mutePlayer('player2');
      
      const stats = textChatManager.getStatistics();
      
      expect(stats.totalChannels).toBeGreaterThan(0);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(1);
      expect(stats.mutedPlayers).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should update options', () => {
      const newOptions = { maxMessageLength: 150 };
      textChatManager.updateOptions(newOptions);
      
      const options = textChatManager.getOptions();
      expect(options.maxMessageLength).toBe(150);
    });

    it('should get current options', () => {
      const options = textChatManager.getOptions();
      expect(options).toBeDefined();
      expect(options.enableProfanityFilter).toBe(true);
    });
  });

  describe('query methods', () => {
    it('should get channels by type', () => {
      const globalChannels = textChatManager.getChannelsByType('global');
      expect(globalChannels.length).toBeGreaterThan(0);
      expect(globalChannels[0].type).toBe('global');
    });

    it('should get player channels', () => {
      textChatManager.joinChannel('global', 'player1');
      
      const playerChannels = textChatManager.getPlayerChannels('player1');
      expect(playerChannels.length).toBeGreaterThan(0);
      expect(playerChannels[0].participants).toContain('player1');
    });
  });
});