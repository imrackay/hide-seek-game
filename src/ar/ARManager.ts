export interface AROptions {
  enableAR?: boolean;
  enableFallback?: boolean;
  preferredFrameRate?: number;
  enableLighting?: boolean;
  enableOcclusion?: boolean;
  enablePlaneDetection?: boolean;
  enableImageTracking?: boolean;
  maxTrackingImages?: number;
  sessionTimeout?: number;
}

export interface ARCapabilities {
  isSupported: boolean;
  hasWebXR: boolean;
  hasCamera: boolean;
  hasMotionSensors: boolean;
  supportedFeatures: ARFeature[];
  supportedModes: ARMode[];
  deviceType: 'mobile' | 'desktop' | 'headset' | 'unknown';
}

export type ARFeature = 
  | 'world-tracking' 
  | 'plane-detection' 
  | 'hit-testing' 
  | 'lighting-estimation' 
  | 'occlusion' 
  | 'image-tracking' 
  | 'face-tracking' 
  | 'hand-tracking';

export type ARMode = 'immersive-ar' | 'inline' | 'fallback';

export interface ARSession {
  id: string;
  mode: ARMode;
  isActive: boolean;
  startedAt: number;
  lastUpdate: number;
  frameRate: number;
  features: ARFeature[];
  referenceSpace?: XRReferenceSpace;
  session?: XRSession;
}

export interface ARTrackingState {
  isTracking: boolean;
  trackingQuality: 'poor' | 'limited' | 'normal' | 'good';
  lastTrackingUpdate: number;
  lostTrackingCount: number;
  trackingLostAt?: number;
  trackingRecoveredAt?: number;
}

export interface AREnvironmentData {
  lightEstimate?: {
    intensity: number;
    direction: THREE.Vector3;
    color: THREE.Color;
  };
  detectedPlanes: ARPlane[];
  trackedImages: ARTrackedImage[];
  anchors: ARAnchor[];
}

export interface ARPlane {
  id: string;
  type: 'horizontal' | 'vertical';
  center: THREE.Vector3;
  normal: THREE.Vector3;
  extent: { width: number; height: number };
  polygon: THREE.Vector3[];
  lastUpdate: number;
}

export interface ARTrackedImage {
  id: string;
  imageId: string;
  pose: THREE.Matrix4;
  trackingState: 'tracking' | 'limited' | 'not-tracking';
  lastUpdate: number;
}

export interface ARAnchor {
  id: string;
  pose: THREE.Matrix4;
  isTracked: boolean;
  createdAt: number;
  lastUpdate: number;
}

export interface ARFallbackOptions {
  enableGyroscope?: boolean;
  enableAccelerometer?: boolean;
  enableCompass?: boolean;
  enableGPS?: boolean;
  mockARData?: boolean;
}

import * as THREE from 'three';

export class ARManager {
  private options: Required<AROptions>;
  private capabilities: ARCapabilities | null = null;
  private currentSession: ARSession | null = null;
  private trackingState: ARTrackingState;
  private environmentData: AREnvironmentData;
  private arCallbacks: Map<string, Function[]> = new Map();
  private animationFrameId: number | null = null;
  private fallbackManager: ARFallbackManager | null = null;
  
  // WebXR components
  private xrSession: XRSession | null = null;
  private xrReferenceSpace: XRReferenceSpace | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;

  constructor(options: AROptions = {}) {
    this.options = {
      enableAR: options.enableAR !== false,
      enableFallback: options.enableFallback !== false,
      preferredFrameRate: options.preferredFrameRate || 60,
      enableLighting: options.enableLighting !== false,
      enableOcclusion: options.enableOcclusion !== false,
      enablePlaneDetection: options.enablePlaneDetection !== false,
      enableImageTracking: options.enableImageTracking !== false,
      maxTrackingImages: options.maxTrackingImages || 5,
      sessionTimeout: options.sessionTimeout || 1800000 // 30 minutes
    };

    this.trackingState = {
      isTracking: false,
      trackingQuality: 'poor',
      lastTrackingUpdate: 0,
      lostTrackingCount: 0
    };

    this.environmentData = {
      detectedPlanes: [],
      trackedImages: [],
      anchors: []
    };

    if (this.options.enableFallback) {
      this.fallbackManager = new ARFallbackManager();
    }
  }

  // Initialization and capability detection
  async initialize(): Promise<{ success: boolean; capabilities?: ARCapabilities; error?: string }> {
    try {
      // Detect AR capabilities
      this.capabilities = await this.detectARCapabilities();
      
      if (!this.capabilities.isSupported && !this.options.enableFallback) {
        return { 
          success: false, 
          error: 'AR not supported and fallback disabled',
          capabilities: this.capabilities 
        };
      }

      // Initialize fallback if needed
      if (!this.capabilities.isSupported && this.fallbackManager) {
        await this.fallbackManager.initialize();
      }

      this.emitAREvent('ar_initialized', { capabilities: this.capabilities });
      
      return { 
        success: true, 
        capabilities: this.capabilities 
      };
    } catch (error) {
      console.error('Failed to initialize AR:', error);
      return { 
        success: false, 
        error: 'Failed to initialize AR system' 
      };
    }
  }

  private async detectARCapabilities(): Promise<ARCapabilities> {
    const capabilities: ARCapabilities = {
      isSupported: false,
      hasWebXR: false,
      hasCamera: false,
      hasMotionSensors: false,
      supportedFeatures: [],
      supportedModes: [],
      deviceType: this.detectDeviceType()
    };

    // Check WebXR support
    if ('xr' in navigator) {
      capabilities.hasWebXR = true;
      
      try {
        // Check for immersive AR support
        const isARSupported = await navigator.xr!.isSessionSupported('immersive-ar');
        if (isARSupported) {
          capabilities.isSupported = true;
          capabilities.supportedModes.push('immersive-ar');
          capabilities.supportedFeatures.push('world-tracking');
        }

        // Check for inline AR support
        const isInlineSupported = await navigator.xr!.isSessionSupported('inline');
        if (isInlineSupported) {
          capabilities.supportedModes.push('inline');
        }
      } catch (error) {
        console.warn('WebXR session support check failed:', error);
      }
    }

    // Check camera access
    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        capabilities.hasCamera = devices.some(device => device.kind === 'videoinput');
      } catch (error) {
        console.warn('Camera detection failed:', error);
      }
    }

    // Check motion sensors
    if ('DeviceOrientationEvent' in window) {
      capabilities.hasMotionSensors = true;
    }

    // Determine supported features based on capabilities
    if (capabilities.isSupported) {
      capabilities.supportedFeatures.push(
        'hit-testing',
        'lighting-estimation'
      );

      if (this.options.enablePlaneDetection) {
        capabilities.supportedFeatures.push('plane-detection');
      }

      if (this.options.enableImageTracking) {
        capabilities.supportedFeatures.push('image-tracking');
      }

      if (this.options.enableOcclusion) {
        capabilities.supportedFeatures.push('occlusion');
      }
    }

    // Add fallback mode if enabled
    if (this.options.enableFallback) {
      capabilities.supportedModes.push('fallback');
    }

    return capabilities;
  }

  private detectDeviceType(): ARCapabilities['deviceType'] {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|tablet/.test(userAgent)) {
      return 'mobile';
    }
    
    if (/oculus|vive|hololens|magic leap/.test(userAgent)) {
      return 'headset';
    }
    
    return 'desktop';
  }

  // Session management
  async startARSession(
    mode: ARMode = 'immersive-ar',
    requiredFeatures: ARFeature[] = [],
    optionalFeatures: ARFeature[] = []
  ): Promise<{ success: boolean; session?: ARSession; error?: string }> {
    if (!this.capabilities) {
      return { success: false, error: 'AR not initialized' };
    }

    if (this.currentSession?.isActive) {
      return { success: false, error: 'AR session already active' };
    }

    try {
      let session: ARSession;

      if (mode === 'fallback' || (!this.capabilities.isSupported && this.options.enableFallback)) {
        session = await this.startFallbackSession();
      } else {
        session = await this.startWebXRSession(mode, requiredFeatures, optionalFeatures);
      }

      this.currentSession = session;
      this.trackingState.isTracking = true;
      this.trackingState.lastTrackingUpdate = Date.now();

      // Start render loop
      this.startRenderLoop();

      this.emitAREvent('session_started', { session });
      
      return { success: true, session };
    } catch (error) {
      console.error('Failed to start AR session:', error);
      return { success: false, error: 'Failed to start AR session' };
    }
  }

  private async startWebXRSession(
    mode: ARMode,
    requiredFeatures: ARFeature[],
    optionalFeatures: ARFeature[]
  ): Promise<ARSession> {
    if (!navigator.xr) {
      throw new Error('WebXR not available');
    }

    // Convert features to WebXR feature names
    const xrRequiredFeatures = this.convertToXRFeatures(requiredFeatures);
    const xrOptionalFeatures = this.convertToXRFeatures(optionalFeatures);

    // Request XR session
    this.xrSession = await navigator.xr.requestSession(mode as XRSessionMode, {
      requiredFeatures: xrRequiredFeatures,
      optionalFeatures: xrOptionalFeatures
    });

    // Set up reference space
    this.xrReferenceSpace = await this.xrSession.requestReferenceSpace('local');

    // Create session object
    const session: ARSession = {
      id: `ar_session_${Date.now()}`,
      mode,
      isActive: true,
      startedAt: Date.now(),
      lastUpdate: Date.now(),
      frameRate: this.options.preferredFrameRate,
      features: [...requiredFeatures, ...optionalFeatures],
      referenceSpace: this.xrReferenceSpace,
      session: this.xrSession
    };

    // Set up session event handlers
    this.xrSession.addEventListener('end', () => {
      this.handleSessionEnd();
    });

    return session;
  }

  private async startFallbackSession(): Promise<ARSession> {
    if (!this.fallbackManager) {
      throw new Error('Fallback manager not available');
    }

    await this.fallbackManager.start();

    return {
      id: `fallback_session_${Date.now()}`,
      mode: 'fallback',
      isActive: true,
      startedAt: Date.now(),
      lastUpdate: Date.now(),
      frameRate: this.options.preferredFrameRate,
      features: ['world-tracking'] // Basic fallback features
    };
  }

  private convertToXRFeatures(features: ARFeature[]): string[] {
    const featureMap: Record<ARFeature, string> = {
      'world-tracking': 'local',
      'plane-detection': 'plane-detection',
      'hit-testing': 'hit-test',
      'lighting-estimation': 'light-estimation',
      'occlusion': 'depth-sensing',
      'image-tracking': 'image-tracking',
      'face-tracking': 'face-tracking',
      'hand-tracking': 'hand-tracking'
    };

    return features.map(feature => featureMap[feature]).filter(Boolean);
  }

  async endARSession(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession?.isActive) {
      return { success: false, error: 'No active AR session' };
    }

    try {
      // Stop render loop
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      // End WebXR session
      if (this.xrSession) {
        await this.xrSession.end();
        this.xrSession = null;
        this.xrReferenceSpace = null;
      }

      // Stop fallback session
      if (this.fallbackManager) {
        this.fallbackManager.stop();
      }

      this.handleSessionEnd();
      
      return { success: true };
    } catch (error) {
      console.error('Failed to end AR session:', error);
      return { success: false, error: 'Failed to end AR session' };
    }
  }

  private handleSessionEnd(): void {
    if (this.currentSession) {
      this.currentSession.isActive = false;
      this.trackingState.isTracking = false;
      
      this.emitAREvent('session_ended', { 
        sessionId: this.currentSession.id,
        duration: Date.now() - this.currentSession.startedAt
      });
      
      this.currentSession = null;
    }

    // Clear environment data
    this.environmentData = {
      detectedPlanes: [],
      trackedImages: [],
      anchors: []
    };
  }

  // Render loop
  private startRenderLoop(): void {
    if (!this.currentSession?.isActive) return;

    const renderFrame = (timestamp: number, frame?: XRFrame) => {
      if (!this.currentSession?.isActive) return;

      try {
        // Update session
        this.currentSession.lastUpdate = timestamp;

        // Process WebXR frame
        if (frame && this.xrReferenceSpace) {
          this.processXRFrame(frame);
        }

        // Process fallback frame
        if (this.currentSession.mode === 'fallback' && this.fallbackManager) {
          this.processFallbackFrame(timestamp);
        }

        // Update tracking state
        this.updateTrackingState(timestamp);

        // Emit frame event
        this.emitAREvent('frame_update', {
          timestamp,
          session: this.currentSession,
          trackingState: this.trackingState,
          environmentData: this.environmentData
        });

        // Schedule next frame
        if (this.xrSession) {
          this.animationFrameId = this.xrSession.requestAnimationFrame(renderFrame);
        } else {
          this.animationFrameId = requestAnimationFrame((ts) => renderFrame(ts));
        }
      } catch (error) {
        console.error('Render frame error:', error);
        this.handleTrackingLost();
      }
    };

    // Start the loop
    if (this.xrSession) {
      this.animationFrameId = this.xrSession.requestAnimationFrame(renderFrame);
    } else {
      this.animationFrameId = requestAnimationFrame((ts) => renderFrame(ts));
    }
  }

  private processXRFrame(frame: XRFrame): void {
    if (!this.xrReferenceSpace) return;

    // Get viewer pose
    const pose = frame.getViewerPose(this.xrReferenceSpace);
    if (!pose) {
      this.handleTrackingLost();
      return;
    }

    // Update tracking state
    this.trackingState.isTracking = true;
    this.trackingState.trackingQuality = 'good';
    this.trackingState.lastTrackingUpdate = Date.now();

    // Process detected planes
    if (this.options.enablePlaneDetection && frame.detectedPlanes) {
      this.processDetectedPlanes(frame);
    }

    // Process tracked images
    if (this.options.enableImageTracking && frame.trackedImages) {
      this.processTrackedImages(frame);
    }

    // Process lighting estimation
    if (this.options.enableLighting && frame.lightEstimate) {
      this.processLightingEstimate(frame);
    }
  }

  private processFallbackFrame(timestamp: number): void {
    if (!this.fallbackManager) return;

    const fallbackData = this.fallbackManager.getFrameData();
    
    // Update tracking state based on fallback data
    this.trackingState.isTracking = fallbackData.isTracking;
    this.trackingState.trackingQuality = fallbackData.quality;
    this.trackingState.lastTrackingUpdate = timestamp;
  }

  private processDetectedPlanes(frame: XRFrame): void {
    // Implementation would process XR detected planes
    // This is a simplified version
    this.environmentData.detectedPlanes = [];
  }

  private processTrackedImages(frame: XRFrame): void {
    // Implementation would process XR tracked images
    // This is a simplified version
    this.environmentData.trackedImages = [];
  }

  private processLightingEstimate(frame: XRFrame): void {
    // Implementation would process XR lighting estimation
    // This is a simplified version
    if (!this.environmentData.lightEstimate) {
      this.environmentData.lightEstimate = {
        intensity: 1.0,
        direction: new THREE.Vector3(0, 1, 0),
        color: new THREE.Color(0xffffff)
      };
    }
  }

  private updateTrackingState(timestamp: number): void {
    const timeSinceLastUpdate = timestamp - this.trackingState.lastTrackingUpdate;
    
    // Check for tracking timeout
    if (timeSinceLastUpdate > 5000) { // 5 seconds
      this.handleTrackingLost();
    }
  }

  private handleTrackingLost(): void {
    if (this.trackingState.isTracking) {
      this.trackingState.isTracking = false;
      this.trackingState.trackingLostAt = Date.now();
      this.trackingState.lostTrackingCount++;
      
      this.emitAREvent('tracking_lost', {
        lostAt: this.trackingState.trackingLostAt,
        lostCount: this.trackingState.lostTrackingCount
      });
    }
  }

  // Public API methods
  getCapabilities(): ARCapabilities | null {
    return this.capabilities;
  }

  getCurrentSession(): ARSession | null {
    return this.currentSession;
  }

  getTrackingState(): ARTrackingState {
    return { ...this.trackingState };
  }

  getEnvironmentData(): AREnvironmentData {
    return {
      lightEstimate: this.environmentData.lightEstimate ? {
        ...this.environmentData.lightEstimate,
        direction: this.environmentData.lightEstimate.direction.clone(),
        color: this.environmentData.lightEstimate.color.clone()
      } : undefined,
      detectedPlanes: [...this.environmentData.detectedPlanes],
      trackedImages: [...this.environmentData.trackedImages],
      anchors: [...this.environmentData.anchors]
    };
  }

  isSessionActive(): boolean {
    return this.currentSession?.isActive || false;
  }

  isARSupported(): boolean {
    return this.capabilities?.isSupported || false;
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.arCallbacks.has(event)) {
      this.arCallbacks.set(event, []);
    }
    this.arCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.arCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitAREvent(event: string, data: any): void {
    const callbacks = this.arCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('AR event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<AROptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): AROptions {
    return { ...this.options };
  }

  // Cleanup
  async dispose(): Promise<void> {
    // End active session
    if (this.currentSession?.isActive) {
      await this.endARSession();
    }

    // Dispose fallback manager
    if (this.fallbackManager) {
      this.fallbackManager.dispose();
      this.fallbackManager = null;
    }

    // Clear callbacks
    this.arCallbacks.clear();
    
    // Clear data
    this.capabilities = null;
    this.currentSession = null;
  }
}

// Fallback AR implementation for devices without WebXR
class ARFallbackManager {
  private isActive = false;
  private deviceOrientation: DeviceOrientationEvent | null = null;
  private deviceMotion: DeviceMotionEvent | null = null;
  private lastUpdate = 0;

  async initialize(): Promise<void> {
    // Request device orientation permission on iOS
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      const permission = await (DeviceOrientationEvent as any).requestPermission();
      if (permission !== 'granted') {
        throw new Error('Device orientation permission denied');
      }
    }
  }

  async start(): Promise<void> {
    this.isActive = true;
    
    // Set up device orientation listener
    window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
    window.addEventListener('devicemotion', this.handleDeviceMotion.bind(this));
  }

  stop(): void {
    this.isActive = false;
    
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
    window.removeEventListener('devicemotion', this.handleDeviceMotion.bind(this));
  }

  private handleDeviceOrientation(event: DeviceOrientationEvent): void {
    if (!this.isActive) return;
    
    this.deviceOrientation = event;
    this.lastUpdate = Date.now();
  }

  private handleDeviceMotion(event: DeviceMotionEvent): void {
    if (!this.isActive) return;
    
    this.deviceMotion = event;
  }

  getFrameData(): {
    isTracking: boolean;
    quality: ARTrackingState['trackingQuality'];
    orientation?: DeviceOrientationEvent;
    motion?: DeviceMotionEvent;
  } {
    const timeSinceUpdate = Date.now() - this.lastUpdate;
    const isTracking = this.isActive && timeSinceUpdate < 1000; // 1 second timeout
    
    let quality: ARTrackingState['trackingQuality'] = 'poor';
    if (isTracking) {
      quality = this.deviceOrientation ? 'limited' : 'poor';
    }

    return {
      isTracking,
      quality,
      orientation: this.deviceOrientation,
      motion: this.deviceMotion
    };
  }

  dispose(): void {
    this.stop();
    this.deviceOrientation = null;
    this.deviceMotion = null;
  }
}