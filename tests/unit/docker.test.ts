import { describe, expect, it } from 'vitest';
// Read as text, like deploy.test.ts: no Node types, no Docker parser.
import dockerfile from '../../Dockerfile?raw';
import dockerignore from '../../.dockerignore?raw';
import readme from '../../README.md?raw';
import pkg from '../../package.json?raw';

const manifest = JSON.parse(pkg) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

describe('docker image', () => {
  it('uses the Playwright image that matches @playwright/test exactly', () => {
    const version = manifest.devDependencies['@playwright/test']!;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/); // pinned, no range
    expect(dockerfile).toMatch(new RegExp(`^FROM mcr\\.microsoft\\.com/playwright:v${version.replace(/\./g, '\\.')}-\\w+`, 'm'));
  });

  it('pins bun and installs from the lockfile', () => {
    expect(dockerfile).toMatch(/npm install -g bun@\d+\.\d+\.\d+/);
    expect(dockerfile).toMatch(/bun install --frozen-lockfile/);
  });

  it('runs typecheck, unit tests and e2e, in that order, by default', () => {
    const cmd = /^(?:CMD|ENTRYPOINT)\b.*$/m.exec(dockerfile)?.[0] ?? '';
    const at = ['typecheck', 'test', 'e2e'].map((s) => cmd.indexOf(`bun run ${s}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('keeps node_modules and dist out of the build context', () => {
    const lines = dockerignore.split('\n').map((l) => l.trim());
    expect(lines).toContain('node_modules');
    expect(lines).toContain('dist');
  });

  it('is built and run through package scripts the README names', () => {
    expect(manifest.scripts['docker:build']).toMatch(/docker build -t chronogrip-mr \./);
    expect(manifest.scripts['docker:test']).toMatch(/docker run --rm --ipc=host chronogrip-mr/);
    expect(readme).toMatch(/bun run docker:test/);
  });
});
