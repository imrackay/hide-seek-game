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

// Re-export commonly used types
export type {
  ARCapabilities as Capabilities,
  ARSession as Session,
  ARTrackingState as TrackingState
} from './ARManager';