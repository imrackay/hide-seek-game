import { ARManager, ARCapabilities, ARSession } from '../ARManager';

// Mock WebXR API
const mockXRSession = {
  requestReferenceSpace: jest.fn().mockResolvedValue({}),
  requestAnimationFrame: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const mockNavigatorXR = {
  isSessionSupported: jest.fn(),
  requestSession: jest.fn().mockResolvedValue(mockXRSession)
};

// Mock MediaDevices API
const mockMediaDevices = {
  enumerateDevices: jest.fn().mockResolvedValue([
    { kind: 'videoinput', deviceId: 'camera1' },
    { kind: 'audioinput', deviceId: 'mic1' }
  ]),
  getUserMedia: jest.fn()
};

// Mock DeviceOrientationEvent
const mockDeviceOrientationEvent = {
  requestPermission: jest.fn().mockResolvedValue('granted')
};

// Set up global mocks
Object.defineProperty(navigator, 'xr', {
  value: mockNavigatorXR,
  writable: true
});

Object.defineProperty(navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true
});

Object.defineProperty(window, 'DeviceOrientationEvent', {
  value: mockDeviceOrientationEvent,
  writable: true
});

describe('ARManager', () => {
  let arManager: ARManager;

  beforeEach(() => {
    jest.clearAllMocks();
    arManager = new ARManager({
      enableAR: true,
      enableFallback: true,
      enablePlaneDetection: true,
      enableImageTracking: true,
      enableLighting: true
    });
  });

  afterEach(async () => {
    await arManager.dispose();
  });

  describe('Initialization', () => {
    it('should initialize successfully with AR support', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      
      const result = await arManager.initialize();
      
      expect(result.success).toBe(true);
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities!.isSupported).toBe(true);
      expect(result.capabilities!.hasWebXR).toBe(true);
    });

    it('should initialize with fallback when AR not supported', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(false);
      
      const result = await arManager.initialize();
      
      expect(result.success).toBe(true);
      expect(result.capabilities!.isSupported).toBe(false);
      expect(result.capabilities!.supportedModes).toContain('fallback');
    });

    it('should fail initialization when AR not supported and fallback disabled', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(false);
      
      const noFallbackManager = new ARManager({ enableFallback: false });
      const result = await noFallbackManager.initialize();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('AR not supported and fallback disabled');
      
      await noFallbackManager.dispose();
    });

    it('should detect device capabilities correctly', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      
      const result = await arManager.initialize();
      
      expect(result.capabilities!.hasCamera).toBe(true);
      expect(result.capabilities!.hasMotionSensors).toBe(true);
      expect(result.capabilities!.supportedFeatures).toContain('world-tracking');
      expect(result.capabilities!.supportedFeatures).toContain('plane-detection');
    });

    it('should handle initialization errors gracefully', async () => {
      mockNavigatorXR.isSessionSupported.mockRejectedValue(new Error('XR Error'));
      
      const result = await arManager.initialize();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to initialize AR system');
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should start WebXR session successfully', async () => {
      const result = await arManager.startARSession('immersive-ar', ['world-tracking'], ['plane-detection']);
      
      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.mode).toBe('immersive-ar');
      expect(result.session!.isActive).toBe(true);
      expect(mockNavigatorXR.requestSession).toHaveBeenCalledWith('immersive-ar', {
        requiredFeatures: ['local'],
        optionalFeatures: ['plane-detection']
      });
    });

    it('should start fallback session when WebXR fails', async () => {
      mockNavigatorXR.requestSession.mockRejectedValue(new Error('XR Session Error'));
      
      const result = await arManager.startARSession('fallback');
      
      expect(result.success).toBe(true);
      expect(result.session!.mode).toBe('fallback');
    });

    it('should fail to start session when one is already active', async () => {
      await arManager.startARSession('immersive-ar');
      
      const result = await arManager.startARSession('immersive-ar');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('AR session already active');
    });

    it('should end session successfully', async () => {
      await arManager.startARSession('immersive-ar');
      
      const result = await arManager.endARSession();
      
      expect(result.success).toBe(true);
      expect(mockXRSession.end).toHaveBeenCalled();
      expect(arManager.isSessionActive()).toBe(false);
    });

    it('should fail to end session when none is active', async () => {
      const result = await arManager.endARSession();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active AR session');
    });
  });

  describe('Tracking State', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should return initial tracking state', () => {
      const trackingState = arManager.getTrackingState();
      
      expect(trackingState.isTracking).toBe(false);
      expect(trackingState.trackingQuality).toBe('poor');
      expect(trackingState.lostTrackingCount).toBe(0);
    });

    it('should update tracking state when session starts', async () => {
      await arManager.startARSession('immersive-ar');
      
      const trackingState = arManager.getTrackingState();
      
      expect(trackingState.isTracking).toBe(true);
      expect(trackingState.lastTrackingUpdate).toBeGreaterThan(0);
    });
  });

  describe('Environment Data', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should return initial environment data', () => {
      const envData = arManager.getEnvironmentData();
      
      expect(envData.detectedPlanes).toEqual([]);
      expect(envData.trackedImages).toEqual([]);
      expect(envData.anchors).toEqual([]);
      expect(envData.lightEstimate).toBeUndefined();
    });

    it('should clear environment data when session ends', async () => {
      await arManager.startARSession('immersive-ar');
      await arManager.endARSession();
      
      const envData = arManager.getEnvironmentData();
      
      expect(envData.detectedPlanes).toEqual([]);
      expect(envData.trackedImages).toEqual([]);
      expect(envData.anchors).toEqual([]);
    });
  });

  describe('Capabilities Detection', () => {
    it('should detect mobile device type', async () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        writable: true
      });

      const mobileManager = new ARManager();
      await mobileManager.initialize();
      
      const capabilities = mobileManager.getCapabilities();
      expect(capabilities!.deviceType).toBe('mobile');
      
      await mobileManager.dispose();
    });

    it('should detect desktop device type', async () => {
      // Mock desktop user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        writable: true
      });

      const desktopManager = new ARManager();
      await desktopManager.initialize();
      
      const capabilities = desktopManager.getCapabilities();
      expect(capabilities!.deviceType).toBe('desktop');
      
      await desktopManager.dispose();
    });

    it('should detect headset device type', async () => {
      // Mock headset user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 OculusBrowser',
        writable: true
      });

      const headsetManager = new ARManager();
      await headsetManager.initialize();
      
      const capabilities = headsetManager.getCapabilities();
      expect(capabilities!.deviceType).toBe('headset');
      
      await headsetManager.dispose();
    });
  });

  describe('Feature Support', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should include enabled features in capabilities', () => {
      const capabilities = arManager.getCapabilities();
      
      expect(capabilities!.supportedFeatures).toContain('plane-detection');
      expect(capabilities!.supportedFeatures).toContain('image-tracking');
      expect(capabilities!.supportedFeatures).toContain('lighting-estimation');
    });

    it('should exclude disabled features from capabilities', async () => {
      const limitedManager = new ARManager({
        enablePlaneDetection: false,
        enableImageTracking: false,
        enableLighting: false
      });
      
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await limitedManager.initialize();
      
      const capabilities = limitedManager.getCapabilities();
      
      expect(capabilities!.supportedFeatures).not.toContain('plane-detection');
      expect(capabilities!.supportedFeatures).not.toContain('image-tracking');
      expect(capabilities!.supportedFeatures).not.toContain('lighting-estimation');
      
      await limitedManager.dispose();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should emit initialization event', (done) => {
      const newManager = new ARManager();
      
      newManager.addEventListener('ar_initialized', (data: any) => {
        expect(data.capabilities).toBeDefined();
        newManager.dispose().then(() => done());
      });

      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      newManager.initialize();
    });

    it('should emit session started event', (done) => {
      arManager.addEventListener('session_started', (data: any) => {
        expect(data.session).toBeDefined();
        expect(data.session.mode).toBe('immersive-ar');
        done();
      });

      arManager.startARSession('immersive-ar');
    });

    it('should emit session ended event', (done) => {
      arManager.addEventListener('session_ended', (data: any) => {
        expect(data.sessionId).toBeDefined();
        expect(data.duration).toBeGreaterThan(0);
        done();
      });

      arManager.startARSession('immersive-ar').then(() => {
        setTimeout(() => {
          arManager.endARSession();
        }, 10);
      });
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      arManager.addEventListener('session_started', callback);
      arManager.removeEventListener('session_started', callback);
      
      arManager.startARSession('immersive-ar');
      
      // Give some time for potential event emission
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
      }, 10);
    });
  });

  describe('Fallback Mode', () => {
    it('should handle device orientation permission request', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(false);
      
      const result = await arManager.initialize();
      expect(result.success).toBe(true);
      
      const sessionResult = await arManager.startARSession('fallback');
      expect(sessionResult.success).toBe(true);
      expect(sessionResult.session!.mode).toBe('fallback');
    });

    it('should handle device orientation permission denial', async () => {
      mockDeviceOrientationEvent.requestPermission.mockResolvedValue('denied');
      mockNavigatorXR.isSessionSupported.mockResolvedValue(false);
      
      const result = await arManager.initialize();
      expect(result.success).toBe(true);
      
      // Should still work but with limited functionality
      const sessionResult = await arManager.startARSession('fallback');
      expect(sessionResult.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle WebXR session creation errors', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      mockNavigatorXR.requestSession.mockRejectedValue(new Error('Session creation failed'));
      
      await arManager.initialize();
      
      const result = await arManager.startARSession('immersive-ar');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to start AR session');
    });

    it('should handle reference space creation errors', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      mockXRSession.requestReferenceSpace.mockRejectedValue(new Error('Reference space error'));
      
      await arManager.initialize();
      
      const result = await arManager.startARSession('immersive-ar');
      
      expect(result.success).toBe(false);
    });

    it('should handle camera enumeration errors', async () => {
      mockMediaDevices.enumerateDevices.mockRejectedValue(new Error('Camera error'));
      
      const result = await arManager.initialize();
      
      // Should still succeed but with hasCamera = false
      expect(result.success).toBe(true);
      expect(result.capabilities!.hasCamera).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        preferredFrameRate: 30,
        enableLighting: false
      };

      arManager.updateOptions(newOptions);
      const options = arManager.getOptions();

      expect(options.preferredFrameRate).toBe(30);
      expect(options.enableLighting).toBe(false);
    });

    it('should return current options', () => {
      const options = arManager.getOptions();
      
      expect(options.enableAR).toBe(true);
      expect(options.enableFallback).toBe(true);
      expect(options.enablePlaneDetection).toBe(true);
    });
  });

  describe('Public API', () => {
    beforeEach(async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
    });

    it('should return capabilities', () => {
      const capabilities = arManager.getCapabilities();
      
      expect(capabilities).toBeDefined();
      expect(capabilities!.isSupported).toBe(true);
    });

    it('should return current session', async () => {
      expect(arManager.getCurrentSession()).toBeNull();
      
      await arManager.startARSession('immersive-ar');
      
      const session = arManager.getCurrentSession();
      expect(session).toBeDefined();
      expect(session!.isActive).toBe(true);
    });

    it('should check if session is active', async () => {
      expect(arManager.isSessionActive()).toBe(false);
      
      await arManager.startARSession('immersive-ar');
      
      expect(arManager.isSessionActive()).toBe(true);
    });

    it('should check if AR is supported', () => {
      expect(arManager.isARSupported()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', async () => {
      mockNavigatorXR.isSessionSupported.mockResolvedValue(true);
      await arManager.initialize();
      await arManager.startARSession('immersive-ar');
      
      await arManager.dispose();
      
      expect(arManager.isSessionActive()).toBe(false);
      expect(arManager.getCapabilities()).toBeNull();
    });

    it('should handle disposal without active session', async () => {
      await arManager.initialize();
      
      await expect(arManager.dispose()).resolves.not.toThrow();
    });
  });
});