import { describe, expect, it } from 'vitest';
import { startSession } from '../../src/enter';

const note = () => ({ hidden: true, textContent: '' as string | null });

describe('startSession', () => {
  it('leaves the note alone when the launch works', async () => {
    const n = note();
    await startSession(() => undefined, n);
    expect(n.hidden).toBe(true);
  });

  it('shows the reason when the launch throws', async () => {
    const n = note();
    await startSession(() => {
      throw new Error('boom');
    }, n);
    expect(n.hidden).toBe(false);
    expect(n.textContent).toContain('boom');
  });

  it('shows the reason when the launch rejects', async () => {
    const n = note();
    await startSession(() => Promise.reject(new Error('hand tracking denied')), n);
    expect(n.hidden).toBe(false);
    expect(n.textContent).toContain('hand tracking denied');
  });

  it('copes with a non-Error rejection', async () => {
    const n = note();
    await startSession(() => Promise.reject('nope'), n);
    expect(n.hidden).toBe(false);
    expect(n.textContent).toContain('nope');
  });
});
