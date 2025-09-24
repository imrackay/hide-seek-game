import { ARPlayerTracker, PlayerPosition, ARTrackingState } from '../ARPlayerTracker';
import * as THREE from 'three';

// Mock Geolocation API
const mockGeolocation = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn()
};

// Mock DeviceOrientationEvent
const mockDeviceOrientationEvent = {
  requestPermission: jest.fn().mockResolvedValue('granted')
};

// Set up global mocks
Object.defineProperty(navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true
});

Object.defineProperty(window, 'DeviceOrientationEvent', {
  value: mockDeviceOrientationEvent,
  writable: true
});

describe('ARPlayerTracker', () => {
  let tracker: ARPlayerTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new ARPlayerTracker({
      enableGPS: true,
      enableDeviceSensors: true,
      enableCompass: true,
      gpsAccuracyThreshold: 10,
      trackingUpdateInterval: 100,
      enablePositionSmoothing: true
    });
  });

  afterEach(() => {
    tracker.dispose();
  });

  describe('Initialization', () => {
    it('should initialize successfully with GPS and orientation permissions', async () => {
      // Mock successful GPS permission
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      const result = await tracker.initialize();
      
      expect(result.success).toBe(true);
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
      expect(mockDeviceOrientationEvent.requestPermission).toHaveBeenCalled();
    });

    it('should handle GPS permission denial gracefully', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({
          code: 1, // PERMISSION_DENIED
          message: 'Permission denied'
        });
      });

      const result = await tracker.initialize();
      
      expect(result.success).toBe(true); // Should still succeed with orientation
      const trackingState = tracker.getTrackingState();
      expect(trackingState.hasGPSPermission).toBe(false);
      expect(trackingState.trackingErrors.length).toBeGreaterThan(0);
    });

    it('should handle orientation permission denial', async () => {
      mockDeviceOrientationEvent.requestPermission.mockResolvedValue('denied');
      
      // Mock successful GPS
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      const result = await tracker.initialize();
      
      expect(result.success).toBe(true); // Should still succeed with GPS
      const trackingState = tracker.getTrackingState();
      expect(trackingState.hasOrientationPermission).toBe(false);
    });

    it('should fail when both GPS and orientation are denied', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
        error({ code: 1, message: 'Permission denied' });
      });
      
      mockDeviceOrientationEvent.requestPermission.mockResolvedValue('denied');

      const result = await tracker.initialize();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No tracking methods available');
    });
  });

  describe('GPS Tracking', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: 10,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should start GPS tracking successfully', async () => {
      mockGeolocation.watchPosition.mockReturnValue(123);

      const result = await tracker.startTracking('player1');
      
      expect(result.success).toBe(true);
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
      expect(tracker.isTracking()).toBe(true);
    });

    it('should handle GPS position updates', async () => {
      let positionCallback: Function;
      mockGeolocation.watchPosition.mockImplementation((callback) => {
        positionCallback = callback;
        return 123;
      });

      await tracker.startTracking('player1');

      // Simulate GPS update
      positionCallback({
        coords: {
          latitude: 40.7130, // Slightly different position
          longitude: -74.0062,
          accuracy: 3,
          altitude: 12,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      });

      const position = tracker.getCurrentPlayerPosition();
      expect(position).toBeDefined();
      expect(position!.isTracked).toBe(true);
      expect(position!.gpsCoordinates).toBeDefined();
      expect(position!.trackingQuality).toBe('excellent'); // accuracy = 3
    });

    it('should reject inaccurate GPS readings', async () => {
      let positionCallback: Function;
      mockGeolocation.watchPosition.mockImplementation((callback) => {
        positionCallback = callback;
        return 123;
      });

      await tracker.startTracking('player1');

      // Simulate inaccurate GPS update
      positionCallback({
        coords: {
          latitude: 40.7130,
          longitude: -74.0062,
          accuracy: 50, // Above threshold
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      });

      const position = tracker.getCurrentPlayerPosition();
      // Should not update position due to poor accuracy
      expect(position?.gpsCoordinates?.accuracy).not.toBe(50);
    });

    it('should handle GPS errors', async () => {
      let errorCallback: Function;
      mockGeolocation.watchPosition.mockImplementation((success, error) => {
        errorCallback = error;
        return 123;
      });

      await tracker.startTracking('player1');

      // Simulate GPS error
      errorCallback({
        code: 2, // POSITION_UNAVAILABLE
        message: 'Position unavailable'
      });

      const trackingState = tracker.getTrackingState();
      expect(trackingState.trackingErrors).toContain('GPS position unavailable');
    });
  });

  describe('Device Orientation Tracking', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should handle device orientation updates', async () => {
      await tracker.startTracking('player1');

      // Simulate orientation event
      const orientationEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(orientationEvent, 'alpha', { value: 45 });
      Object.defineProperty(orientationEvent, 'beta', { value: 10 });
      Object.defineProperty(orientationEvent, 'gamma', { value: -5 });

      window.dispatchEvent(orientationEvent);

      const position = tracker.getCurrentPlayerPosition();
      expect(position?.deviceOrientation).toEqual({
        alpha: 45,
        beta: 10,
        gamma: -5
      });
    });

    it('should ignore orientation events with null values', async () => {
      await tracker.startTracking('player1');

      // Simulate orientation event with null values
      const orientationEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(orientationEvent, 'alpha', { value: null });
      Object.defineProperty(orientationEvent, 'beta', { value: 10 });
      Object.defineProperty(orientationEvent, 'gamma', { value: -5 });

      window.dispatchEvent(orientationEvent);

      const position = tracker.getCurrentPlayerPosition();
      expect(position?.deviceOrientation).toBeUndefined();
    });
  });

  describe('Position Management', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should update network player positions', () => {
      const position = new THREE.Vector3(10, 0, 5);
      const gpsCoords = {
        latitude: 40.7130,
        longitude: -74.0062,
        accuracy: 3
      };

      tracker.updateNetworkPlayerPosition('player2', position, gpsCoords);

      const playerPosition = tracker.getPlayerPosition('player2');
      expect(playerPosition).toBeDefined();
      expect(playerPosition!.worldPosition).toEqual(position);
      expect(playerPosition!.gpsCoordinates).toEqual(gpsCoords);
      expect(playerPosition!.isTracked).toBe(true);
    });

    it('should remove players', () => {
      const position = new THREE.Vector3(10, 0, 5);
      tracker.updateNetworkPlayerPosition('player2', position);

      expect(tracker.getPlayerPosition('player2')).toBeDefined();

      tracker.removePlayer('player2');

      expect(tracker.getPlayerPosition('player2')).toBeNull();
    });

    it('should get all player positions', () => {
      tracker.updateNetworkPlayerPosition('player1', new THREE.Vector3(0, 0, 0));
      tracker.updateNetworkPlayerPosition('player2', new THREE.Vector3(10, 0, 5));
      tracker.updateNetworkPlayerPosition('player3', new THREE.Vector3(-5, 0, 10));

      const allPositions = tracker.getAllPlayerPositions();
      expect(allPositions).toHaveLength(3);
      expect(allPositions.map(p => p.playerId)).toContain('player1');
      expect(allPositions.map(p => p.playerId)).toContain('player2');
      expect(allPositions.map(p => p.playerId)).toContain('player3');
    });

    it('should get players in range', () => {
      tracker.updateNetworkPlayerPosition('player1', new THREE.Vector3(0, 0, 0));
      tracker.updateNetworkPlayerPosition('player2', new THREE.Vector3(5, 0, 0));
      tracker.updateNetworkPlayerPosition('player3', new THREE.Vector3(20, 0, 0));

      const center = new THREE.Vector3(0, 0, 0);
      const playersInRange = tracker.getPlayersInRange(center, 10);

      expect(playersInRange).toHaveLength(2);
      expect(playersInRange.map(p => p.playerId)).toContain('player1');
      expect(playersInRange.map(p => p.playerId)).toContain('player2');
      expect(playersInRange.map(p => p.playerId)).not.toContain('player3');
    });
  });

  describe('Position Smoothing', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should smooth position updates', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2, 0, 0),
        new THREE.Vector3(4, 0, 0),
        new THREE.Vector3(6, 0, 0)
      ];

      // Update positions sequentially
      positions.forEach(pos => {
        tracker.updateNetworkPlayerPosition('player1', pos);
      });

      const finalPosition = tracker.getPlayerPosition('player1');
      
      // Smoothed position should be different from the last raw position
      expect(finalPosition!.worldPosition).not.toEqual(positions[positions.length - 1]);
      
      // But should be close to it
      const distance = finalPosition!.worldPosition.distanceTo(positions[positions.length - 1]);
      expect(distance).toBeLessThan(2);
    });
  });

  describe('Distance Calculations', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should calculate distance between players', () => {
      tracker.updateNetworkPlayerPosition('player1', new THREE.Vector3(0, 0, 0));
      tracker.updateNetworkPlayerPosition('player2', new THREE.Vector3(3, 4, 0)); // 5 units away

      const distance = tracker.calculateDistance('player1', 'player2');
      
      expect(distance).toBeCloseTo(5, 1);
    });

    it('should return null for non-existent players', () => {
      const distance = tracker.calculateDistance('player1', 'nonexistent');
      
      expect(distance).toBeNull();
    });

    it('should calculate GPS distance correctly', () => {
      const coords1 = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      };

      const coords2 = {
        latitude: 40.7614, // ~5.4km north
        longitude: -73.9776, // ~2.8km east
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      };

      const distance = tracker.calculateGPSDistance(coords1, coords2);
      
      // Should be approximately 6.1km
      expect(distance).toBeGreaterThan(6000);
      expect(distance).toBeLessThan(7000);
    });
  });

  describe('Tracking State', () => {
    it('should provide accurate tracking state', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
      
      const trackingState = tracker.getTrackingState();
      
      expect(trackingState.hasGPSPermission).toBe(true);
      expect(trackingState.hasOrientationPermission).toBe(true);
      expect(trackingState.isTracking).toBe(false); // Not started yet
      expect(trackingState.trackingErrors).toEqual([]);
    });

    it('should update tracking state when tracking starts', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
      await tracker.startTracking('player1');
      
      const trackingState = tracker.getTrackingState();
      
      expect(trackingState.isTracking).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should provide tracking statistics', () => {
      tracker.updateNetworkPlayerPosition('player1', new THREE.Vector3(0, 0, 0), {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 3
      });
      
      tracker.updateNetworkPlayerPosition('player2', new THREE.Vector3(10, 0, 5), {
        latitude: 40.7130,
        longitude: -74.0062,
        accuracy: 7
      });

      const stats = tracker.getTrackingStatistics();
      
      expect(stats.totalPlayers).toBe(2);
      expect(stats.trackedPlayers).toBe(2);
      expect(stats.averageAccuracy).toBe(5); // (3 + 7) / 2
      expect(stats.trackingErrors).toBe(0);
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
    });

    it('should emit tracking started event', (done) => {
      tracker.addEventListener('tracking_started', (data: any) => {
        expect(data.playerId).toBe('player1');
        done();
      });

      tracker.startTracking('player1');
    });

    it('should emit GPS updated event', (done) => {
      let positionCallback: Function;
      mockGeolocation.watchPosition.mockImplementation((callback) => {
        positionCallback = callback;
        return 123;
      });

      tracker.addEventListener('gps_updated', (data: any) => {
        expect(data.position).toBeDefined();
        expect(data.accuracy).toBe(3);
        done();
      });

      tracker.startTracking('player1').then(() => {
        positionCallback({
          coords: {
            latitude: 40.7130,
            longitude: -74.0062,
            accuracy: 3,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      tracker.addEventListener('tracking_started', callback);
      tracker.removeEventListener('tracking_started', callback);
      
      tracker.startTracking('player1');
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        gpsAccuracyThreshold: 5,
        trackingUpdateInterval: 50
      };

      tracker.updateOptions(newOptions);
      const options = tracker.getOptions();

      expect(options.gpsAccuracyThreshold).toBe(5);
      expect(options.trackingUpdateInterval).toBe(50);
    });

    it('should return current options', () => {
      const options = tracker.getOptions();
      
      expect(options.enableGPS).toBe(true);
      expect(options.enableDeviceSensors).toBe(true);
      expect(options.gpsAccuracyThreshold).toBe(10);
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      });

      await tracker.initialize();
      await tracker.startTracking('player1');
      
      tracker.updateNetworkPlayerPosition('player2', new THREE.Vector3(10, 0, 5));
      
      tracker.dispose();
      
      expect(tracker.isTracking()).toBe(false);
      expect(tracker.getAllPlayerPositions()).toHaveLength(0);
      expect(mockGeolocation.clearWatch).toHaveBeenCalled();
    });
  });
});