export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  username: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}

export interface AuthOptions {
  enableRememberMe?: boolean;
  sessionTimeout?: number; // in milliseconds
  maxLoginAttempts?: number;
  lockoutDuration?: number; // in milliseconds
  passwordMinLength?: number;
  usernameMinLength?: number;
  enableGuestMode?: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    displayName: string;
    isGuest: boolean;
    createdAt: number;
    lastLoginAt: number;
  };
  token?: string;
  error?: string;
  remainingAttempts?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthResult['user'] | null;
  token: string | null;
  isLoading: boolean;
  lastActivity: number;
}

export class AuthManager {
  private options: Required<AuthOptions>;
  private authState: AuthState;
  private loginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private authCallbacks: Map<string, Function[]> = new Map();
  private sessionCheckInterval: NodeJS.Timeout | null = null;

  constructor(options: AuthOptions = {}) {
    this.options = {
      enableRememberMe: options.enableRememberMe !== false,
      sessionTimeout: options.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
      maxLoginAttempts: options.maxLoginAttempts || 5,
      lockoutDuration: options.lockoutDuration || 15 * 60 * 1000, // 15 minutes
      passwordMinLength: options.passwordMinLength || 6,
      usernameMinLength: options.usernameMinLength || 3,
      enableGuestMode: options.enableGuestMode !== false
    };

    this.authState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      lastActivity: Date.now()
    };

    this.initializeFromStorage();
    this.startSessionCheck();
  }

  // Initialization
  private initializeFromStorage(): void {
    try {
      const storedAuth = localStorage.getItem('hideSeekAuth');
      if (storedAuth) {
        const authData = JSON.parse(storedAuth);
        
        // Check if session is still valid
        const now = Date.now();
        const sessionAge = now - authData.lastActivity;
        
        if (sessionAge < this.options.sessionTimeout) {
          this.authState = {
            ...authData,
            isLoading: false,
            lastActivity: now
          };
          
          this.emitAuthEvent('session_restored', { user: this.authState.user });
        } else {
          // Session expired
          this.clearStoredAuth();
        }
      }
    } catch (error) {
      console.error('Failed to restore auth session:', error);
      this.clearStoredAuth();
    }
  }

  private startSessionCheck(): void {
    // Check session validity every 5 minutes
    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionValidity();
    }, 5 * 60 * 1000);
  }

  private checkSessionValidity(): void {
    if (!this.authState.isAuthenticated) return;

    const now = Date.now();
    const inactiveTime = now - this.authState.lastActivity;

    if (inactiveTime >= this.options.sessionTimeout) {
      this.logout('session_expired');
    }
  }

  // Authentication methods
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    this.authState.isLoading = true;
    this.emitAuthEvent('login_started', { username: credentials.username });

    try {
      // Check for rate limiting
      const rateLimitResult = this.checkRateLimit(credentials.username);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Too many login attempts. Try again in ${Math.ceil(rateLimitResult.waitTime / 60000)} minutes.`,
          remainingAttempts: 0
        };
      }

      // Validate credentials format
      const validationError = this.validateLoginCredentials(credentials);
      if (validationError) {
        this.recordFailedAttempt(credentials.username);
        return {
          success: false,
          error: validationError,
          remainingAttempts: rateLimitResult.remainingAttempts - 1
        };
      }

      // Simulate API call (replace with actual authentication)
      const authResult = await this.authenticateUser(credentials);

      if (authResult.success && authResult.user) {
        // Clear failed attempts on successful login
        this.loginAttempts.delete(credentials.username);
        
        // Update auth state
        this.authState = {
          isAuthenticated: true,
          user: authResult.user,
          token: authResult.token || this.generateToken(),
          isLoading: false,
          lastActivity: Date.now()
        };

        // Store session if remember me is enabled
        if (credentials.rememberMe && this.options.enableRememberMe) {
          this.storeAuthSession();
        }

        this.emitAuthEvent('login_success', { user: authResult.user });
        return authResult;
      } else {
        this.recordFailedAttempt(credentials.username);
        this.emitAuthEvent('login_failed', { 
          username: credentials.username, 
          error: authResult.error 
        });
        
        return {
          success: false,
          error: authResult.error || 'Login failed',
          remainingAttempts: rateLimitResult.remainingAttempts - 1
        };
      }
    } catch (error) {
      this.recordFailedAttempt(credentials.username);
      this.emitAuthEvent('login_error', { error });
      
      return {
        success: false,
        error: 'An unexpected error occurred during login',
        remainingAttempts: this.getRemainingAttempts(credentials.username) - 1
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  async register(credentials: RegisterCredentials): Promise<AuthResult> {
    this.authState.isLoading = true;
    this.emitAuthEvent('register_started', { username: credentials.username });

    try {
      // Validate registration credentials
      const validationError = this.validateRegisterCredentials(credentials);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Simulate API call (replace with actual registration)
      const registerResult = await this.registerUser(credentials);

      if (registerResult.success && registerResult.user) {
        // Auto-login after successful registration
        this.authState = {
          isAuthenticated: true,
          user: registerResult.user,
          token: registerResult.token || this.generateToken(),
          isLoading: false,
          lastActivity: Date.now()
        };

        this.emitAuthEvent('register_success', { user: registerResult.user });
        return registerResult;
      } else {
        this.emitAuthEvent('register_failed', { 
          username: credentials.username, 
          error: registerResult.error 
        });
        return registerResult;
      }
    } catch (error) {
      this.emitAuthEvent('register_error', { error });
      
      return {
        success: false,
        error: 'An unexpected error occurred during registration'
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  async loginAsGuest(): Promise<AuthResult> {
    if (!this.options.enableGuestMode) {
      return {
        success: false,
        error: 'Guest mode is not enabled'
      };
    }

    this.authState.isLoading = true;
    this.emitAuthEvent('guest_login_started', {});

    try {
      const guestId = this.generateGuestId();
      const guestUser = {
        id: guestId,
        username: `Guest_${guestId.slice(-6)}`,
        displayName: `Guest Player`,
        isGuest: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now()
      };

      this.authState = {
        isAuthenticated: true,
        user: guestUser,
        token: this.generateToken(),
        isLoading: false,
        lastActivity: Date.now()
      };

      this.emitAuthEvent('guest_login_success', { user: guestUser });
      
      return {
        success: true,
        user: guestUser,
        token: this.authState.token
      };
    } catch (error) {
      this.emitAuthEvent('guest_login_error', { error });
      
      return {
        success: false,
        error: 'Failed to create guest session'
      };
    } finally {
      this.authState.isLoading = false;
    }
  }

  logout(reason: string = 'user_initiated'): void {
    const wasAuthenticated = this.authState.isAuthenticated;
    const user = this.authState.user;

    this.authState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      lastActivity: Date.now()
    };

    this.clearStoredAuth();

    if (wasAuthenticated) {
      this.emitAuthEvent('logout', { user, reason });
    }
  }

  // Session management
  refreshSession(): void {
    if (this.authState.isAuthenticated) {
      this.authState.lastActivity = Date.now();
      
      if (this.isSessionStored()) {
        this.storeAuthSession();
      }
      
      this.emitAuthEvent('session_refreshed', { user: this.authState.user });
    }
  }

  private storeAuthSession(): void {
    try {
      localStorage.setItem('hideSeekAuth', JSON.stringify(this.authState));
    } catch (error) {
      console.error('Failed to store auth session:', error);
    }
  }

  private clearStoredAuth(): void {
    try {
      localStorage.removeItem('hideSeekAuth');
    } catch (error) {
      console.error('Failed to clear stored auth:', error);
    }
  }

  private isSessionStored(): boolean {
    try {
      return localStorage.getItem('hideSeekAuth') !== null;
    } catch {
      return false;
    }
  }

  // Rate limiting
  private checkRateLimit(username: string): { allowed: boolean; remainingAttempts: number; waitTime: number } {
    const attempts = this.loginAttempts.get(username);
    const now = Date.now();

    if (!attempts) {
      return { allowed: true, remainingAttempts: this.options.maxLoginAttempts, waitTime: 0 };
    }

    // Check if lockout period has expired
    const timeSinceLastAttempt = now - attempts.lastAttempt;
    if (timeSinceLastAttempt >= this.options.lockoutDuration) {
      this.loginAttempts.delete(username);
      return { allowed: true, remainingAttempts: this.options.maxLoginAttempts, waitTime: 0 };
    }

    // Check if max attempts exceeded
    if (attempts.count >= this.options.maxLoginAttempts) {
      const waitTime = this.options.lockoutDuration - timeSinceLastAttempt;
      return { allowed: false, remainingAttempts: 0, waitTime };
    }

    return { 
      allowed: true, 
      remainingAttempts: this.options.maxLoginAttempts - attempts.count,
      waitTime: 0
    };
  }

  private recordFailedAttempt(username: string): void {
    const now = Date.now();
    const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    
    this.loginAttempts.set(username, {
      count: attempts.count + 1,
      lastAttempt: now
    });
  }

  private getRemainingAttempts(username: string): number {
    const attempts = this.loginAttempts.get(username);
    if (!attempts) return this.options.maxLoginAttempts;
    
    return Math.max(0, this.options.maxLoginAttempts - attempts.count);
  }

  // Validation
  private validateLoginCredentials(credentials: LoginCredentials): string | null {
    if (!credentials.username || credentials.username.trim().length < this.options.usernameMinLength) {
      return `Username must be at least ${this.options.usernameMinLength} characters long`;
    }

    if (!credentials.password || credentials.password.length < this.options.passwordMinLength) {
      return `Password must be at least ${this.options.passwordMinLength} characters long`;
    }

    // Basic username validation (alphanumeric + underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(credentials.username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }

    return null;
  }

  private validateRegisterCredentials(credentials: RegisterCredentials): string | null {
    const loginValidation = this.validateLoginCredentials(credentials);
    if (loginValidation) return loginValidation;

    if (credentials.password !== credentials.confirmPassword) {
      return 'Passwords do not match';
    }

    if (credentials.displayName && credentials.displayName.trim().length > 50) {
      return 'Display name must be 50 characters or less';
    }

    return null;
  }

  // Mock authentication (replace with actual API calls)
  private async authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock user database
    const mockUsers = [
      { 
        username: 'testuser', 
        password: 'password123',
        id: 'user_1',
        displayName: 'Test User',
        createdAt: Date.now() - 86400000 // 1 day ago
      }
    ];

    const user = mockUsers.find(u => 
      u.username === credentials.username && u.password === credentials.password
    );

    if (user) {
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          isGuest: false,
          createdAt: user.createdAt,
          lastLoginAt: Date.now()
        },
        token: this.generateToken()
      };
    }

    return {
      success: false,
      error: 'Invalid username or password'
    };
  }

  private async registerUser(credentials: RegisterCredentials): Promise<AuthResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock username availability check
    const existingUsernames = ['testuser', 'admin', 'guest'];
    
    if (existingUsernames.includes(credentials.username.toLowerCase())) {
      return {
        success: false,
        error: 'Username is already taken'
      };
    }

    // Create new user
    const newUser = {
      id: this.generateUserId(),
      username: credentials.username,
      displayName: credentials.displayName || credentials.username,
      isGuest: false,
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };

    return {
      success: true,
      user: newUser,
      token: this.generateToken()
    };
  }

  // Utility methods
  private generateToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateGuestId(): string {
    return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.authCallbacks.has(event)) {
      this.authCallbacks.set(event, []);
    }
    this.authCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.authCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitAuthEvent(event: string, data: any): void {
    const callbacks = this.authCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Auth event callback error:', error);
      }
    });
  }

  // Query methods
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  getCurrentUser(): AuthResult['user'] | null {
    return this.authState.user;
  }

  getToken(): string | null {
    return this.authState.token;
  }

  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  isGuest(): boolean {
    return this.authState.user?.isGuest || false;
  }

  isLoading(): boolean {
    return this.authState.isLoading;
  }

  getSessionTimeRemaining(): number {
    if (!this.authState.isAuthenticated) return 0;
    
    const elapsed = Date.now() - this.authState.lastActivity;
    return Math.max(0, this.options.sessionTimeout - elapsed);
  }

  // Configuration
  updateOptions(newOptions: Partial<AuthOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): AuthOptions {
    return { ...this.options };
  }

  // Cleanup
  dispose(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    
    this.authCallbacks.clear();
    this.loginAttempts.clear();
  }
}