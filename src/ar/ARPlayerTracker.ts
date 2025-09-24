import * as THREE from 'three';

export interface ARPlayerTrackingOptions {
  enableGPS?: boolean;
  enableDeviceSensors?: boolean;
  enableCompass?: boolean;
  gpsAccuracyThreshold?: number;
  trackingUpdateInterval?: number;
  maxTrackingDistance?: number;
  enablePositionSmoothing?: boolean;
  smoothingFactor?: number;
  enableAltitudeTracking?: boolean;
}

export interface PlayerPosition {
  playerId: string;
  worldPosition: THREE.Vector3;
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy: number;
  };
  deviceOrientation?: {
    alpha: number; // Compass heading
    beta: number;  // Tilt front/back
    gamma: number; // Tilt left/right
  };
  timestamp: number;
  isTracked: boolean;
  trackingQuality: 'poor' | 'limited' | 'good' | 'excellent';
}

export interface ARTrackingState {
  isTracking: boolean;
  hasGPSPermission: boolean;
  hasOrientationPermission: boolean;
  gpsAccuracy: number;
  lastGPSUpdate: number;
  lastOrientationUpdate: number;
  trackingErrors: string[];
}

export interface GeolocationReference {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp: number;
}

export class ARPlayerTracker {
  private options: Required<ARPlayerTrackingOptions>;
  private trackingState: ARTrackingState;
  private playerPositions: Map<string, PlayerPosition> = new Map();
  private geolocationReference: GeolocationReference | null = null;
  private trackingCallbacks: Map<string, Function[]> = new Map();
  
  // Tracking components
  private gpsWatchId: number | null = null;
  private orientationListener: ((event: DeviceOrientationEvent) => void) | null = null;
  private trackingInterval: NodeJS.Timeout | null = null;
  
  // Position smoothing
  private positionHistory: Map<string, THREE.Vector3[]> = new Map();
  private orientationHistory: Map<string, number[]> = new Map();

  constructor(options: ARPlayerTrackingOptions = {}) {
    this.options = {
      enableGPS: options.enableGPS !== false,
      enableDeviceSensors: options.enableDeviceSensors !== false,
      enableCompass: options.enableCompass !== false,
      gpsAccuracyThreshold: options.gpsAccuracyThreshold || 10, // meters
      trackingUpdateInterval: options.trackingUpdateInterval || 100, // ms
      maxTrackingDistance: options.maxTrackingDistance || 1000, // meters
      enablePositionSmoothing: options.enablePositionSmoothing !== false,
      smoothingFactor: options.smoothingFactor || 0.8,
      enableAltitudeTracking: options.enableAltitudeTracking !== false
    };

    this.trackingState = {
      isTracking: false,
      hasGPSPermission: false,
      hasOrientationPermission: false,
      gpsAccuracy: 0,
      lastGPSUpdate: 0,
      lastOrientationUpdate: 0,
      trackingErrors: []
    };
  }

  // Initialization
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // Request GPS permission
      if (this.options.enableGPS) {
        const gpsResult = await this.requestGPSPermission();
        if (!gpsResult.success) {
          this.trackingState.trackingErrors.push(gpsResult.error || 'GPS permission denied');
        }
      }

      // Request device orientation permission
      if (this.options.enableDeviceSensors) {
        const orientationResult = await this.requestOrientationPermission();
        if (!orientationResult.success) {
          this.trackingState.trackingErrors.push(orientationResult.error || 'Orientation permission denied');
        }
      }

      // Check if we have at least one tracking method
      if (!this.trackingState.hasGPSPermission && !this.trackingState.hasOrientationPermission) {
        return { 
          success: false, 
          error: 'No tracking methods available. GPS and orientation permissions denied.' 
        };
      }

      this.emitTrackingEvent('tracker_initialized', { 
        trackingState: this.trackingState 
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to initialize AR player tracker:', error);
      return { success: false, error: 'Failed to initialize tracking system' };
    }
  }

  private async requestGPSPermission(): Promise<{ success: boolean; error?: string }> {
    if (!('geolocation' in navigator)) {
      return { success: false, error: 'Geolocation not supported' };
    }

    try {
      // Test geolocation access
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      this.trackingState.hasGPSPermission = true;
      return { success: true };
    } catch (error: any) {
      let errorMessage = 'GPS permission denied';
      
      if (error.code === error.PERMISSION_DENIED) {
        errorMessage = 'GPS permission denied by user';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMessage = 'GPS position unavailable';
      } else if (error.code === error.TIMEOUT) {
        errorMessage = 'GPS request timeout';
      }

      return { success: false, error: errorMessage };
    }
  }

  private async requestOrientationPermission(): Promise<{ success: boolean; error?: string }> {
    if (!('DeviceOrientationEvent' in window)) {
      return { success: false, error: 'Device orientation not supported' };
    }

    try {
      // Request permission on iOS
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== 'granted') {
          return { success: false, error: 'Device orientation permission denied' };
        }
      }

      this.trackingState.hasOrientationPermission = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to request orientation permission' };
    }
  }

  // Tracking control
  async startTracking(playerId: string): Promise<{ success: boolean; error?: string }> {
    if (this.trackingState.isTracking) {
      return { success: false, error: 'Tracking already active' };
    }

    try {
      // Start GPS tracking
      if (this.trackingState.hasGPSPermission) {
        await this.startGPSTracking();
      }

      // Start orientation tracking
      if (this.trackingState.hasOrientationPermission) {
        this.startOrientationTracking();
      }

      // Start tracking update loop
      this.startTrackingLoop();

      this.trackingState.isTracking = true;
      
      this.emitTrackingEvent('tracking_started', { playerId });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to start tracking:', error);
      return { success: false, error: 'Failed to start tracking' };
    }
  }

  private async startGPSTracking(): Promise<void> {
    if (!navigator.geolocation) return;

    // Get initial position to set reference point
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      this.setGeolocationReference(position.coords);
    } catch (error) {
      console.warn('Failed to get initial GPS position:', error);
    }

    // Start continuous tracking
    this.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => this.handleGPSUpdate(position),
      (error) => this.handleGPSError(error),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000
      }
    );
  }

  private startOrientationTracking(): void {
    this.orientationListener = (event: DeviceOrientationEvent) => {
      this.handleOrientationUpdate(event);
    };

    window.addEventListener('deviceorientation', this.orientationListener);
  }

  private startTrackingLoop(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
    }

    this.trackingInterval = setInterval(() => {
      this.updatePlayerPositions();
    }, this.options.trackingUpdateInterval);
  }

  stopTracking(): void {
    // Stop GPS tracking
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    // Stop orientation tracking
    if (this.orientationListener) {
      window.removeEventListener('deviceorientation', this.orientationListener);
      this.orientationListener = null;
    }

    // Stop tracking loop
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    this.trackingState.isTracking = false;
    
    this.emitTrackingEvent('tracking_stopped', {});
  }

  // GPS handling
  private setGeolocationReference(coords: GeolocationCoordinates): void {
    this.geolocationReference = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude || undefined,
      timestamp: Date.now()
    };

    this.emitTrackingEvent('reference_set', { 
      reference: this.geolocationReference 
    });
  }

  private handleGPSUpdate(position: GeolocationPosition): void {
    const coords = position.coords;
    
    // Update tracking state
    this.trackingState.gpsAccuracy = coords.accuracy;
    this.trackingState.lastGPSUpdate = Date.now();

    // Check accuracy threshold
    if (coords.accuracy > this.options.gpsAccuracyThreshold) {
      console.warn(`GPS accuracy too low: ${coords.accuracy}m`);
      return;
    }

    // Convert GPS to world coordinates
    const worldPosition = this.gpsToWorldPosition(coords);
    
    // Update current player position
    this.updatePlayerPosition('current_player', {
      worldPosition,
      gpsCoordinates: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude || undefined,
        accuracy: coords.accuracy
      },
      timestamp: Date.now(),
      isTracked: true,
      trackingQuality: this.getTrackingQuality(coords.accuracy)
    });

    this.emitTrackingEvent('gps_updated', { 
      position: worldPosition,
      accuracy: coords.accuracy 
    });
  }

  private handleGPSError(error: GeolocationPositionError): void {
    let errorMessage = 'GPS error';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'GPS permission denied';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'GPS position unavailable';
        break;
      case error.TIMEOUT:
        errorMessage = 'GPS timeout';
        break;
    }

    this.trackingState.trackingErrors.push(errorMessage);
    
    this.emitTrackingEvent('gps_error', { error: errorMessage });
  }

  private gpsToWorldPosition(coords: GeolocationCoordinates): THREE.Vector3 {
    if (!this.geolocationReference) {
      return new THREE.Vector3(0, 0, 0);
    }

    // Convert lat/lng to meters using Haversine formula
    const R = 6371000; // Earth's radius in meters
    const lat1 = this.geolocationReference.latitude * Math.PI / 180;
    const lat2 = coords.latitude * Math.PI / 180;
    const deltaLat = (coords.latitude - this.geolocationReference.latitude) * Math.PI / 180;
    const deltaLng = (coords.longitude - this.geolocationReference.longitude) * Math.PI / 180;

    const x = deltaLng * Math.cos((lat1 + lat2) / 2) * R;
    const z = deltaLat * R;
    const y = this.options.enableAltitudeTracking && coords.altitude && this.geolocationReference.altitude
      ? coords.altitude - this.geolocationReference.altitude
      : 0;

    return new THREE.Vector3(x, y, z);
  }

  // Orientation handling
  private handleOrientationUpdate(event: DeviceOrientationEvent): void {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    this.trackingState.lastOrientationUpdate = Date.now();

    // Update current player orientation
    const currentPlayer = this.playerPositions.get('current_player');
    if (currentPlayer) {
      currentPlayer.deviceOrientation = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma
      };
      currentPlayer.timestamp = Date.now();
    }

    this.emitTrackingEvent('orientation_updated', {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma
    });
  }

  // Position management
  private updatePlayerPosition(playerId: string, positionData: Partial<PlayerPosition>): void {
    const existingPosition = this.playerPositions.get(playerId);
    
    const updatedPosition: PlayerPosition = {
      playerId,
      worldPosition: new THREE.Vector3(0, 0, 0),
      timestamp: Date.now(),
      isTracked: false,
      trackingQuality: 'poor',
      ...existingPosition,
      ...positionData
    };

    // Apply position smoothing
    if (this.options.enablePositionSmoothing && updatedPosition.worldPosition) {
      updatedPosition.worldPosition = this.smoothPosition(playerId, updatedPosition.worldPosition);
    }

    this.playerPositions.set(playerId, updatedPosition);
  }

  private smoothPosition(playerId: string, newPosition: THREE.Vector3): THREE.Vector3 {
    if (!this.positionHistory.has(playerId)) {
      this.positionHistory.set(playerId, []);
    }

    const history = this.positionHistory.get(playerId)!;
    history.push(newPosition.clone());

    // Keep only recent positions
    if (history.length > 5) {
      history.shift();
    }

    // Calculate weighted average
    let smoothedPosition = new THREE.Vector3();
    let totalWeight = 0;

    for (let i = 0; i < history.length; i++) {
      const weight = Math.pow(this.options.smoothingFactor, history.length - 1 - i);
      smoothedPosition.add(history[i].clone().multiplyScalar(weight));
      totalWeight += weight;
    }

    return smoothedPosition.divideScalar(totalWeight);
  }

  private updatePlayerPositions(): void {
    const now = Date.now();
    
    for (const [playerId, position] of this.playerPositions.entries()) {
      // Check if position is stale
      const timeSinceUpdate = now - position.timestamp;
      if (timeSinceUpdate > 5000) { // 5 seconds
        position.isTracked = false;
        position.trackingQuality = 'poor';
      }

      // Update tracking quality based on data freshness
      if (position.isTracked) {
        if (timeSinceUpdate < 1000) {
          position.trackingQuality = 'excellent';
        } else if (timeSinceUpdate < 2000) {
          position.trackingQuality = 'good';
        } else if (timeSinceUpdate < 3000) {
          position.trackingQuality = 'limited';
        } else {
          position.trackingQuality = 'poor';
        }
      }
    }

    this.emitTrackingEvent('positions_updated', {
      positions: Array.from(this.playerPositions.values())
    });
  }

  private getTrackingQuality(accuracy: number): PlayerPosition['trackingQuality'] {
    if (accuracy <= 3) return 'excellent';
    if (accuracy <= 5) return 'good';
    if (accuracy <= 10) return 'limited';
    return 'poor';
  }

  // Network player positions
  updateNetworkPlayerPosition(
    playerId: string, 
    worldPosition: THREE.Vector3, 
    gpsCoordinates?: PlayerPosition['gpsCoordinates']
  ): void {
    this.updatePlayerPosition(playerId, {
      worldPosition: worldPosition.clone(),
      gpsCoordinates,
      timestamp: Date.now(),
      isTracked: true,
      trackingQuality: 'good'
    });
  }

  removePlayer(playerId: string): void {
    this.playerPositions.delete(playerId);
    this.positionHistory.delete(playerId);
    this.orientationHistory.delete(playerId);
    
    this.emitTrackingEvent('player_removed', { playerId });
  }

  // Query methods
  getPlayerPosition(playerId: string): PlayerPosition | null {
    const position = this.playerPositions.get(playerId);
    return position ? { ...position, worldPosition: position.worldPosition.clone() } : null;
  }

  getAllPlayerPositions(): PlayerPosition[] {
    return Array.from(this.playerPositions.values()).map(pos => ({
      ...pos,
      worldPosition: pos.worldPosition.clone()
    }));
  }

  getPlayersInRange(centerPosition: THREE.Vector3, range: number): PlayerPosition[] {
    return this.getAllPlayerPositions().filter(position => {
      const distance = centerPosition.distanceTo(position.worldPosition);
      return distance <= range && position.isTracked;
    });
  }

  getCurrentPlayerPosition(): PlayerPosition | null {
    return this.getPlayerPosition('current_player');
  }

  getTrackingState(): ARTrackingState {
    return { ...this.trackingState, trackingErrors: [...this.trackingState.trackingErrors] };
  }

  isTracking(): boolean {
    return this.trackingState.isTracking;
  }

  getGeolocationReference(): GeolocationReference | null {
    return this.geolocationReference ? { ...this.geolocationReference } : null;
  }

  // Distance calculations
  calculateDistance(playerId1: string, playerId2: string): number | null {
    const pos1 = this.getPlayerPosition(playerId1);
    const pos2 = this.getPlayerPosition(playerId2);
    
    if (!pos1 || !pos2 || !pos1.isTracked || !pos2.isTracked) {
      return null;
    }

    return pos1.worldPosition.distanceTo(pos2.worldPosition);
  }

  calculateGPSDistance(coords1: GeolocationCoordinates, coords2: GeolocationCoordinates): number {
    const R = 6371000; // Earth's radius in meters
    const lat1 = coords1.latitude * Math.PI / 180;
    const lat2 = coords2.latitude * Math.PI / 180;
    const deltaLat = (coords2.latitude - coords1.latitude) * Math.PI / 180;
    const deltaLng = (coords2.longitude - coords1.longitude) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Statistics
  getTrackingStatistics(): {
    totalPlayers: number;
    trackedPlayers: number;
    averageAccuracy: number;
    lastGPSUpdate: number;
    lastOrientationUpdate: number;
    trackingErrors: number;
  } {
    const positions = this.getAllPlayerPositions();
    const trackedPositions = positions.filter(p => p.isTracked);
    
    const gpsPositions = trackedPositions.filter(p => p.gpsCoordinates);
    const averageAccuracy = gpsPositions.length > 0
      ? gpsPositions.reduce((sum, p) => sum + p.gpsCoordinates!.accuracy, 0) / gpsPositions.length
      : 0;

    return {
      totalPlayers: positions.length,
      trackedPlayers: trackedPositions.length,
      averageAccuracy,
      lastGPSUpdate: this.trackingState.lastGPSUpdate,
      lastOrientationUpdate: this.trackingState.lastOrientationUpdate,
      trackingErrors: this.trackingState.trackingErrors.length
    };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.trackingCallbacks.has(event)) {
      this.trackingCallbacks.set(event, []);
    }
    this.trackingCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.trackingCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitTrackingEvent(event: string, data: any): void {
    const callbacks = this.trackingCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('AR tracking event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<ARPlayerTrackingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): ARPlayerTrackingOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    this.stopTracking();
    
    // Clear data
    this.playerPositions.clear();
    this.positionHistory.clear();
    this.orientationHistory.clear();
    this.trackingCallbacks.clear();
    
    // Reset state
    this.geolocationReference = null;
    this.trackingState = {
      isTracking: false,
      hasGPSPermission: false,
      hasOrientationPermission: false,
      gpsAccuracy: 0,
      lastGPSUpdate: 0,
      lastOrientationUpdate: 0,
      trackingErrors: []
    };
  }
}