import { describe, expect, it } from 'vitest';
import { APP_TITLE, createWorldOptions } from '../../src/config';

describe('config', () => {
  it('names the game ChronoGrip', () => {
    expect(APP_TITLE).toBe('ChronoGrip');
  });

  it('asks for a seated passthrough session with optional hand tracking, planes, hit-test and anchors', () => {
    const opts = createWorldOptions();
    expect(opts.xr).not.toBe(false);
    if (opts.xr === false || opts.xr === undefined) throw new Error('xr missing');
    expect(opts.xr.sessionMode).toBe('immersive-ar');
    expect(opts.xr.referenceSpace).toBe('local');
    // `true` means optional: a Quest with hands off must still start the session.
    expect(opts.xr.features?.handTracking).toBe(true);
    expect(opts.xr.features?.planeDetection).toBe(true);
    expect(opts.xr.features?.hitTest).toBe(true);
    expect(opts.xr.features?.anchors).toBe(true);
  });
});
