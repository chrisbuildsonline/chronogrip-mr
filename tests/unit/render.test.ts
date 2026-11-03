import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, pixelRatioFor } from '../../src/render';
import playwrightConfig from '../../playwright.config.ts?raw';

const specs = import.meta.glob('../e2e/*.spec.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('software renderer', () => {
  it('spots SwiftShader, llvmpipe and generic software GL', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Mesa Software Rasterizer')).toBe(true);
  });

  it('leaves real GPUs and unknown renderers alone', () => {
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, OpenGL 4.5)')).toBe(false);
    expect(isSoftwareRenderer('Adreno (TM) 740')).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
  });

  it('renders software GL at a lower pixel ratio, never above the device ratio', () => {
    expect(pixelRatioFor(true, 2)).toBe(0.75);
    expect(pixelRatioFor(true, 1)).toBe(0.75);
    expect(pixelRatioFor(true, 0.5)).toBe(0.5);
    expect(pixelRatioFor(false, 2)).toBe(2);
  });
});

describe('playwright config for slow machines', () => {
  it('reads workers from E2E_WORKERS, caps them at 4 and derives them from the CPU count on CI', () => {
    expect(playwrightConfig).toMatch(/process\.env\.E2E_WORKERS/);
    expect(playwrightConfig).toMatch(/process\.env\.CI/);
    expect(playwrightConfig).toMatch(/Math\.min\(4,/);
    expect(playwrightConfig).toMatch(/navigator\.hardwareConcurrency/);
  });

  it('gives CI a longer per-test timeout than the 120 s host budget, and specs never override it', () => {
    expect(playwrightConfig).toMatch(/process\.env\.CI \? 240_000 : 120_000/);
    for (const [path, src] of Object.entries(specs)) expect(src, path).not.toMatch(/test\.setTimeout/);
  });
});
