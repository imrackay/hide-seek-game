export interface SessionData {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  isGuest: boolean;
  createdAt: number;
  lastActivity: number;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
  };
}

export interface SessionOptions {
  maxSessions?: number;
  sessionTimeout?: number; // in milliseconds
  enableDeviceTracking?: boolean;
  enableLocationTracking?: boolean;
  autoCleanupInterval?: number; // in milliseconds
}

export class SessionManager {
  private options: Required<SessionOptions>;
  private activeSessions: Map<string, SessionData> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sessionCallbacks: Map<string, Function[]> = new Map();

  constructor(options: SessionOptions = {}) {
    this.options = {
      maxSessions: options.maxSessions || 5,
      sessionTimeout: options.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
      enableDeviceTracking: options.enableDeviceTracking !== false,
      enableLocationTracking: options.enableLocationTracking || false,
      autoCleanupInterval: options.autoCleanupInterval || 60 * 60 * 1000 // 1 hour
    };

    this.startAutoCleanup();
  }

  // Session creation and management
  createSession(userId: string, username: string, displayName: string, isGuest: boolean = false): SessionData {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    // Check session limit for user
    this.enforceSessionLimit(userId);

    const sessionData: SessionData = {
      id: sessionId,
      userId,
      username,
      displayName,
      isGuest,
      createdAt: now,
      lastActivity: now
    };

    // Add device info if enabled
    if (this.options.enableDeviceTracking) {
      sessionData.deviceInfo = this.getDeviceInfo();
      sessionData.userAgent = this.getUserAgent();
    }

    // Store session
    this.activeSessions.set(sessionId, sessionData);
    
    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    this.emitSessionEvent('session_created', { session: sessionData });
    return sessionData;
  }

  updateSessionActivity(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    session.lastActivity = Date.now();
    this.activeSessions.set(sessionId, session);
    
    this.emitSessionEvent('session_activity', { session });
    return true;
  }

  destroySession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Remove from user sessions
    const userSessionSet = this.userSessions.get(session.userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
      if (userSessionSet.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.emitSessionEvent('session_destroyed', { session });
    return true;
  }

  destroyAllUserSessions(userId: string): number {
    const userSessionSet = this.userSessions.get(userId);
    if (!userSessionSet) return 0;

    const sessionIds = Array.from(userSessionSet);
    let destroyedCount = 0;

    for (const sessionId of sessionIds) {
      if (this.destroySession(sessionId)) {
        destroyedCount++;
      }
    }

    this.emitSessionEvent('all_user_sessions_destroyed', { userId, count: destroyedCount });
    return destroyedCount;
  }

  // Session validation and cleanup
  validateSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    const sessionAge = now - session.lastActivity;

    if (sessionAge >= this.options.sessionTimeout) {
      this.destroySession(sessionId);
      return false;
    }

    return true;
  }

  cleanupExpiredSessions(): number {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.activeSessions) {
      const sessionAge = now - session.lastActivity;
      if (sessionAge >= this.options.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    let cleanedCount = 0;
    for (const sessionId of expiredSessions) {
      if (this.destroySession(sessionId)) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emitSessionEvent('sessions_cleaned', { count: cleanedCount });
    }

    return cleanedCount;
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.options.autoCleanupInterval);
  }

  private enforceSessionLimit(userId: string): void {
    const userSessionSet = this.userSessions.get(userId);
    if (!userSessionSet || userSessionSet.size < this.options.maxSessions) {
      return;
    }

    // Find oldest session to remove
    let oldestSession: SessionData | null = null;
    let oldestSessionId: string | null = null;

    for (const sessionId of userSessionSet) {
      const session = this.activeSessions.get(sessionId);
      if (session && (!oldestSession || session.lastActivity < oldestSession.lastActivity)) {
        oldestSession = session;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      this.destroySession(oldestSessionId);
      this.emitSessionEvent('session_limit_enforced', { 
        userId, 
        removedSessionId: oldestSessionId 
      });
    }
  }

  // Query methods
  getSession(sessionId: string): SessionData | null {
    return this.activeSessions.get(sessionId) || null;
  }

  getUserSessions(userId: string): SessionData[] {
    const userSessionSet = this.userSessions.get(userId);
    if (!userSessionSet) return [];

    const sessions: SessionData[] = [];
    for (const sessionId of userSessionSet) {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  getAllActiveSessions(): SessionData[] {
    return Array.from(this.activeSessions.values())
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }

  getSessionCount(): number {
    return this.activeSessions.size;
  }

  getUserSessionCount(userId: string): number {
    const userSessionSet = this.userSessions.get(userId);
    return userSessionSet ? userSessionSet.size : 0;
  }

  isSessionActive(sessionId: string): boolean {
    return this.validateSession(sessionId);
  }

  getSessionTimeRemaining(sessionId: string): number {
    const session = this.activeSessions.get(sessionId);
    if (!session) return 0;

    const elapsed = Date.now() - session.lastActivity;
    return Math.max(0, this.options.sessionTimeout - elapsed);
  }

  // Statistics
  getSessionStatistics(): {
    totalActiveSessions: number;
    totalUsers: number;
    averageSessionsPerUser: number;
    oldestSessionAge: number;
    newestSessionAge: number;
    guestSessions: number;
    registeredSessions: number;
  } {
    const sessions = this.getAllActiveSessions();
    const now = Date.now();

    let oldestAge = 0;
    let newestAge = 0;
    let guestCount = 0;
    let registeredCount = 0;

    if (sessions.length > 0) {
      oldestAge = now - Math.min(...sessions.map(s => s.createdAt));
      newestAge = now - Math.max(...sessions.map(s => s.createdAt));
      
      for (const session of sessions) {
        if (session.isGuest) {
          guestCount++;
        } else {
          registeredCount++;
        }
      }
    }

    return {
      totalActiveSessions: sessions.length,
      totalUsers: this.userSessions.size,
      averageSessionsPerUser: this.userSessions.size > 0 ? sessions.length / this.userSessions.size : 0,
      oldestSessionAge: oldestAge,
      newestSessionAge: newestAge,
      guestSessions: guestCount,
      registeredSessions: registeredCount
    };
  }

  // Device and environment detection
  private getDeviceInfo(): SessionData['deviceInfo'] {
    if (typeof window === 'undefined') {
      return {
        type: 'desktop',
        os: 'unknown',
        browser: 'unknown'
      };
    }

    const userAgent = navigator.userAgent.toLowerCase();
    
    // Detect device type
    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/tablet|ipad/.test(userAgent)) {
      deviceType = 'tablet';
    } else if (/mobile|android|iphone/.test(userAgent)) {
      deviceType = 'mobile';
    }

    // Detect OS
    let os = 'unknown';
    if (userAgent.includes('windows')) os = 'Windows';
    else if (userAgent.includes('mac')) os = 'macOS';
    else if (userAgent.includes('linux')) os = 'Linux';
    else if (userAgent.includes('android')) os = 'Android';
    else if (userAgent.includes('ios') || userAgent.includes('iphone') || userAgent.includes('ipad')) os = 'iOS';

    // Detect browser
    let browser = 'unknown';
    if (userAgent.includes('chrome')) browser = 'Chrome';
    else if (userAgent.includes('firefox')) browser = 'Firefox';
    else if (userAgent.includes('safari')) browser = 'Safari';
    else if (userAgent.includes('edge')) browser = 'Edge';
    else if (userAgent.includes('opera')) browser = 'Opera';

    return { type: deviceType, os, browser };
  }

  private getUserAgent(): string {
    return typeof window !== 'undefined' ? navigator.userAgent : 'unknown';
  }

  // Utility methods
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.sessionCallbacks.has(event)) {
      this.sessionCallbacks.set(event, []);
    }
    this.sessionCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.sessionCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitSessionEvent(event: string, data: any): void {
    const callbacks = this.sessionCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Session event callback error:', error);
      }
    });
  }

  // Configuration
  updateOptions(newOptions: Partial<SessionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): SessionOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Destroy all sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      this.destroySession(sessionId);
    }

    this.sessionCallbacks.clear();
  }
}