// Jest setup file
import '@testing-library/jest-dom';

// Mock WebRTC APIs globally
Object.defineProperty(window, 'RTCPeerConnection', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    addTrack: jest.fn(),
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'test-sdp' }),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'test-sdp' }),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    ontrack: null,
    onconnectionstatechange: null,
    onicecandidate: null,
    connectionState: 'new',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
});

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: jest.fn().mockReturnValue([{
        stop: jest.fn(),
        kind: 'audio',
        enabled: true
      }]),
      getAudioTracks: jest.fn().mockReturnValue([{
        stop: jest.fn(),
        kind: 'audio',
        enabled: true
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
    createGain: jest.fn().mockReturnValue({
      gain: { value: 1 },
      connect: jest.fn()
    }),
    destination: {},
    close: jest.fn().mockResolvedValue(undefined)
  }))
});

// Mock performance API
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: jest.fn(() => Date.now())
  }
});

// Mock THREE.js globally
jest.mock('three', () => ({
  Vector3: jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
    x, y, z,
    clone: jest.fn().mockReturnThis(),
    copy: jest.fn().mockReturnThis(),
    add: jest.fn().mockReturnThis(),
    sub: jest.fn().mockReturnThis(),
    multiply: jest.fn().mockReturnThis(),
    multiplyScalar: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    length: jest.fn().mockReturnValue(1),
    distanceTo: jest.fn().mockReturnValue(1),
    set: jest.fn().mockReturnThis()
  })),
  Box3: jest.fn().mockImplementation(() => ({
    min: { x: -10, y: -10, z: -10 },
    max: { x: 10, y: 10, z: 10 },
    clampPoint: jest.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
    containsPoint: jest.fn().mockReturnValue(true),
    expandByPoint: jest.fn().mockReturnThis(),
    setFromObject: jest.fn().mockReturnThis()
  })),
  Scene: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    traverse: jest.fn()
  })),
  Mesh: jest.fn().mockImplementation(() => ({
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    userData: {},
    geometry: { dispose: jest.fn() },
    material: { dispose: jest.fn() }
  })),
  Raycaster: jest.fn().mockImplementation(() => ({
    setFromCamera: jest.fn(),
    intersectObjects: jest.fn().mockReturnValue([])
  })),
  CylinderGeometry: jest.fn(),
  BoxGeometry: jest.fn(),
  SphereGeometry: jest.fn(),
  MeshBasicMaterial: jest.fn(),
  MeshLambertMaterial: jest.fn()
}));

// Suppress console warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});