import { CommunicationManager } from '../CommunicationManager';
import { Player } from '../../types';

// Mock WebRTC APIs
Object.defineProperty(window, 'RTCPeerConnection', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    addTrack: jest.fn(),
    createOffer: jest.fn().mockResolvedValue({}),
    createAnswer: jest.fn().mockResolvedValue({}),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    ontrack: null,
    onconnectionstatechange: null,
    onicecandidate: null,
    connectionState: 'connected'
  }))
});

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: jest.fn().mockReturnValue([{
        stop: jest.fn()
      }])
    })
  }
});

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    createMediaStreamSource: jest.fn().mockReturnValue({
      connect: jest.fn()
    }),
    createAnalyser: jest.fn().mockReturnValue({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: jest.fn()
    }),
    close: jest.fn().mockResolvedValue(undefined)
  }))
});

describe('CommunicationManager', () => {
  let communicationManager: CommunicationManager;
  let mockPlayer: Player;

  beforeEach(() => {
    communicationManager = new CommunicationManager();
    
    mockPlayer = {
      id: 'player1',
      username: 'TestPlayer',
      role: 'hider',
      position: { x: 0, y: 0, z: 0 },
      avatar: { model: 'default', skin: 'default', accessories: [] },
      camouflageState: { isActive: false, restrictions: [] }
    };
  });

  afterEach(() => {
    communicationManager.dispose();
  });

  describe('constructor', () => {
    it('should create CommunicationManager with default options', () => {
      expect(communicationManager).toBeInstanceOf(CommunicationManager);
    });

    it('should create CommunicationManager with custom options', () => {
      const options = {
        enableTextChat: true,
        enableVoiceChat: false,
        textChat: { maxMessageLength: 150 }
      };
      
      const manager = new CommunicationManager(options);
      expect(manager).toBeInstanceOf(CommunicationManager);
      manager.dispose();
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await communicationManager.initialize();
      expect(result).toBe(true);
    });

    it('should handle initialization with voice chat disabled', async () => {
      const manager = new CommunicationManager({ enableVoiceChat: false });
      const result = await manager.initialize();
      expect(result).toBe(true);
      manager.dispose();
    });
  });

  describe('player management', () => {
    it('should register players', () => {
      communicationManager.registerPlayer(mockPlayer);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state).toBeDefined();
      expect(state?.playerId).toBe(mockPlayer.id);
      expect(state?.playerName).toBe(mockPlayer.username);
    });

    it('should unregister players', () => {
      communicationManager.registerPlayer(mockPlayer);
      communicationManager.unregisterPlayer(mockPlayer.id);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state).toBeNull();
    });

    it('should auto-join global channels on registration', () => {
      communicationManager.registerPlayer(mockPlayer);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.textChannels).toContain('global');
      expect(state?.voiceChannels).toContain('voice-global');
    });
  });

  describe('text chat functionality', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should send text messages', async () => {
      const result = await communicationManager.sendTextMessage(
        mockPlayer.id,
        'Hello everyone!'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message?.content).toBe('Hello everyone!');
    });

    it('should send whispers', async () => {
      const player2: Player = {
        ...mockPlayer,
        id: 'player2',
        username: 'TestPlayer2'
      };
      
      communicationManager.registerPlayer(player2);
      
      const result = await communicationManager.sendWhisper(
        mockPlayer.id,
        player2.id,
        'Secret message'
      );

      expect(result.success).toBe(true);
      expect(result.message?.type).toBe('whisper');
    });

    it('should handle text chat disabled', async () => {
      const manager = new CommunicationManager({ enableTextChat: false });
      manager.registerPlayer(mockPlayer);
      
      const result = await manager.sendTextMessage(mockPlayer.id, 'Hello');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      
      manager.dispose();
    });

    it('should join and leave text channels', () => {
      const joinResult = communicationManager.joinTextChannel(mockPlayer.id, 'team-hiders');
      expect(joinResult).toBe(true);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.textChannels).toContain('team-hiders');
      
      const leaveResult = communicationManager.leaveTextChannel(mockPlayer.id, 'team-hiders');
      expect(leaveResult).toBe(true);
    });
  });

  describe('voice chat functionality', () => {
    beforeEach(async () => {
      communicationManager.registerPlayer(mockPlayer);
      await communicationManager.initialize();
    });

    it('should enable microphone', async () => {
      const result = await communicationManager.enableMicrophone();
      expect(result).toBe(true);
    });

    it('should disable microphone', async () => {
      await communicationManager.enableMicrophone();
      
      communicationManager.disableMicrophone();
      
      // Should not throw
      expect(() => {
        communicationManager.disableMicrophone();
      }).not.toThrow();
    });

    it('should connect to player voice', async () => {
      const micResult = await communicationManager.enableMicrophone();
      expect(micResult).toBe(true);
      
      const result = await communicationManager.connectToPlayerVoice(
        'player2',
        'voice-global',
        true
      );
      
      expect(typeof result).toBe('boolean');
    });

    it('should join and leave voice channels', () => {
      const joinResult = communicationManager.joinVoiceChannel(mockPlayer.id, 'voice-team-hiders');
      expect(joinResult).toBe(true);
      
      const leaveResult = communicationManager.leaveVoiceChannel(mockPlayer.id, 'voice-team-hiders');
      expect(leaveResult).toBe(true);
    });

    it('should handle voice chat disabled', async () => {
      const manager = new CommunicationManager({ enableVoiceChat: false });
      manager.registerPlayer(mockPlayer);
      
      const result = await manager.enableMicrophone();
      expect(result).toBe(false);
      
      manager.dispose();
    });
  });

  describe('WebRTC signaling', () => {
    beforeEach(async () => {
      communicationManager.registerPlayer(mockPlayer);
      await communicationManager.initialize();
      await communicationManager.enableMicrophone();
    });

    it('should handle voice offers', async () => {
      await communicationManager.connectToPlayerVoice('player2', 'voice-global', false);
      
      const offer = { type: 'offer' as RTCSdpType, sdp: 'mock-sdp' };
      
      await expect(
        communicationManager.handleVoiceOffer('player2', offer)
      ).resolves.not.toThrow();
    });

    it('should handle voice answers', async () => {
      await communicationManager.connectToPlayerVoice('player2', 'voice-global', true);
      
      const answer = { type: 'answer' as RTCSdpType, sdp: 'mock-sdp' };
      
      await expect(
        communicationManager.handleVoiceAnswer('player2', answer)
      ).resolves.not.toThrow();
    });

    it('should handle ICE candidates', async () => {
      await communicationManager.connectToPlayerVoice('player2', 'voice-global', false);
      
      const candidate = {
        candidate: 'mock-candidate',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };
      
      await expect(
        communicationManager.handleIceCandidate('player2', candidate)
      ).resolves.not.toThrow();
    });
  });

  describe('moderation', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should mute and unmute text chat', () => {
      communicationManager.mutePlayerText(mockPlayer.id);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.isMuted).toBe(true);
      
      communicationManager.unmutePlayerText(mockPlayer.id);
      expect(state?.isMuted).toBe(false);
    });

    it('should mute and unmute voice chat', () => {
      communicationManager.mutePlayerVoice(mockPlayer.id);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.isVoiceMuted).toBe(true);
      
      communicationManager.unmutePlayerVoice(mockPlayer.id);
      expect(state?.isVoiceMuted).toBe(false);
    });

    it('should handle mutes and unmutes', () => {
      communicationManager.mutePlayerText(mockPlayer.id);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.isMuted).toBe(true);
      
      communicationManager.unmutePlayerText(mockPlayer.id);
      const updatedState = communicationManager.getPlayerState(mockPlayer.id);
      expect(updatedState?.isMuted).toBe(false);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should get all player states', () => {
      const states = communicationManager.getAllPlayerStates();
      expect(states).toHaveLength(1);
      expect(states[0].playerId).toBe(mockPlayer.id);
    });

    it('should get text channels', () => {
      const channels = communicationManager.getTextChannels();
      expect(channels.length).toBeGreaterThan(0);
      
      const globalChannel = channels.find(c => c.id === 'global');
      expect(globalChannel).toBeDefined();
    });

    it('should get voice channels', () => {
      const channels = communicationManager.getVoiceChannels();
      expect(channels.length).toBeGreaterThan(0);
      
      const globalVoiceChannel = channels.find(c => c.id === 'voice-global');
      expect(globalVoiceChannel).toBeDefined();
    });

    it('should get message history', async () => {
      await communicationManager.sendTextMessage(mockPlayer.id, 'Test message');
      
      const history = communicationManager.getMessageHistory('global');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Test message');
    });

    it('should get voice connections', () => {
      const connections = communicationManager.getVoiceConnections();
      expect(Array.isArray(connections)).toBe(true);
    });

    it('should get event history', async () => {
      const manager = new CommunicationManager({ enableActivityLogging: true });
      manager.registerPlayer(mockPlayer);
      
      await manager.sendTextMessage(mockPlayer.id, 'Test message');
      
      const events = manager.getEventHistory();
      expect(events.length).toBeGreaterThan(0);
      
      manager.dispose();
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should provide comprehensive statistics', async () => {
      await communicationManager.sendTextMessage(mockPlayer.id, 'Test message');
      
      const stats = communicationManager.getStatistics();
      
      expect(stats.totalPlayers).toBe(1);
      expect(stats.textChannels).toBeGreaterThanOrEqual(0);
      expect(stats.voiceChannels).toBeGreaterThanOrEqual(0);
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.activeVoiceConnections).toBe(0);
      expect(stats.mutedPlayers).toBe(0);
    });
  });

  describe('event system', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should add and remove event listeners', () => {
      const callback = jest.fn();
      
      communicationManager.addEventListener('player_joined_text_channel', callback);
      communicationManager.removeEventListener('player_joined_text_channel', callback);
      
      // Should not throw
      expect(() => {
        communicationManager.addEventListener('test_event', callback);
      }).not.toThrow();
    });

    it('should emit events for player registration', () => {
      const callback = jest.fn();
      communicationManager.addEventListener('player_registered', callback);
      
      const player2 = { ...mockPlayer, id: 'player2', username: 'Player2' };
      communicationManager.registerPlayer(player2);
      
      expect(callback).toHaveBeenCalled();
    });

    it('should emit events for messages', async () => {
      const callback = jest.fn();
      communicationManager.addEventListener('text_message', callback);
      
      await communicationManager.sendTextMessage(mockPlayer.id, 'Test message');
      
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('configuration updates', () => {
    it('should update text chat options', () => {
      const newOptions = {
        maxMessageLength: 150,
        enableProfanityFilter: false
      };
      
      communicationManager.updateTextChatOptions(newOptions);
      
      // Should not throw
      expect(() => {
        communicationManager.updateTextChatOptions(newOptions);
      }).not.toThrow();
    });

    it('should update voice chat options', () => {
      const newOptions = {
        enableNoiseSuppression: false,
        enableEchoCancellation: true
      };
      
      communicationManager.updateVoiceChatOptions(newOptions);
      
      // Should not throw
      expect(() => {
        communicationManager.updateVoiceChatOptions(newOptions);
      }).not.toThrow();
    });
  });

  describe('cleanup and disposal', () => {
    beforeEach(() => {
      communicationManager.registerPlayer(mockPlayer);
    });

    it('should clear all data on dispose', () => {
      communicationManager.dispose();
      
      const states = communicationManager.getAllPlayerStates();
      expect(states).toHaveLength(0);
    });

    it('should dispose resources properly', () => {
      communicationManager.dispose();
      
      // Should not throw when called multiple times
      expect(() => {
        communicationManager.dispose();
      }).not.toThrow();
    });

    it('should handle disposal with active voice connections', async () => {
      await communicationManager.initialize();
      await communicationManager.enableMicrophone();
      await communicationManager.connectToPlayerVoice('player2', 'voice-global', true);
      
      expect(() => {
        communicationManager.dispose();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid player operations gracefully', async () => {
      const result = await communicationManager.sendTextMessage('invalid-player', 'Hello');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should handle invalid channel operations gracefully', () => {
      communicationManager.registerPlayer(mockPlayer);
      
      const result = communicationManager.joinTextChannel(mockPlayer.id, 'invalid-channel');
      expect(result).toBe(false);
    });

    it('should handle WebRTC errors gracefully', async () => {
      // Mock getUserMedia to fail
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied')
      );
      
      const result = await communicationManager.enableMicrophone();
      expect(result).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete communication workflow', async () => {
      // Initialize
      await communicationManager.initialize();
      
      // Register players
      const player2: Player = {
        ...mockPlayer,
        id: 'player2',
        username: 'TestPlayer2'
      };
      
      communicationManager.registerPlayer(mockPlayer);
      communicationManager.registerPlayer(player2);
      
      // Enable voice
      await communicationManager.enableMicrophone();
      
      // Send messages
      const textResult = await communicationManager.sendTextMessage(
        mockPlayer.id,
        'Hello everyone!'
      );
      expect(textResult.success).toBe(true);
      
      // Send whisper
      const whisperResult = await communicationManager.sendWhisper(
        mockPlayer.id,
        player2.id,
        'Secret message'
      );
      expect(whisperResult.success).toBe(true);
      
      // Join voice channel
      const voiceResult = communicationManager.joinVoiceChannel(
        mockPlayer.id,
        'voice-team-hiders'
      );
      expect(voiceResult).toBe(true);
      
      // Get statistics
      const stats = communicationManager.getStatistics();
      expect(stats.totalPlayers).toBe(2);
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    it('should handle game state transitions', () => {
      communicationManager.registerPlayer(mockPlayer);
      
      // Simulate game start - restrict communication
      communicationManager.mutePlayerText(mockPlayer.id);
      communicationManager.mutePlayerVoice(mockPlayer.id);
      
      const state = communicationManager.getPlayerState(mockPlayer.id);
      expect(state?.isMuted).toBe(true);
      expect(state?.isVoiceMuted).toBe(true);
      
      // Simulate game end - restore communication
      communicationManager.unmutePlayerText(mockPlayer.id);
      communicationManager.unmutePlayerVoice(mockPlayer.id);
      
      expect(state?.isMuted).toBe(false);
      expect(state?.isVoiceMuted).toBe(false);
    });
  });
});