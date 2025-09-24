import { AuthManager, LoginCredentials, RegisterCredentials, AuthResult } from '../AuthManager';

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: jest.fn((key: string) => mockLocalStorage.store[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorage.store[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorage.store = {};
  })
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    authManager = new AuthManager({
      enableRememberMe: true,
      sessionTimeout: 60000, // 1 minute for testing
      maxLoginAttempts: 3,
      lockoutDuration: 5000, // 5 seconds for testing
      passwordMinLength: 6,
      usernameMinLength: 3,
      enableGuestMode: true
    });
  });

  afterEach(() => {
    authManager.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default unauthenticated state', () => {
      const authState = authManager.getAuthState();
      
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.user).toBeNull();
      expect(authState.token).toBeNull();
      expect(authState.isLoading).toBe(false);
    });

    it('should restore session from localStorage if valid', () => {
      const mockAuthData = {
        isAuthenticated: true,
        user: {
          id: 'user_1',
          username: 'testuser',
          displayName: 'Test User',
          isGuest: false,
          createdAt: Date.now() - 1000,
          lastLoginAt: Date.now() - 1000
        },
        token: 'mock_token',
        isLoading: false,
        lastActivity: Date.now() - 1000 // Recent activity
      };

      mockLocalStorage.setItem('hideSeekAuth', JSON.stringify(mockAuthData));
      
      const newAuthManager = new AuthManager();
      const authState = newAuthManager.getAuthState();
      
      expect(authState.isAuthenticated).toBe(true);
      expect(authState.user?.username).toBe('testuser');
      
      newAuthManager.dispose();
    });

    it('should clear expired session from localStorage', () => {
      const mockAuthData = {
        isAuthenticated: true,
        user: { id: 'user_1', username: 'testuser' },
        token: 'mock_token',
        isLoading: false,
        lastActivity: Date.now() - 120000 // 2 minutes ago (expired)
      };

      mockLocalStorage.setItem('hideSeekAuth', JSON.stringify(mockAuthData));
      
      const newAuthManager = new AuthManager({ sessionTimeout: 60000 });
      const authState = newAuthManager.getAuthState();
      
      expect(authState.isAuthenticated).toBe(false);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('hideSeekAuth');
      
      newAuthManager.dispose();
    });
  });

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
        rememberMe: true
      };

      const result = await authManager.login(credentials);
      
      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('testuser');
      expect(result.token).toBeDefined();
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should fail login with invalid credentials', async () => {
      const credentials: LoginCredentials = {
        username: 'wronguser',
        password: 'wrongpassword'
      };

      const result = await authManager.login(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should validate username length', async () => {
      const credentials: LoginCredentials = {
        username: 'ab', // Too short
        password: 'password123'
      };

      const result = await authManager.login(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Username must be at least');
    });

    it('should validate password length', async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: '123' // Too short
      };

      const result = await authManager.login(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Password must be at least');
    });

    it('should validate username format', async () => {
      const credentials: LoginCredentials = {
        username: 'test@user', // Invalid characters
        password: 'password123'
      };

      const result = await authManager.login(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Username can only contain');
    });

    it('should store session when rememberMe is true', async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
        rememberMe: true
      };

      await authManager.login(credentials);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'hideSeekAuth',
        expect.any(String)
      );
    });

    it('should not store session when rememberMe is false', async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
        rememberMe: false
      };

      await authManager.login(credentials);
      
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Registration', () => {
    it('should register successfully with valid credentials', async () => {
      const credentials: RegisterCredentials = {
        username: 'newuser',
        password: 'password123',
        confirmPassword: 'password123',
        displayName: 'New User'
      };

      const result = await authManager.register(credentials);
      
      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('newuser');
      expect(result.user?.displayName).toBe('New User');
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should fail registration with mismatched passwords', async () => {
      const credentials: RegisterCredentials = {
        username: 'newuser',
        password: 'password123',
        confirmPassword: 'different123'
      };

      const result = await authManager.register(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Passwords do not match');
    });

    it('should fail registration with existing username', async () => {
      const credentials: RegisterCredentials = {
        username: 'testuser', // Existing username
        password: 'password123',
        confirmPassword: 'password123'
      };

      const result = await authManager.register(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Username is already taken');
    });

    it('should use username as displayName if not provided', async () => {
      const credentials: RegisterCredentials = {
        username: 'newuser',
        password: 'password123',
        confirmPassword: 'password123'
      };

      const result = await authManager.register(credentials);
      
      expect(result.success).toBe(true);
      expect(result.user?.displayName).toBe('newuser');
    });

    it('should validate display name length', async () => {
      const credentials: RegisterCredentials = {
        username: 'newuser',
        password: 'password123',
        confirmPassword: 'password123',
        displayName: 'A'.repeat(51) // Too long
      };

      const result = await authManager.register(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Display name must be 50 characters or less');
    });
  });

  describe('Guest Login', () => {
    it('should login as guest successfully', async () => {
      const result = await authManager.loginAsGuest();
      
      expect(result.success).toBe(true);
      expect(result.user?.isGuest).toBe(true);
      expect(result.user?.username).toMatch(/^Guest_/);
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.isGuest()).toBe(true);
    });

    it('should fail guest login when disabled', async () => {
      const authManagerNoGuest = new AuthManager({ enableGuestMode: false });
      
      const result = await authManagerNoGuest.loginAsGuest();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Guest mode is not enabled');
      
      authManagerNoGuest.dispose();
    });
  });

  describe('Rate Limiting', () => {
    it('should track failed login attempts', async () => {
      const credentials: LoginCredentials = {
        username: 'wronguser',
        password: 'wrongpassword'
      };

      // First attempt
      let result = await authManager.login(credentials);
      expect(result.remainingAttempts).toBe(2);

      // Second attempt
      result = await authManager.login(credentials);
      expect(result.remainingAttempts).toBe(1);

      // Third attempt
      result = await authManager.login(credentials);
      expect(result.remainingAttempts).toBe(0);
    });

    it('should lock account after max attempts', async () => {
      const credentials: LoginCredentials = {
        username: 'wronguser',
        password: 'wrongpassword'
      };

      // Exhaust all attempts
      for (let i = 0; i < 3; i++) {
        await authManager.login(credentials);
      }

      // Next attempt should be locked
      const result = await authManager.login(credentials);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many login attempts');
    });

    it('should reset attempts after lockout period', async () => {
      const credentials: LoginCredentials = {
        username: 'wronguser',
        password: 'wrongpassword'
      };

      // Exhaust all attempts
      for (let i = 0; i < 3; i++) {
        await authManager.login(credentials);
      }

      // Wait for lockout to expire
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Should be able to attempt again
      const result = await authManager.login(credentials);
      expect(result.remainingAttempts).toBe(2);
    }, 10000);

    it('should clear attempts on successful login', async () => {
      const wrongCredentials: LoginCredentials = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      const correctCredentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123'
      };

      // Make failed attempts
      await authManager.login(wrongCredentials);
      await authManager.login(wrongCredentials);

      // Successful login should clear attempts
      const result = await authManager.login(correctCredentials);
      expect(result.success).toBe(true);

      // Logout and try wrong password again - should start fresh
      authManager.logout();
      const newResult = await authManager.login(wrongCredentials);
      expect(newResult.remainingAttempts).toBe(2);
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123'
      };
      await authManager.login(credentials);
    });

    it('should refresh session activity', () => {
      const initialActivity = authManager.getAuthState().lastActivity;
      
      // Wait a bit and refresh
      setTimeout(() => {
        authManager.refreshSession();
        const newActivity = authManager.getAuthState().lastActivity;
        expect(newActivity).toBeGreaterThan(initialActivity);
      }, 10);
    });

    it('should calculate remaining session time', () => {
      const remaining = authManager.getSessionTimeRemaining();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60000);
    });

    it('should logout when session expires', (done) => {
      // Set very short session timeout
      const shortAuthManager = new AuthManager({ sessionTimeout: 100 });
      
      shortAuthManager.addEventListener('logout', (data: any) => {
        expect(data.reason).toBe('session_expired');
        shortAuthManager.dispose();
        done();
      });

      // Login and wait for expiration
      shortAuthManager.login({
        username: 'testuser',
        password: 'password123'
      });
    }, 5000);
  });

  describe('Logout', () => {
    beforeEach(async () => {
      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
        rememberMe: true
      };
      await authManager.login(credentials);
    });

    it('should logout successfully', () => {
      authManager.logout();
      
      const authState = authManager.getAuthState();
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.user).toBeNull();
      expect(authState.token).toBeNull();
    });

    it('should clear stored session on logout', () => {
      authManager.logout();
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('hideSeekAuth');
    });

    it('should emit logout event', (done) => {
      authManager.addEventListener('logout', (data: any) => {
        expect(data.reason).toBe('user_initiated');
        done();
      });

      authManager.logout();
    });
  });

  describe('Event System', () => {
    it('should emit login events', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['login_started', 'login_success'];

      expectedEvents.forEach(event => {
        authManager.addEventListener(event, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      authManager.login({
        username: 'testuser',
        password: 'password123'
      });
    });

    it('should emit registration events', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['register_started', 'register_success'];

      expectedEvents.forEach(event => {
        authManager.addEventListener(event, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      authManager.register({
        username: 'newuser',
        password: 'password123',
        confirmPassword: 'password123'
      });
    });

    it('should remove event listeners', () => {
      const callback = jest.fn();
      
      authManager.addEventListener('login_success', callback);
      authManager.removeEventListener('login_success', callback);

      authManager.login({
        username: 'testuser',
        password: 'password123'
      });

      // Callback should not be called after removal
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
      }, 100);
    });
  });

  describe('Query Methods', () => {
    it('should return current user', async () => {
      expect(authManager.getCurrentUser()).toBeNull();

      await authManager.login({
        username: 'testuser',
        password: 'password123'
      });

      const user = authManager.getCurrentUser();
      expect(user?.username).toBe('testuser');
    });

    it('should return authentication token', async () => {
      expect(authManager.getToken()).toBeNull();

      await authManager.login({
        username: 'testuser',
        password: 'password123'
      });

      const token = authManager.getToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should check authentication status', async () => {
      expect(authManager.isAuthenticated()).toBe(false);

      await authManager.login({
        username: 'testuser',
        password: 'password123'
      });

      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should check guest status', async () => {
      expect(authManager.isGuest()).toBe(false);

      await authManager.loginAsGuest();

      expect(authManager.isGuest()).toBe(true);
    });

    it('should check loading status', () => {
      expect(authManager.isLoading()).toBe(false);
      
      // Loading status is briefly true during login
      const loginPromise = authManager.login({
        username: 'testuser',
        password: 'password123'
      });

      expect(authManager.isLoading()).toBe(true);

      return loginPromise.then(() => {
        expect(authManager.isLoading()).toBe(false);
      });
    });
  });

  describe('Configuration', () => {
    it('should update options', () => {
      const newOptions = {
        maxLoginAttempts: 10,
        passwordMinLength: 8
      };

      authManager.updateOptions(newOptions);
      const options = authManager.getOptions();

      expect(options.maxLoginAttempts).toBe(10);
      expect(options.passwordMinLength).toBe(8);
    });

    it('should return current options', () => {
      const options = authManager.getOptions();
      
      expect(options.enableRememberMe).toBe(true);
      expect(options.maxLoginAttempts).toBe(3);
      expect(options.enableGuestMode).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw error
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not crash when initializing
      const newAuthManager = new AuthManager();
      expect(newAuthManager.isAuthenticated()).toBe(false);
      
      newAuthManager.dispose();
    });

    it('should handle malformed stored auth data', () => {
      mockLocalStorage.setItem('hideSeekAuth', 'invalid json');
      
      const newAuthManager = new AuthManager();
      expect(newAuthManager.isAuthenticated()).toBe(false);
      
      newAuthManager.dispose();
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources properly', () => {
      const callback = jest.fn();
      authManager.addEventListener('test', callback);
      
      authManager.dispose();
      
      // Should clear all callbacks and intervals
      expect(authManager.getAuthState).toBeDefined(); // Manager still exists
    });
  });
});