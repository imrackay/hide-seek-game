import { TextChatManager, ChatMessage, ChatChannel, TextChatOptions } from './TextChatManager';
import { VoiceChatManager, VoiceChannel, VoiceChatOptions, WebRTCSignalingData } from './VoiceChatManager';
import { PositionalAudioManager, PositionalAudioOptions, AudioSource } from './PositionalAudioManager';
import { Player } from '../types';
import * as THREE from 'three';

export interface CommunicationManagerOptions {
    textChat?: TextChatOptions;
    voiceChat?: VoiceChatOptions;
    positionalAudio?: PositionalAudioOptions;
    enableTextChat?: boolean;
    enableVoiceChat?: boolean;
    enablePositionalAudio?: boolean;
    enableCrossChannelModeration?: boolean;
    enableActivityLogging?: boolean;
    enableWebRTCSignaling?: boolean;
}

export interface CommunicationEvent {
    id: string;
    type: 'message' | 'voice_activity' | 'moderation' | 'system' | 'webrtc_signaling';
    playerId: string;
    channelId: string;
    timestamp: number;
    data: any;
}

export interface NetworkSignalingCallback {
    (data: WebRTCSignalingData): void;
}

export interface PlayerCommunicationState {
    playerId: string;
    playerName: string;
    textChannels: string[];
    voiceChannels: string[];
    isMuted: boolean;
    isVoiceMuted: boolean;
    lastActivity: number;
    messageCount: number;
    voiceActivityLevel: number;
}

export class CommunicationManager {
    private textChatManager: TextChatManager;
    private voiceChatManager: VoiceChatManager;
    private positionalAudioManager: PositionalAudioManager | null = null;
    private options: Required<CommunicationManagerOptions>;
    private playerStates: Map<string, PlayerCommunicationState> = new Map();
    private eventHistory: CommunicationEvent[] = [];
    private eventCallbacks: Map<string, Function[]> = new Map();
    private isInitialized = false;
    private networkSignalingCallback: NetworkSignalingCallback | null = null;

    constructor(options: CommunicationManagerOptions = {}) {
        this.options = {
            textChat: options.textChat || {},
            voiceChat: options.voiceChat || {},
            positionalAudio: options.positionalAudio || {},
            enableTextChat: options.enableTextChat !== false,
            enableVoiceChat: options.enableVoiceChat !== false,
            enablePositionalAudio: options.enablePositionalAudio !== false,
            enableCrossChannelModeration: options.enableCrossChannelModeration !== false,
            enableActivityLogging: options.enableActivityLogging !== false,
            enableWebRTCSignaling: options.enableWebRTCSignaling !== false
        };

        // Initialize managers
        this.textChatManager = new TextChatManager(this.options.textChat);
        this.voiceChatManager = new VoiceChatManager(this.options.voiceChat);
        
        if (this.options.enablePositionalAudio) {
            this.positionalAudioManager = new PositionalAudioManager(this.options.positionalAudio);
        }

        this.setupEventHandlers();
        this.setupWebRTCSignaling();
    }

    private setupEventHandlers(): void {
        // Text chat events
        this.textChatManager.addMessageCallback('message_sent', (data: any) => {
            this.handleTextMessage(data);
        });

        this.textChatManager.addMessageCallback('player_joined', (data: any) => {
            this.updatePlayerState(data.playerId, { textChannels: [data.channelId] });
        });

        this.textChatManager.addMessageCallback('player_left', (data: any) => {
            this.removePlayerFromTextChannel(data.playerId, data.channelId);
        });

        // Voice chat events
        this.voiceChatManager.addVoiceCallback('player_joined_voice', (data: any) => {
            this.updatePlayerState(data.playerId, { voiceChannels: [data.channelId] });
        });

        this.voiceChatManager.addVoiceCallback('player_left_voice', (data: any) => {
            this.removePlayerFromVoiceChannel(data.playerId, data.channelId);
        });

        this.voiceChatManager.addVoiceCallback('voice_activation_changed', (data: any) => {
            this.handleVoiceActivity(data);
        });

        this.voiceChatManager.addVoiceCallback('player_muted', (data: any) => {
            this.updatePlayerState(data.playerId, { isVoiceMuted: true });
        });

        this.voiceChatManager.addVoiceCallback('player_unmuted', (data: any) => {
            this.updatePlayerState(data.playerId, { isVoiceMuted: false });
        });
    }

    // Initialization
    async initialize(): Promise<boolean> {
        try {
            let success = true;

            if (this.options.enableVoiceChat) {
                const voiceResult = await this.voiceChatManager.initialize();
                success = success && voiceResult.success;
            }

            if (this.options.enablePositionalAudio && this.positionalAudioManager) {
                const audioResult = await this.positionalAudioManager.initialize();
                success = success && audioResult.success;
            }

            this.isInitialized = success;

            if (success) {
                this.emitEvent('communication_initialized', {});
            }

            return success;
        } catch (error) {
            console.error('Failed to initialize communication manager:', error);
            return false;
        }
    }

    // Player management
    registerPlayer(player: Player): void {
        const state: PlayerCommunicationState = {
            playerId: player.id,
            playerName: player.username,
            textChannels: [],
            voiceChannels: [],
            isMuted: false,
            isVoiceMuted: false,
            lastActivity: Date.now(),
            messageCount: 0,
            voiceActivityLevel: 0
        };

        this.playerStates.set(player.id, state);

        // Auto-join global channels
        if (this.options.enableTextChat) {
            this.textChatManager.joinChannel('global', player.id);
        }

        if (this.options.enableVoiceChat) {
            this.voiceChatManager.joinVoiceChannel('voice-global', player.id);
        }

        this.emitEvent('player_registered', { playerId: player.id, playerName: player.username });
    }

    unregisterPlayer(playerId: string): void {
        const state = this.playerStates.get(playerId);
        if (!state) return;

        // Leave all channels
        for (const channelId of state.textChannels) {
            this.textChatManager.leaveChannel(channelId, playerId);
        }

        for (const channelId of state.voiceChannels) {
            this.voiceChatManager.leaveVoiceChannel(channelId, playerId, state.playerName);
        }

        this.playerStates.delete(playerId);
        this.emitEvent('player_unregistered', { playerId });
    }

    private updatePlayerState(playerId: string, updates: Partial<PlayerCommunicationState>): void {
        const state = this.playerStates.get(playerId);
        if (state) {
            Object.assign(state, updates);
            state.lastActivity = Date.now();
        }
    }

    private removePlayerFromTextChannel(playerId: string, channelId: string): void {
        const state = this.playerStates.get(playerId);
        if (state) {
            const index = state.textChannels.indexOf(channelId);
            if (index !== -1) {
                state.textChannels.splice(index, 1);
            }
        }
    }

    private removePlayerFromVoiceChannel(playerId: string, channelId: string): void {
        const state = this.playerStates.get(playerId);
        if (state) {
            const index = state.voiceChannels.indexOf(channelId);
            if (index !== -1) {
                state.voiceChannels.splice(index, 1);
            }
        }
    }

    // Text chat methods
    async sendTextMessage(
        senderId: string,
        content: string,
        channelId?: string,
        type?: ChatMessage['type'],
        targetId?: string
    ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
        if (!this.options.enableTextChat) {
            return { success: false, error: 'Text chat is disabled' };
        }

        const state = this.playerStates.get(senderId);
        if (!state) {
            return { success: false, error: 'Player not registered' };
        }

        const result = await this.textChatManager.sendMessage(
            senderId,
            state.playerName,
            content,
            channelId,
            type,
            targetId
        );

        if (result.success && result.message) {
            state.messageCount++;
            this.logEvent('message', senderId, channelId || 'global', result.message);
        }

        return result;
    }

    async sendWhisper(
        senderId: string,
        targetId: string,
        content: string
    ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
        if (!this.options.enableTextChat) {
            return { success: false, error: 'Text chat is disabled' };
        }

        const senderState = this.playerStates.get(senderId);
        if (!senderState) {
            return { success: false, error: 'Sender not registered' };
        }

        return this.textChatManager.sendWhisper(senderId, senderState.playerName, targetId, content);
    }

    joinTextChannel(playerId: string, channelId: string): boolean {
        if (!this.options.enableTextChat) return false;

        const success = this.textChatManager.joinChannel(channelId, playerId);
        if (success) {
            const state = this.playerStates.get(playerId);
            if (state && !state.textChannels.includes(channelId)) {
                state.textChannels.push(channelId);
            }
        }

        return success;
    }

    leaveTextChannel(playerId: string, channelId: string): boolean {
        if (!this.options.enableTextChat) return false;

        const success = this.textChatManager.leaveChannel(channelId, playerId);
        if (success) {
            this.removePlayerFromTextChannel(playerId, channelId);
        }

        return success;
    }

    // Voice chat methods
    async enableMicrophone(): Promise<boolean> {
        if (!this.options.enableVoiceChat) return false;
        const result = await this.voiceChatManager.enableMicrophone();
        return result.success;
    }

    disableMicrophone(): void {
        if (this.options.enableVoiceChat) {
            this.voiceChatManager.disableMicrophone();
        }
    }

    joinVoiceChannel(playerId: string, channelId: string): boolean {
        if (!this.options.enableVoiceChat) return false;

        const state = this.playerStates.get(playerId);
        if (!state) return false;

        const success = this.voiceChatManager.joinVoiceChannel(channelId, playerId, state.playerName);
        if (success) {
            if (!state.voiceChannels.includes(channelId)) {
                state.voiceChannels.push(channelId);
            }
        }

        return success;
    }

    leaveVoiceChannel(playerId: string, channelId: string): boolean {
        if (!this.options.enableVoiceChat) return false;

        const state = this.playerStates.get(playerId);
        if (!state) return false;

        const success = this.voiceChatManager.leaveVoiceChannel(channelId, playerId, state.playerName);
        if (success) {
            this.removePlayerFromVoiceChannel(playerId, channelId);
        }

        return success;
    }

    // Positional Audio methods
    addAudioSource(playerId: string, audioElement: HTMLAudioElement, position: THREE.Vector3): AudioSource | null {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return null;

        const state = this.playerStates.get(playerId);
        if (!state) return null;

        return this.positionalAudioManager.addAudioSource(playerId, state.playerName, audioElement, position);
    }

    removeAudioSource(sourceId: string): boolean {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return false;
        return this.positionalAudioManager.removeAudioSource(sourceId);
    }

    updatePlayerAudioPosition(playerId: string, position: THREE.Vector3, velocity?: THREE.Vector3): void {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return;

        const sources = this.positionalAudioManager.getAudioSourcesByPlayer(playerId);
        for (const source of sources) {
            this.positionalAudioManager.updateSourcePosition(source.id, position, velocity);
        }
    }

    setAudioListener(playerId: string, position: THREE.Vector3, orientation: THREE.Vector3): void {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return;
        this.positionalAudioManager.setAudioListener(playerId, position, orientation);
    }

    updateAudioListener(position: THREE.Vector3, orientation: THREE.Vector3, velocity?: THREE.Vector3): void {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return;
        this.positionalAudioManager.updateListenerPosition(position, orientation, velocity);
    }

    getPlayersInVoiceRange(listenerPosition: THREE.Vector3): string[] {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return [];
        return this.positionalAudioManager.getPlayersInVoiceRange(listenerPosition);
    }

    setMasterAudioVolume(volume: number): void {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return;
        this.positionalAudioManager.setMasterVolume(volume);
    }

    setPlayerAudioVolume(playerId: string, volume: number): boolean {
        if (!this.options.enablePositionalAudio || !this.positionalAudioManager) return false;

        const sources = this.positionalAudioManager.getAudioSourcesByPlayer(playerId);
        let success = false;
        for (const source of sources) {
            if (this.positionalAudioManager.setSourceVolume(source.id, volume)) {
                success = true;
            }
        }
        return success;
    }

    // Moderation
    mutePlayerText(playerId: string, duration?: number): void {
        if (this.options.enableTextChat) {
            this.textChatManager.mutePlayer(playerId, duration);
            this.updatePlayerState(playerId, { isMuted: true });
            this.logEvent('moderation', 'system', 'global', { action: 'text_mute', playerId, duration });
        }
    }

    unmutePlayerText(playerId: string): void {
        if (this.options.enableTextChat) {
            this.textChatManager.unmutePlayer(playerId);
            this.updatePlayerState(playerId, { isMuted: false });
            this.logEvent('moderation', 'system', 'global', { action: 'text_unmute', playerId });
        }
    }

    mutePlayerVoice(playerId: string): void {
        if (this.options.enableVoiceChat) {
            // Set volume to 0 for positional audio
            if (this.options.enablePositionalAudio) {
                this.setPlayerAudioVolume(playerId, 0);
            }
            this.updatePlayerState(playerId, { isVoiceMuted: true });
            this.logEvent('moderation', 'system', 'voice-global', { action: 'voice_mute', playerId });
        }
    }

    unmutePlayerVoice(playerId: string): void {
        if (this.options.enableVoiceChat) {
            // Restore volume for positional audio
            if (this.options.enablePositionalAudio) {
                this.setPlayerAudioVolume(playerId, 1);
            }
            this.updatePlayerState(playerId, { isVoiceMuted: false });
            this.logEvent('moderation', 'system', 'voice-global', { action: 'voice_unmute', playerId });
        }
    }

    // Event handlers
    private handleTextMessage(data: { message: ChatMessage; channelId: string; recipients: string[] }): void {
        this.emitEvent('text_message', data);
    }

    private handleVoiceActivity(data: { active: boolean; volume: number }): void {
        // Update voice activity for all connected players
        for (const [playerId, state] of this.playerStates.entries()) {
            if (state.voiceChannels.length > 0) {
                state.voiceActivityLevel = data.volume;
            }
        }

        this.emitEvent('voice_activity', data);
    }

    // Logging
    private logEvent(type: CommunicationEvent['type'], playerId: string, channelId: string, data: any): void {
        if (!this.options.enableActivityLogging) return;

        const event: CommunicationEvent = {
            id: this.generateEventId(),
            type,
            playerId,
            channelId,
            timestamp: Date.now(),
            data
        };

        this.eventHistory.push(event);

        // Limit history size
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-500);
        }
    }

    private generateEventId(): string {
        return `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Query methods
    getPlayerState(playerId: string): PlayerCommunicationState | null {
        return this.playerStates.get(playerId) || null;
    }

    getAllPlayerStates(): PlayerCommunicationState[] {
        return Array.from(this.playerStates.values());
    }

    getTextChannels(): ChatChannel[] {
        return this.options.enableTextChat ? this.textChatManager.getAllChannels() : [];
    }

    getVoiceChannels(): VoiceChannel[] {
        return this.options.enableVoiceChat ? [this.voiceChatManager.getVoiceChannel('voice-global')].filter(Boolean) : [];
    }

    getMessageHistory(channelId: string, limit?: number): ChatMessage[] {
        return this.options.enableTextChat ? this.textChatManager.getMessageHistory(channelId, limit) : [];
    }

    getAudioSources(): AudioSource[] {
        return this.options.enablePositionalAudio && this.positionalAudioManager ? 
            this.positionalAudioManager.getAllAudioSources() : [];
    }

    getEventHistory(timeWindow?: number): CommunicationEvent[] {
        if (!this.options.enableActivityLogging) return [];

        if (timeWindow) {
            const cutoff = Date.now() - timeWindow;
            return this.eventHistory.filter(event => event.timestamp >= cutoff);
        }

        return [...this.eventHistory];
    }

    // Statistics
    getStatistics(): {
        totalPlayers: number;
        activePlayers: number;
        textChannels: number;
        voiceChannels: number;
        totalMessages: number;
        activeVoiceConnections: number;
        mutedPlayers: number;
        voiceMutedPlayers: number;
    } {
        const now = Date.now();
        const activeThreshold = 300000; // 5 minutes

        const activePlayers = Array.from(this.playerStates.values())
            .filter(state => now - state.lastActivity < activeThreshold).length;

        const mutedPlayers = Array.from(this.playerStates.values())
            .filter(state => state.isMuted).length;

        const voiceMutedPlayers = Array.from(this.playerStates.values())
            .filter(state => state.isVoiceMuted).length;

        const textStats = this.options.enableTextChat ? this.textChatManager.getStatistics() : {
            totalChannels: 0,
            totalMessages: 0
        };

        const voiceChannels = this.getVoiceChannels();
        const audioSources = this.getAudioSources();

        const voiceStats = {
            totalChannels: voiceChannels.length,
            activeConnections: audioSources.filter(source => source.isActive).length
        };

        return {
            totalPlayers: this.playerStates.size,
            activePlayers,
            textChannels: textStats.totalChannels,
            voiceChannels: voiceStats.totalChannels,
            totalMessages: textStats.totalMessages,
            activeVoiceConnections: voiceStats.activeConnections,
            mutedPlayers,
            voiceMutedPlayers
        };
    }

    // Event system
    addEventListener(event: string, callback: Function): void {
        if (!this.eventCallbacks.has(event)) {
            this.eventCallbacks.set(event, []);
        }
        this.eventCallbacks.get(event)!.push(callback);
    }

    removeEventListener(event: string, callback: Function): void {
        const callbacks = this.eventCallbacks.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    private emitEvent(event: string, data: any): void {
        const callbacks = this.eventCallbacks.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Communication event callback error:', error);
            }
        });
    }

    // Configuration updates
    updateTextChatOptions(options: Partial<TextChatOptions>): void {
        if (this.options.enableTextChat) {
            this.textChatManager.updateOptions(options);
        }
    }

    updateVoiceChatOptions(options: Partial<VoiceChatOptions>): void {
        if (this.options.enableVoiceChat) {
            this.voiceChatManager.updateOptions(options);
        }
    }

    updatePositionalAudioOptions(options: Partial<PositionalAudioOptions>): void {
        if (this.options.enablePositionalAudio && this.positionalAudioManager) {
            this.positionalAudioManager.updateOptions(options);
        }
    }

    // WebRTC Signaling
    private setupWebRTCSignaling(): void {
        if (!this.options.enableWebRTCSignaling) return;

        // Set up signaling callback for voice chat manager
        this.voiceChatManager.setSignalingCallback((data: WebRTCSignalingData) => {
            this.handleWebRTCSignaling(data);
        });
    }

    private handleWebRTCSignaling(data: WebRTCSignalingData): void {
        // Forward signaling data to network layer
        if (this.networkSignalingCallback) {
            this.networkSignalingCallback(data);
        }

        // Log signaling event
        this.logEvent('webrtc_signaling', data.from, data.channelId, {
            type: data.type,
            to: data.to
        });

        // Emit signaling event
        this.emitEvent('webrtc_signaling', data);
    }

    setNetworkSignalingCallback(callback: NetworkSignalingCallback): void {
        this.networkSignalingCallback = callback;
    }

    handleIncomingSignaling(data: WebRTCSignalingData): void {
        if (this.options.enableVoiceChat && this.options.enableWebRTCSignaling) {
            // Handle signaling through voice chat manager
            this.emitEvent('webrtc_signaling_received', data);
        }
    }

    // Cleanup
    dispose(): void {
        // Unregister all players
        for (const playerId of this.playerStates.keys()) {
            this.unregisterPlayer(playerId);
        }

        // Dispose managers
        this.textChatManager.dispose();
        this.voiceChatManager.dispose();
        
        if (this.positionalAudioManager) {
            this.positionalAudioManager.dispose();
            this.positionalAudioManager = null;
        }

        // Clear data
        this.playerStates.clear();
        this.eventHistory = [];
        this.eventCallbacks.clear();
        this.networkSignalingCallback = null;

        this.isInitialized = false;
    }
}