import { ReferenceSpaceType, SessionMode, type WorldOptions } from '@iwsdk/core';

export const APP_TITLE = 'ChronoGrip';

/** Seated passthrough session: hands preferred but optional, local space, tray placed via planes (all features optional). */
export function createWorldOptions(): WorldOptions {
  return {
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      referenceSpace: ReferenceSpaceType.Local,
      offer: 'once',
      features: {
        handTracking: true,
        planeDetection: true,
        hitTest: true,
        anchors: true,
      },
    },
    features: {
      locomotion: false,
      grabbing: false,
      spatialUI: false,
    },
  };
}
