// AR Manager
export {
  ARManager,
  type AROptions,
  type ARCapabilities,
  type ARFeature,
  type ARMode,
  type ARSession,
  type ARTrackingState,
  type AREnvironmentData,
  type ARPlane,
  type ARTrackedImage,
  type ARAnchor,
  type ARFallbackOptions
} from './ARManager';

// AR Player Tracker
export {
  ARPlayerTracker,
  type ARPlayerTrackingOptions,
  type PlayerPosition,
  type GeolocationReference
} from './ARPlayerTracker';

// AR Overlay System
export {
  AROverlaySystem,
  type AROverlayOptions,
  type PlayerAvatar,
  type ARUIElement,
  type OverlayRenderState
} from './AROverlaySystem';

// Re-export commonly used types
export type {
  ARCapabilities as Capabilities,
  ARSession as Session,
  ARTrackingState as TrackingState,
  PlayerPosition as Position,
  PlayerAvatar as Avatar
} from './ARManager';