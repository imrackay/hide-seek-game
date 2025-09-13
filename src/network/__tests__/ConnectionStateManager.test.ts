/**
 * @jest-environment jsdom
 */

import { ConnectionStateManager } from '../ConnectionStateManager';
import { ConnectionState } from '../SocketManager';

describe('ConnectionStateManager', () => {
  let stateManager: ConnectionStateManager;

  beforeEach(() => {
    stateManager = new ConnectionStateManager();
  });

  describe('state management', () => {
    it('should initialize with disconnected state', () => {
      expect(stateManager.getCurrentState()).toBe(ConnectionState.DISCONNECTED);
      expect(stateManager.isConnected()).toBe(false);
    });

    it('should update state correctly', () => {
      stateManager.setState(ConnectionState.CONNECTING);
      expect(stateManager.getCurrentState()).toBe(ConnectionState.CONNECTING);
      expect(stateManager.getPreviousState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should not update state if same as current', () => {
      const handler = jest.fn();
      stateManager.on('stateChanged', handler);
      
      stateManager.setState(ConnectionState.DISCONNECTED);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should track state history', () => {
      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);
      stateManager.setState(ConnectionState.DISCONNECTED);

      const history = stateManager.getConnectionHistory();
      expect(history).toHaveLength(4); // Initial + 3 changes
      expect(history[history.length - 1].state).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('state queries', () => {
    it('should correctly identify connected state', () => {
      stateManager.setState(ConnectionState.CONNECTED);
      expect(stateManager.isConnected()).toBe(true);
      expect(stateManager.isConnecting()).toBe(false);
      expect(stateManager.isReconnecting()).toBe(false);
      expect(stateManager.hasError()).toBe(false);
    });

    it('should correctly identify connecting state', () => {
      stateManager.setState(ConnectionState.CONNECTING);
      expect(stateManager.isConnected()).toBe(false);
      expect(stateManager.isConnecting()).toBe(true);
      expect(stateManager.isReconnecting()).toBe(false);
      expect(stateManager.hasError()).toBe(false);
    });

    it('should correctly identify reconnecting state', () => {
      stateManager.setState(ConnectionState.RECONNECTING);
      expect(stateManager.isConnected()).toBe(false);
      expect(stateManager.isConnecting()).toBe(false);
      expect(stateManager.isReconnecting()).toBe(true);
      expect(stateManager.hasError()).toBe(false);
    });

    it('should correctly identify error state', () => {
      stateManager.setState(ConnectionState.ERROR);
      expect(stateManager.isConnected()).toBe(false);
      expect(stateManager.isConnecting()).toBe(false);
      expect(stateManager.isReconnecting()).toBe(false);
      expect(stateManager.hasError()).toBe(true);
    });
  });

  describe('event handling', () => {
    it('should emit stateChanged event', () => {
      const handler = jest.fn();
      stateManager.on('stateChanged', handler);

      stateManager.setState(ConnectionState.CONNECTING);
      expect(handler).toHaveBeenCalledWith(ConnectionState.CONNECTING, ConnectionState.DISCONNECTED);
    });

    it('should emit connected event', () => {
      const handler = jest.fn();
      stateManager.on('connected', handler);

      stateManager.setState(ConnectionState.CONNECTED);
      expect(handler).toHaveBeenCalled();
    });

    it('should emit disconnected event with reason', () => {
      const handler = jest.fn();
      stateManager.on('disconnected', handler);

      // First set to connected, then disconnect to trigger the event
      stateManager.setState(ConnectionState.CONNECTED);
      stateManager.setState(ConnectionState.DISCONNECTED, 'transport close');
      expect(handler).toHaveBeenCalledWith('transport close');
    });

    it('should emit reconnecting event with attempt number', () => {
      const handler = jest.fn();
      stateManager.on('reconnecting', handler);

      stateManager.setState(ConnectionState.RECONNECTING);
      expect(handler).toHaveBeenCalledWith(1);
    });

    it('should emit error event', () => {
      const handler = jest.fn();
      stateManager.on('error', handler);

      stateManager.setState(ConnectionState.ERROR, 'Connection failed');
      expect(handler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should remove event handlers', () => {
      const handler = jest.fn();
      stateManager.on('connected', handler);
      stateManager.off('connected', handler);

      stateManager.setState(ConnectionState.CONNECTED);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      stateManager.on('connected', handler1);
      stateManager.on('connected', handler2);

      stateManager.setState(ConnectionState.CONNECTED);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('connection duration', () => {
    it('should return 0 duration when not connected', () => {
      expect(stateManager.getConnectionDuration()).toBe(0);
    });

    it('should calculate connection duration when connected', () => {
      stateManager.setState(ConnectionState.CONNECTED);
      
      // Wait a bit and check duration
      setTimeout(() => {
        const duration = stateManager.getConnectionDuration();
        expect(duration).toBeGreaterThan(0);
      }, 10);
    });
  });

  describe('disconnection reason', () => {
    it('should track last disconnection reason', () => {
      stateManager.setState(ConnectionState.CONNECTED);
      stateManager.setState(ConnectionState.DISCONNECTED, 'server shutdown');

      expect(stateManager.getLastDisconnectionReason()).toBe('server shutdown');
    });

    it('should return undefined if never disconnected', () => {
      expect(stateManager.getLastDisconnectionReason()).toBeUndefined();
    });
  });

  describe('utility methods', () => {
    it('should reset state and history', () => {
      stateManager.setState(ConnectionState.CONNECTED);
      stateManager.setState(ConnectionState.DISCONNECTED);
      
      stateManager.reset();
      
      expect(stateManager.getCurrentState()).toBe(ConnectionState.DISCONNECTED);
      expect(stateManager.getPreviousState()).toBe(ConnectionState.DISCONNECTED);
      expect(stateManager.getConnectionHistory()).toHaveLength(1);
    });

    it('should return display names for states', () => {
      expect(stateManager.getStateDisplayName(ConnectionState.CONNECTED)).toBe('Connected');
      expect(stateManager.getStateDisplayName(ConnectionState.CONNECTING)).toBe('Connecting...');
      expect(stateManager.getStateDisplayName(ConnectionState.DISCONNECTED)).toBe('Disconnected');
      expect(stateManager.getStateDisplayName(ConnectionState.RECONNECTING)).toBe('Reconnecting...');
      expect(stateManager.getStateDisplayName(ConnectionState.ERROR)).toBe('Connection Error');
    });

    it('should return current state display name when no parameter provided', () => {
      stateManager.setState(ConnectionState.CONNECTED);
      expect(stateManager.getStateDisplayName()).toBe('Connected');
    });
  });

  describe('history management', () => {
    it('should limit history size', () => {
      // Add more entries than max size
      for (let i = 0; i < 60; i++) {
        stateManager.setState(i % 2 === 0 ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED);
      }

      const history = stateManager.getConnectionHistory();
      expect(history.length).toBeLessThanOrEqual(50);
    });
  });
});