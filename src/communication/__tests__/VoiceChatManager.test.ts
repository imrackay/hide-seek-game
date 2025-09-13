import { VoiceChatManager } from '../VoiceChatManager';

// Mock WebRTC APIs
const mockMediaStream = {
  getTracks: jest.fn().mockReturnValue([{ enabled: true, stop: jest.fn() }]),
  getAudioTracks: jest.fn().mockReturnValue([{ enabled: true, stop: jest.fn() }])
};

const mockRTCPeerConnection = {
  addTrack: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
  close: jest.fn(),
  ontrack: null,
  onicecandidate: null,
  onconnectionstatechange: null,
  connectionState: 'connected'
};

const mockAudioContext = {
  createMediaStreamSource: jest.fn().mockReturnValue({ connect: jest.fn() }),
  createAnalyser: jest.fn().mockReturnValue({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: jest.fn()
  }),
  close: jest.fn().mockResolvedValue(undefined)
};

// Setup global mocks
(global as any).RTCPeerConnection = jest.fn().mockImplementation(() => mockRTCPeerConnection);
(global as any).AudioContext = jest.fn().mockImplementation(() => mockAudioContext);
(global as any).Audio = jest.fn().mockImplementation(() => ({ srcObject: null, autoplay: false, volume: 1 }));

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: { getUserMedia: jest.fn().mockResolvedValue(mockMediaStream) }
});

describe('VoiceChatManager', () => {
  let voiceChatManager: VoiceChatManager;

  beforeEach(() => {
    voiceChatManager = new VoiceChatManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    voiceChatManager.dispose();
  });

  it('should create VoiceChatManager instance', () => {
    expect(voiceChatManager).toBeInstanceOf(VoiceChatManager);
  });

  it('should initialize successfully', async () => {
    const result = await voiceChatManager.initialize();
    expect(result.success).toBe(true);
  });

  it('should create voice channel', async () => {
    await voiceChatManager.initialize();
    const channel = voiceChatManager.createVoiceChannel('test-channel', 'Test Channel');
    
    expect(channel).toBeDefined();
    expect(channel.id).toBe('test-channel');
    expect(channel.name).toBe('Test Channel');
  });

  it('should get voice statistics', () => {
    const stats = voiceChatManager.getVoiceStatistics();
    
    expect(stats).toBeDefined();
    expect(typeof stats.totalChannels).toBe('number');
    expect(typeof stats.isInitialized).toBe('boolean');
  });
});