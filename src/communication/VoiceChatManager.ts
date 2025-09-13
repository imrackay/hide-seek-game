import { Player } from '../types';

export interface VoiceChannel {
  id: string;
  name: string;
  participants: Map<string, VoiceParticipant>;
  maxParticipants?: number;
  isActive: boolean;
  createdAt: number;
  settings: VoiceChannelSettings;
}

export interface VoiceParticipant {
  playerId: string;
  playerName: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  volume: number;
  joinedAt: number;
  connection?: RTCPeerConnection;
  stream?: MediaStream;
}

export interface VoiceChannelSettings {
  requirePushToTalk: boolean;
  defaultVolume: number;
  enableNoiseReduction: boolean;
  enableEchoCancellation: boolean;
  maxBitrate: number;
  codec: 'opus' | 'g722' | 'pcmu';
}

export interface VoiceChatOptions {
  enableVoiceChat?: boolean;
  enablePushToTalk?: boolean;
  defaultVolume?: number;
  enableNoiseReduction?: boolean;
  enableEchoCancellation?: boolean;
  maxParticipantsPerChannel?: number;
  enableVoiceActivation?: boolean;
  voiceActivationThreshold?: number;
  enableSpatialAudio?: boolean;
  maxTransmissionRange?: number;
}

export interface WebRTCSignalingData {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
  from: string;
  to: string;
  channelId: string;
}

export class VoiceChatManager {
  private options: Required<VoiceChatOptions>;
  private channels: Map<string, VoiceChannel> = new Map();
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private voiceCallbacks: Map<string, Function[]> = new Map();
  private isInitialized: boolean = false;
  private pushToTalkKey: string = 'KeyV';
  private isPushToTalkActive: boolean = false;
  private voiceActivationAnalyzer: AnalyserNode | null = null;
  private voiceActivationLevel: number = 0;
  private signalingCallback: ((data: WebRTCSignalingData) => void) | null = null;

  constructor(options: VoiceChatOptions = {}) {
    this.options = {
      enableVoiceChat: options.enableVoiceChat !== false,
      enablePushToTalk: options.enablePushToTalk !== false,
      defaultVolume: options.defaultVolume || 0.8,
      enableNoiseReduction: options.enableNoiseReduction !== false,
      enableEchoCancellation: options.enableEchoCancellation !== false,
      maxParticipantsPerChannel: options.maxParticipantsPerChannel || 20,
      enableVoiceActivation: options.enableVoiceActivation !== false,
      voiceActivationThreshold: options.voiceActivationThreshold || 0.1,
      enableSpatialAudio: options.enableSpatialAudio !== false,
      maxTransmissionRange: options.maxTransmissionRange || 50
    };
  }

  // Initialization
  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (this.isInitialized) {
      return { success: true };
    }

    if (!this.options.enableVoiceChat) {
      return { success: false, error: 'Voice chat is disabled' };
    }

    try {
      // Check WebRTC support
      if (!this.isWebRTCSupported()) {
        return { success: false, error: 'WebRTC is not supported in this browser' };
      }

      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Request microphone access
      const micResult = await this.requestMicrophoneAccess();
      if (!micResult.success) {
        return { success: false, error: micResult.error };
      }

      // Set up push-to-talk if enabled
      if (this.options.enablePushToTalk) {
        this.setupPushToTalk();
      }

      // Set up voice activation if enabled
      if (this.options.enableVoiceActivation) {
        this.setupVoiceActivation();
      }

      this.isInitialized = true;
      this.emitVoiceEvent('voice_chat_initialized', {});

      return { success: true };
    } catch (error) {
      console.error('Voice chat initialization failed:', error);
      return { success: false, error: 'Failed to initialize voice chat' };
    }
  }

  private isWebRTCSupported(): boolean {
    return !!(
      window.RTCPeerConnection &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
  }

  private async requestMicrophoneAccess(): Promise<{ success: boolean; error?: string }> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: this.options.enableEchoCancellation,
          noiseSuppression: this.options.enableNoiseReduction,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return { success: true };
    } catch (error: any) {
      let errorMessage = 'Failed to access microphone';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied by user';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use';
      }

      return { success: false, error: errorMessage };
    }
  }

  private setupPushToTalk(): void {
    document.addEventListener('keydown', (event) => {
      if (event.code === this.pushToTalkKey && !this.isPushToTalkActive) {
        this.isPushToTalkActive = true;
        this.enableMicrophone();
        this.emitVoiceEvent('push_to_talk_start', {});
      }
    });

    document.addEventListener('keyup', (event) => {
      if (event.code === this.pushToTalkKey && this.isPushToTalkActive) {
        this.isPushToTalkActive = false;
        this.disableMicrophone();
        this.emitVoiceEvent('push_to_talk_end', {});
      }
    });
  }

  private setupVoiceActivation(): void {
    if (!this.localStream || !this.audioContext) return;

    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.voiceActivationAnalyzer = this.audioContext.createAnalyser();
    this.voiceActivationAnalyzer.fftSize = 256;
    
    source.connect(this.voiceActivationAnalyzer);

    // Start monitoring voice activation
    this.monitorVoiceActivation();
  }

  private monitorVoiceActivation(): void {
    if (!this.voiceActivationAnalyzer) return;

    const bufferLength = this.voiceActivationAnalyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkVoiceLevel = () => {
      this.voiceActivationAnalyzer!.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      
      this.voiceActivationLevel = sum / bufferLength / 255;

      // Check if voice activation threshold is met
      const shouldTransmit = this.voiceActivationLevel > this.options.voiceActivationThreshold;
      
      if (shouldTransmit && !this.isPushToTalkActive) {
        this.enableMicrophone();
      } else if (!shouldTransmit && !this.options.enablePushToTalk) {
        this.disableMicrophone();
      }

      // Continue monitoring
      requestAnimationFrame(checkVoiceLevel);
    };

    checkVoiceLevel();
  }

  // WebRTC Signaling
  setSignalingCallback(callback: (data: WebRTCSignalingData) => void): void {
    this.signalingCallback = callback;
  }

  async handleSignalingMessage(data: WebRTCSignalingData): Promise<void> {
    const channel = this.channels.get(data.channelId);
    if (!channel) return;

    const participant = channel.participants.get(data.from);
    if (!participant || !participant.connection) return;

    try {
      switch (data.type) {
        case 'offer':
          await participant.connection.setRemoteDescription(new RTCSessionDescription(data.data));
          const answer = await participant.connection.createAnswer();
          await participant.connection.setLocalDescription(answer);
          
          if (this.signalingCallback) {
            this.signalingCallback({
              type: 'answer',
              data: answer,
              from: 'local',
              to: data.from,
              channelId: data.channelId
            });
          }
          break;

        case 'answer':
          await participant.connection.setRemoteDescription(new RTCSessionDescription(data.data));
          break;

        case 'ice-candidate':
          await participant.connection.addIceCandidate(new RTCIceCandidate(data.data));
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  // Channel management
  createVoiceChannel(
    channelId: string,
    name: string,
    settings?: Partial<VoiceChannelSettings>
  ): VoiceChannel {
    const defaultSettings: VoiceChannelSettings = {
      requirePushToTalk: this.options.enablePushToTalk,
      defaultVolume: this.options.defaultVolume,
      enableNoiseReduction: this.options.enableNoiseReduction,
      enableEchoCancellation: this.options.enableEchoCancellation,
      maxBitrate: 64000,
      codec: 'opus'
    };

    const channel: VoiceChannel = {
      id: channelId,
      name,
      participants: new Map(),
      maxParticipants: this.options.maxParticipantsPerChannel,
      isActive: true,
      createdAt: Date.now(),
      settings: { ...defaultSettings, ...settings }
    };

    this.channels.set(channelId, channel);
    this.emitVoiceEvent('voice_channel_created', { channel });

    return channel;
  }

  async joinVoiceChannel(channelId: string, playerId: string, playerName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized) {
      return { success: false, error: 'Voice chat not initialized' };
    }

    const channel = this.channels.get(channelId);
    if (!channel || !channel.isActive) {
      return { success: false, error: 'Voice channel not found or inactive' };
    }

    if (channel.maxParticipants && channel.participants.size >= channel.maxParticipants) {
      return { success: false, error: 'Voice channel is full' };
    }

    if (channel.participants.has(playerId)) {
      return { success: false, error: 'Already in voice channel' };
    }

    try {
      // Create peer connection for this participant
      const peerConnection = await this.createPeerConnection(channelId, playerId);
      
      // Add local stream to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, this.localStream!);
        });
      }

      const participant: VoiceParticipant = {
        playerId,
        playerName,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        volume: channel.settings.defaultVolume,
        joinedAt: Date.now(),
        connection: peerConnection,
        stream: this.localStream || undefined
      };

      channel.participants.set(playerId, participant);
      
      // Create offer for new participant
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      if (this.signalingCallback) {
        this.signalingCallback({
          type: 'offer',
          data: offer,
          from: 'local',
          to: playerId,
          channelId
        });
      }
      
      this.emitVoiceEvent('voice_channel_joined', { 
        channelId, 
        playerId, 
        playerName 
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      return { success: false, error: 'Failed to join voice channel' };
    }
  }

  private async createPeerConnection(channelId: string, playerId: string): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    // Handle incoming streams
    peerConnection.ontrack = (event) => {
      this.handleIncomingStream(event.streams[0], playerId);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingCallback) {
        this.signalingCallback({
          type: 'ice-candidate',
          data: event.candidate,
          from: 'local',
          to: playerId,
          channelId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      this.emitVoiceEvent('connection_state_change', { 
        playerId,
        channelId,
        state: peerConnection.connectionState 
      });
    };

    return peerConnection;
  }

  private handleIncomingStream(stream: MediaStream, playerId: string): void {
    // Create audio element for playback
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = this.options.defaultVolume;

    this.emitVoiceEvent('incoming_stream', { stream, audio, playerId });
  }

  leaveVoiceChannel(channelId: string, playerId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const participant = channel.participants.get(playerId);
    if (!participant) return false;

    // Close peer connection
    if (participant.connection) {
      participant.connection.close();
    }

    channel.participants.delete(playerId);
    
    this.emitVoiceEvent('voice_channel_left', { channelId, playerId });

    return true;
  }

  // Audio control
  private enableMicrophone(): void {
    if (!this.localStream) return;

    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = true;
    });

    this.emitVoiceEvent('microphone_enabled', {});
  }

  private disableMicrophone(): void {
    if (!this.localStream) return;

    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });

    this.emitVoiceEvent('microphone_disabled', {});
  }

  muteParticipant(channelId: string, playerId: string, muted: boolean = true): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const participant = channel.participants.get(playerId);
    if (!participant) return false;

    participant.isMuted = muted;
    
    // If muting self, disable microphone
    if (playerId === 'local' && muted) {
      this.disableMicrophone();
    } else if (playerId === 'local' && !muted) {
      this.enableMicrophone();
    }
    
    this.emitVoiceEvent('participant_muted', { 
      channelId, 
      playerId, 
      muted 
    });

    return true;
  }

  deafenParticipant(channelId: string, playerId: string, deafened: boolean = true): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const participant = channel.participants.get(playerId);
    if (!participant) return false;

    participant.isDeafened = deafened;
    
    this.emitVoiceEvent('participant_deafened', { 
      channelId, 
      playerId, 
      deafened 
    });

    return true;
  }

  setParticipantVolume(channelId: string, playerId: string, volume: number): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const participant = channel.participants.get(playerId);
    if (!participant) return false;

    participant.volume = Math.max(0, Math.min(1, volume));
    
    this.emitVoiceEvent('participant_volume_changed', { 
      channelId, 
      playerId, 
      volume: participant.volume 
    });

    return true;
  }

  // Push-to-talk configuration
  setPushToTalkKey(key: string): void {
    this.pushToTalkKey = key;
    this.emitVoiceEvent('push_to_talk_key_changed', { key });
  }

  getPushToTalkKey(): string {
    return this.pushToTalkKey;
  }

  // Voice activation configuration
  setVoiceActivationThreshold(threshold: number): void {
    this.options.voiceActivationThreshold = Math.max(0, Math.min(1, threshold));
    this.emitVoiceEvent('voice_activation_threshold_changed', { 
      threshold: this.options.voiceActivationThreshold 
    });
  }

  getVoiceActivationLevel(): number {
    return this.voiceActivationLevel;
  }

  // Query methods
  getVoiceChannel(channelId: string): VoiceChannel | null {
    return this.channels.get(channelId) || null;
  }

  getParticipant(channelId: string, playerId: string): VoiceParticipant | null {
    const channel = this.channels.get(channelId);
    return channel?.participants.get(playerId) || null;
  }

  getAllVoiceChannels(): VoiceChannel[] {
    return Array.from(this.channels.values());
  }

  getActiveVoiceChannels(): VoiceChannel[] {
    return Array.from(this.channels.values()).filter(channel => channel.isActive);
  }

  // Event system
  addVoiceCallback(event: string, callback: Function): void {
    if (!this.voiceCallbacks.has(event)) {
      this.voiceCallbacks.set(event, []);
    }
    this.voiceCallbacks.get(event)!.push(callback);
  }

  removeVoiceCallback(event: string, callback: Function): void {
    const callbacks = this.voiceCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitVoiceEvent(event: string, data: any): void {
    const callbacks = this.voiceCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Voice callback error:', error);
      }
    });
  }

  // Statistics
  getVoiceStatistics(): {
    totalChannels: number;
    activeChannels: number;
    totalParticipants: number;
    isInitialized: boolean;
    hasMicrophoneAccess: boolean;
    participantsPerChannel: Record<string, number>;
  } {
    const activeChannels = Array.from(this.channels.values()).filter(c => c.isActive).length;
    let totalParticipants = 0;
    const participantsPerChannel: Record<string, number> = {};

    for (const [channelId, channel] of this.channels.entries()) {
      participantsPerChannel[channelId] = channel.participants.size;
      totalParticipants += channel.participants.size;
    }

    return {
      totalChannels: this.channels.size,
      activeChannels,
      totalParticipants,
      isInitialized: this.isInitialized,
      hasMicrophoneAccess: !!this.localStream,
      participantsPerChannel
    };
  }

  // Configuration updates
  updateOptions(newOptions: Partial<VoiceChatOptions>): void {
    Object.assign(this.options, newOptions);
  }

  getOptions(): VoiceChatOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    // Close all peer connections
    for (const channel of this.channels.values()) {
      for (const participant of channel.participants.values()) {
        if (participant.connection) {
          participant.connection.close();
        }
      }
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.channels.clear();
    this.voiceCallbacks.clear();
    this.isInitialized = false;
  }
}