import * as THREE from 'three';

export interface AudioSource {
  id: string;
  playerId: string;
  playerName: string;
  position: THREE.Vector3;
  audioElement: HTMLAudioElement;
  pannerNode?: PannerNode;
  gainNode?: GainNode;
  isActive: boolean;
  volume: number;
  maxDistance: number;
  rolloffFactor: number;
  lastUpdate: number;
}

export interface AudioListener {
  id: string;
  playerId: string;
  position: THREE.Vector3;
  orientation: THREE.Vector3;
  velocity?: THREE.Vector3;
  lastUpdate: number;
}

export interface PositionalAudioOptions {
  enablePositionalAudio?: boolean;
  maxAudioDistance?: number;
  rolloffFactor?: number;
  distanceModel?: 'linear' | 'inverse' | 'exponential';
  panningModel?: 'equalpower' | 'HRTF';
  enableDopplerEffect?: boolean;
  speedOfSound?: number;
  enableOcclusion?: boolean;
  occlusionStrength?: number;
  enableReverb?: boolean;
  reverbDecay?: number;
  audioUpdateInterval?: number;
}

export interface ProximityZone {
  id: string;
  center: THREE.Vector3;
  radius: number;
  volumeMultiplier: number;
  isActive: boolean;
  type: 'amplify' | 'muffle' | 'echo';
}

export class PositionalAudioManager {
  private options: Required<PositionalAudioOptions>;
  private audioContext: AudioContext | null = null;
  private audioSources: Map<string, AudioSource> = new Map();
  private audioListener: AudioListener | null = null;
  private proximityZones: Map<string, ProximityZone> = new Map();
  private isInitialized: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private audioCallbacks: Map<string, Function[]> = new Map();
  
  // Audio processing nodes
  private masterGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private noiseGateNode: GainNode | null = null;

  constructor(options: PositionalAudioOptions = {}) {
    this.options = {
      enablePositionalAudio: options.enablePositionalAudio !== false,
      maxAudioDistance: options.maxAudioDistance || 50,
      rolloffFactor: options.rolloffFactor || 1,
      distanceModel: options.distanceModel || 'inverse',
      panningModel: options.panningModel || 'HRTF',
      enableDopplerEffect: options.enableDopplerEffect !== false,
      speedOfSound: options.speedOfSound || 343.3,
      enableOcclusion: options.enableOcclusion !== false,
      occlusionStrength: options.occlusionStrength || 0.5,
      enableReverb: options.enableReverb !== false,
      reverbDecay: options.reverbDecay || 2.0,
      audioUpdateInterval: options.audioUpdateInterval || 50
    };
  }

  // Initialization
  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (this.isInitialized) {
      return { success: true };
    }

    if (!this.options.enablePositionalAudio) {
      return { success: false, error: 'Positional audio is disabled' };
    }

    try {
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create master audio processing chain
      await this.setupAudioProcessing();

      // Start position update loop
      this.startPositionUpdates();

      this.isInitialized = true;
      this.emitAudioEvent('positional_audio_initialized', {});

      return { success: true };
    } catch (error) {
      console.error('Positional audio initialization failed:', error);
      return { success: false, error: 'Failed to initialize positional audio' };
    }
  }

  private async setupAudioProcessing(): Promise<void> {
    if (!this.audioContext) return;

    // Master gain node
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = 1.0;

    // Compressor for dynamic range control
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24;
    this.compressorNode.knee.value = 30;
    this.compressorNode.ratio.value = 12;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;

    // Noise gate
    this.noiseGateNode = this.audioContext.createGain();
    this.noiseGateNode.gain.value = 1.0;

    // Reverb (if enabled)
    if (this.options.enableReverb) {
      await this.setupReverb();
    }

    // Connect processing chain
    this.masterGainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.noiseGateNode);
    
    if (this.reverbNode) {
      this.noiseGateNode.connect(this.reverbNode);
      this.reverbNode.connect(this.audioContext.destination);
    } else {
      this.noiseGateNode.connect(this.audioContext.destination);
    }
  }

  private async setupReverb(): Promise<void> {
    if (!this.audioContext) return;

    this.reverbNode = this.audioContext.createConvolver();
    
    // Create impulse response for reverb
    const impulseResponse = this.createImpulseResponse(
      this.audioContext.sampleRate,
      this.options.reverbDecay
    );
    
    this.reverbNode.buffer = impulseResponse;
  }

  private createImpulseResponse(sampleRate: number, decay: number): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not initialized');

    const length = sampleRate * decay;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const n = length - i;
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2);
      }
    }

    return impulse;
  }

  private startPositionUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateAudioPositions();
    }, this.options.audioUpdateInterval);
  }

  // Audio source management
  addAudioSource(
    playerId: string,
    playerName: string,
    audioElement: HTMLAudioElement,
    position: THREE.Vector3
  ): AudioSource {
    if (!this.audioContext || !this.isInitialized) {
      throw new Error('Positional audio not initialized');
    }

    // Create audio nodes
    const source = this.audioContext.createMediaElementSource(audioElement);
    const pannerNode = this.audioContext.createPanner();
    const gainNode = this.audioContext.createGain();

    // Configure panner node
    pannerNode.panningModel = this.options.panningModel;
    pannerNode.distanceModel = this.options.distanceModel;
    pannerNode.maxDistance = this.options.maxAudioDistance;
    pannerNode.rolloffFactor = this.options.rolloffFactor;
    pannerNode.refDistance = 1;

    if (this.options.enableDopplerEffect) {
      pannerNode.dopplerFactor = 1;
    }

    // Set initial position
    pannerNode.positionX.value = position.x;
    pannerNode.positionY.value = position.y;
    pannerNode.positionZ.value = position.z;

    // Connect audio chain
    source.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this.masterGainNode!);

    const audioSource: AudioSource = {
      id: `audio_${playerId}_${Date.now()}`,
      playerId,
      playerName,
      position: position.clone(),
      audioElement,
      pannerNode,
      gainNode,
      isActive: true,
      volume: 1.0,
      maxDistance: this.options.maxAudioDistance,
      rolloffFactor: this.options.rolloffFactor,
      lastUpdate: Date.now()
    };

    this.audioSources.set(audioSource.id, audioSource);
    
    this.emitAudioEvent('audio_source_added', { 
      sourceId: audioSource.id, 
      playerId, 
      position 
    });

    return audioSource;
  }

  removeAudioSource(sourceId: string): boolean {
    const source = this.audioSources.get(sourceId);
    if (!source) return false;

    // Disconnect audio nodes
    if (source.pannerNode) {
      source.pannerNode.disconnect();
    }
    if (source.gainNode) {
      source.gainNode.disconnect();
    }

    this.audioSources.delete(sourceId);
    
    this.emitAudioEvent('audio_source_removed', { 
      sourceId, 
      playerId: source.playerId 
    });

    return true;
  }

  // Listener management
  setAudioListener(playerId: string, position: THREE.Vector3, orientation: THREE.Vector3): void {
    if (!this.audioContext || !this.isInitialized) return;

    this.audioListener = {
      id: `listener_${playerId}`,
      playerId,
      position: position.clone(),
      orientation: orientation.clone(),
      lastUpdate: Date.now()
    };

    // Update Web Audio API listener
    const listener = this.audioContext.listener;
    
    if (listener.positionX) {
      // Modern API
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      
      listener.forwardX.value = orientation.x;
      listener.forwardY.value = orientation.y;
      listener.forwardZ.value = orientation.z;
      
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      // Legacy API
      (listener as any).setPosition(position.x, position.y, position.z);
      (listener as any).setOrientation(
        orientation.x, orientation.y, orientation.z,
        0, 1, 0
      );
    }

    this.emitAudioEvent('audio_listener_updated', { 
      playerId, 
      position, 
      orientation 
    });
  }

  // Position updates
  updateSourcePosition(sourceId: string, position: THREE.Vector3, velocity?: THREE.Vector3): void {
    const source = this.audioSources.get(sourceId);
    if (!source || !source.pannerNode) return;

    source.position.copy(position);
    source.lastUpdate = Date.now();

    // Update panner position
    source.pannerNode.positionX.value = position.x;
    source.pannerNode.positionY.value = position.y;
    source.pannerNode.positionZ.value = position.z;

    // Update velocity for Doppler effect
    if (velocity && this.options.enableDopplerEffect) {
      source.pannerNode.setVelocity(velocity.x, velocity.y, velocity.z);
    }

    this.emitAudioEvent('source_position_updated', { 
      sourceId, 
      playerId: source.playerId, 
      position 
    });
  }

  updateListenerPosition(position: THREE.Vector3, orientation: THREE.Vector3, velocity?: THREE.Vector3): void {
    if (!this.audioListener || !this.audioContext) return;

    this.audioListener.position.copy(position);
    this.audioListener.orientation.copy(orientation);
    this.audioListener.velocity = velocity?.clone();
    this.audioListener.lastUpdate = Date.now();

    const listener = this.audioContext.listener;
    
    if (listener.positionX) {
      // Modern API
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      
      listener.forwardX.value = orientation.x;
      listener.forwardY.value = orientation.y;
      listener.forwardZ.value = orientation.z;
    } else {
      // Legacy API
      (listener as any).setPosition(position.x, position.y, position.z);
      (listener as any).setOrientation(
        orientation.x, orientation.y, orientation.z,
        0, 1, 0
      );
    }

    // Update velocity for Doppler effect
    if (velocity && this.options.enableDopplerEffect) {
      (listener as any).setVelocity?.(velocity.x, velocity.y, velocity.z);
    }
  }

  private updateAudioPositions(): void {
    if (!this.audioListener) return;

    const listenerPos = this.audioListener.position;

    for (const source of this.audioSources.values()) {
      if (!source.isActive || !source.pannerNode || !source.gainNode) continue;

      const distance = listenerPos.distanceTo(source.position);
      
      // Apply proximity-based volume adjustments
      this.applyProximityEffects(source, distance);
      
      // Apply occlusion if enabled
      if (this.options.enableOcclusion) {
        this.applyOcclusion(source, distance);
      }
    }
  }

  private applyProximityEffects(source: AudioSource, distance: number): void {
    if (!source.gainNode) return;

    let volumeMultiplier = 1.0;

    // Check proximity zones
    for (const zone of this.proximityZones.values()) {
      if (!zone.isActive) continue;

      const zoneDistance = source.position.distanceTo(zone.center);
      if (zoneDistance <= zone.radius) {
        volumeMultiplier *= zone.volumeMultiplier;
      }
    }

    // Apply distance-based volume falloff
    const maxDistance = source.maxDistance;
    if (distance > maxDistance) {
      volumeMultiplier = 0;
    } else {
      const falloff = 1 - (distance / maxDistance);
      volumeMultiplier *= Math.pow(falloff, source.rolloffFactor);
    }

    // Apply final volume
    const finalVolume = source.volume * volumeMultiplier;
    source.gainNode.gain.setValueAtTime(finalVolume, this.audioContext!.currentTime);
  }

  private applyOcclusion(source: AudioSource, distance: number): void {
    // Simple occlusion simulation - in a real implementation,
    // this would use raycasting to detect obstacles
    const occlusionFactor = Math.min(distance / this.options.maxAudioDistance, 1.0);
    const occlusionAmount = occlusionFactor * this.options.occlusionStrength;
    
    if (source.gainNode) {
      const currentGain = source.gainNode.gain.value;
      const occludedGain = currentGain * (1 - occlusionAmount);
      source.gainNode.gain.setValueAtTime(occludedGain, this.audioContext!.currentTime);
    }
  }

  // Proximity zones
  addProximityZone(
    id: string,
    center: THREE.Vector3,
    radius: number,
    volumeMultiplier: number,
    type: ProximityZone['type'] = 'amplify'
  ): ProximityZone {
    const zone: ProximityZone = {
      id,
      center: center.clone(),
      radius,
      volumeMultiplier,
      isActive: true,
      type
    };

    this.proximityZones.set(id, zone);
    
    this.emitAudioEvent('proximity_zone_added', { 
      zoneId: id, 
      center, 
      radius, 
      type 
    });

    return zone;
  }

  removeProximityZone(zoneId: string): boolean {
    const removed = this.proximityZones.delete(zoneId);
    
    if (removed) {
      this.emitAudioEvent('proximity_zone_removed', { zoneId });
    }

    return removed;
  }

  updateProximityZone(zoneId: string, center?: THREE.Vector3, radius?: number): boolean {
    const zone = this.proximityZones.get(zoneId);
    if (!zone) return false;

    if (center) {
      zone.center.copy(center);
    }
    if (radius !== undefined) {
      zone.radius = radius;
    }

    this.emitAudioEvent('proximity_zone_updated', { 
      zoneId, 
      center: zone.center, 
      radius: zone.radius 
    });

    return true;
  }

  // Audio quality controls
  setMasterVolume(volume: number): void {
    if (!this.masterGainNode) return;

    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.masterGainNode.gain.setValueAtTime(clampedVolume, this.audioContext!.currentTime);
    
    this.emitAudioEvent('master_volume_changed', { volume: clampedVolume });
  }

  setSourceVolume(sourceId: string, volume: number): boolean {
    const source = this.audioSources.get(sourceId);
    if (!source) return false;

    source.volume = Math.max(0, Math.min(1, volume));
    
    this.emitAudioEvent('source_volume_changed', { 
      sourceId, 
      playerId: source.playerId, 
      volume: source.volume 
    });

    return true;
  }

  enableNoiseGate(threshold: number = -40): void {
    if (!this.noiseGateNode || !this.audioContext) return;

    // Simple noise gate implementation
    const now = this.audioContext.currentTime;
    this.noiseGateNode.gain.setValueAtTime(0, now);
    this.noiseGateNode.gain.setValueAtTime(1, now + 0.01);
  }

  // Query methods
  getAudioSource(sourceId: string): AudioSource | null {
    return this.audioSources.get(sourceId) || null;
  }

  getAudioSourcesByPlayer(playerId: string): AudioSource[] {
    return Array.from(this.audioSources.values()).filter(
      source => source.playerId === playerId
    );
  }

  getAllAudioSources(): AudioSource[] {
    return Array.from(this.audioSources.values());
  }

  getProximityZone(zoneId: string): ProximityZone | null {
    return this.proximityZones.get(zoneId) || null;
  }

  getAllProximityZones(): ProximityZone[] {
    return Array.from(this.proximityZones.values());
  }

  getAudioListener(): AudioListener | null {
    return this.audioListener;
  }

  // Proximity detection
  getSourcesInRange(position: THREE.Vector3, maxDistance: number): AudioSource[] {
    return Array.from(this.audioSources.values()).filter(source => {
      const distance = position.distanceTo(source.position);
      return distance <= maxDistance && source.isActive;
    });
  }

  getPlayersInVoiceRange(listenerPosition: THREE.Vector3): string[] {
    const sourcesInRange = this.getSourcesInRange(listenerPosition, this.options.maxAudioDistance);
    return sourcesInRange.map(source => source.playerId);
  }

  // Event system
  addAudioCallback(event: string, callback: Function): void {
    if (!this.audioCallbacks.has(event)) {
      this.audioCallbacks.set(event, []);
    }
    this.audioCallbacks.get(event)!.push(callback);
  }

  removeAudioCallback(event: string, callback: Function): void {
    const callbacks = this.audioCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitAudioEvent(event: string, data: any): void {
    const callbacks = this.audioCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Positional audio callback error:', error);
      }
    });
  }

  // Statistics
  getAudioStatistics(): {
    totalSources: number;
    activeSources: number;
    proximityZones: number;
    isInitialized: boolean;
    hasListener: boolean;
    averageDistance: number;
    sourcesInRange: number;
  } {
    const activeSources = Array.from(this.audioSources.values()).filter(s => s.isActive);
    let averageDistance = 0;
    let sourcesInRange = 0;

    if (this.audioListener && activeSources.length > 0) {
      const distances = activeSources.map(source => 
        this.audioListener!.position.distanceTo(source.position)
      );
      
      averageDistance = distances.reduce((sum, dist) => sum + dist, 0) / distances.length;
      sourcesInRange = distances.filter(dist => dist <= this.options.maxAudioDistance).length;
    }

    return {
      totalSources: this.audioSources.size,
      activeSources: activeSources.length,
      proximityZones: this.proximityZones.size,
      isInitialized: this.isInitialized,
      hasListener: !!this.audioListener,
      averageDistance,
      sourcesInRange
    };
  }

  // Configuration updates
  updateOptions(newOptions: Partial<PositionalAudioOptions>): void {
    Object.assign(this.options, newOptions);
    
    // Update existing sources with new settings
    for (const source of this.audioSources.values()) {
      if (source.pannerNode) {
        source.pannerNode.maxDistance = this.options.maxAudioDistance;
        source.pannerNode.rolloffFactor = this.options.rolloffFactor;
        source.maxDistance = this.options.maxAudioDistance;
        source.rolloffFactor = this.options.rolloffFactor;
      }
    }
  }

  getOptions(): PositionalAudioOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    // Stop update loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Remove all audio sources
    for (const sourceId of this.audioSources.keys()) {
      this.removeAudioSource(sourceId);
    }

    // Disconnect audio nodes
    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
    }
    if (this.compressorNode) {
      this.compressorNode.disconnect();
    }
    if (this.reverbNode) {
      this.reverbNode.disconnect();
    }
    if (this.noiseGateNode) {
      this.noiseGateNode.disconnect();
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear data
    this.audioSources.clear();
    this.proximityZones.clear();
    this.audioCallbacks.clear();
    this.audioListener = null;
    this.isInitialized = false;
  }
}