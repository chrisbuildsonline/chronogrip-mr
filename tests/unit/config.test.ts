import { describe, expect, it } from 'vitest';
import { APP_TITLE, createWorldOptions } from '../../src/config';

describe('config', () => {
  it('names the game ChronoGrip', () => {
    expect(APP_TITLE).toBe('ChronoGrip');
  });

  it('asks for a seated passthrough session with hand tracking', () => {
    const opts = createWorldOptions();
    expect(opts.xr).not.toBe(false);
    if (opts.xr === false || opts.xr === undefined) throw new Error('xr missing');
    expect(opts.xr.sessionMode).toBe('immersive-ar');
    expect(opts.xr.referenceSpace).toBe('local');
    expect(opts.xr.features?.handTracking).toEqual({ required: true });
    expect(opts.xr.features?.planeDetection).toBe(true);
    expect(opts.xr.features?.hitTest).toBe(true);
  });
});
