import { describe, expect, it } from 'vitest';
// Read as text, like deploy.test.ts: no Node types, no Docker parser.
import dockerfile from '../../Dockerfile?raw';
import dockerignore from '../../.dockerignore?raw';
import readme from '../../README.md?raw';
import viteConfig from '../../vite.config.ts?raw';
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

  it('serves the production preview on 0.0.0.0:4173 by default and does not run e2e', () => {
    const cmd = /^(?:CMD|ENTRYPOINT)\b.*$/m.exec(dockerfile)?.[0] ?? '';
    const script = /"run",\s*"([^"]+)"/.exec(cmd)?.[1] ?? /bun run ([^\s"]+)/.exec(cmd)?.[1];
    const run = script ? manifest.scripts[script] ?? '' : cmd;
    expect(run).toMatch(/vite preview/);
    expect(run).toMatch(/--host 0\.0\.0\.0/);
    expect(run).toMatch(/--port 4173/);
    expect(cmd + run).not.toMatch(/e2e|playwright/);
  });

  it('exposes 4173 and builds the app after copying the source', () => {
    expect(dockerfile).toMatch(/^EXPOSE 4173$/m);
    const copy = dockerfile.indexOf('COPY --chown=pwuser:pwuser . .');
    const build = dockerfile.indexOf('RUN bun run build');
    expect(copy).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(copy);
  });

  it('checks typecheck, unit tests and e2e, in that order', () => {
    const check = manifest.scripts.check ?? '';
    const at = ['typecheck', 'test', 'e2e'].map((s) => check.indexOf(`bun run ${s}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('lets plain vite preview be reached from outside a container', () => {
    expect(viteConfig).toMatch(/preview:\s*\{[^}]*host:\s*true/);
    expect(viteConfig).toMatch(/preview:\s*\{[^}]*port:\s*4173/);
  });

  it('keeps node_modules and dist out of the build context', () => {
    const lines = dockerignore.split('\n').map((l) => l.trim());
    expect(lines).toContain('node_modules');
    expect(lines).toContain('dist');
  });

  it('is built and run through package scripts the README names', () => {
    expect(manifest.scripts['docker:build']).toMatch(/docker build -t chronogrip-mr \./);
    expect(manifest.scripts['docker:test']).toMatch(/docker run --rm --ipc=host chronogrip-mr bun run check$/);
    expect(manifest.scripts['docker:serve']).toMatch(/docker run --rm -d -p 4173:4173 --name chronogrip-mr chronogrip-mr$/);
    expect(manifest.scripts['docker:stop']).toBe('docker stop chronogrip-mr');
    expect(readme).toMatch(/-p 4173:4173/);
    expect(readme).toMatch(/bun run docker:test/);
  });
});
