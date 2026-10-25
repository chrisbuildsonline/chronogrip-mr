import { ReferenceSpaceType, SessionMode, type WorldOptions } from '@iwsdk/core';

export const APP_TITLE = 'ChronoGrip';

/** Seated passthrough session: hands only, local space, tray anchored via planes/hit-test. */
export function createWorldOptions(): WorldOptions {
  return {
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      referenceSpace: ReferenceSpaceType.Local,
      offer: 'once',
      features: {
        handTracking: { required: true },
        planeDetection: true,
        hitTest: true,
      },
    },
    features: {
      locomotion: false,
      grabbing: false,
      spatialUI: false,
    },
  };
}
