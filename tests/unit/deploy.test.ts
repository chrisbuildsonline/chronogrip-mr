import { describe, expect, it } from 'vitest';
// No YAML parser in the project: the workflow is checked as text.
import yml from '../../.github/workflows/deploy.yml?raw';
import viteConfig from '../../vite.config.ts?raw';

describe('pages deploy workflow', () => {
  it('runs on a push to main and by hand', () => {
    expect(yml).toMatch(/^\s*push:\s*\n\s*branches:\s*\[\s*['"]?main['"]?\s*\]/m);
    expect(yml).toMatch(/^\s*workflow_dispatch:/m);
  });

  it('installs from the lockfile, checks and builds with bun', () => {
    expect(yml).toMatch(/oven-sh\/setup-bun@[0-9a-f]{40}\b/); // third-party action pinned to a commit
    expect(yml).toMatch(/bun install --frozen-lockfile/);
    expect(yml).toMatch(/bun run typecheck/);
    expect(yml).toMatch(/bun run test/);
    expect(yml).toMatch(/bun run build/);
  });

  it('does not run the e2e suite', () => {
    expect(yml).not.toMatch(/bun run e2e|playwright/);
  });

  it('uploads dist as the pages artifact and deploys it', () => {
    expect(yml).toMatch(/actions\/upload-pages-artifact@v3\s*\n\s*with:\s*\n\s*path:\s*['"]?\.?\/?dist\/?['"]?\s*$/m);
    expect(yml).toMatch(/actions\/deploy-pages@v4/);
  });

  it('grants pages and id-token write to the deploy job only', () => {
    const job = (name: string) => new RegExp(`^ {2}${name}:\\s*\\n((?: {4}.*\\n?|\\s*\\n)*)`, 'm').exec(yml)?.[1] ?? '';
    expect(job('deploy')).toMatch(/^\s*pages:\s*write\s*$/m);
    expect(job('deploy')).toMatch(/^\s*id-token:\s*write\s*$/m);
    expect(job('build')).toMatch(/^\s*contents:\s*read\s*$/m);
    expect(job('build')).not.toMatch(/write/);
    expect(yml.split(/^jobs:/m)[0]).not.toMatch(/write/);
  });

  it('deploys in its own job after build, to the github-pages environment, one run at a time', () => {
    const deploy = /^ {2}deploy:\s*\n((?: {4}.*\n?|\s*\n)*)/m.exec(yml)?.[1] ?? '';
    expect(deploy).toMatch(/^ {4}needs:\s*\[?\s*build\s*\]?\s*$/m);
    expect(deploy).toMatch(/^ {6}name:\s*github-pages\s*$/m);
    expect(yml).toMatch(/^concurrency:/m);
  });
});

describe('vite build for static hosting', () => {
  it('uses relative asset paths, so the build works under any sub-path', () => {
    expect(viteConfig).toMatch(/base:\s*['"]\.\/['"]/);
  });
});
