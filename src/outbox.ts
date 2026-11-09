import { markPosted, unposted, type Scores } from './scores';

/**
 * STATE: the outbox that gets every local score to the global board. An entry stays unposted until the board accepts it, so a
 * failed or offline post is tried again on the next flush (boot, the High scores card, a new save); an entry from before the global
 * board has no flag and is sent once. A cheated run (`dev`) is never sent. One pass runs at a time, and a flush asked for while a
 * pass is running makes it go round again, so an entry saved meanwhile is not missed. A pass sends one entry at a time and stops
 * at the first that fails (offline: no point hammering).
 */
export function createOutbox(
  get: () => Scores,
  set: (s: Scores) => void,
  post: (board: string, name: string, ms: number, cleared: number) => Promise<boolean>,
  posted: (board: string) => void = () => {},
) {
  let running: Promise<void> | null = null;
  let again = false;
  async function pass(): Promise<void> {
    do {
      again = false;
      for (const { board, entry } of unposted(get())) {
        let ok = false;
        try {
          ok = await post(board, entry.name, entry.ms, entry.cleared ?? 20);
        } catch {
          ok = false;
        }
        if (!ok) return;
        set(markPosted(get(), board, entry)); // marked before the next entry, so a later pass never sends it again
        posted(board);
      }
    } while (again);
  }
  return {
    /** Sends what is unposted; resolves when the pass is over. Never throws. */
    flush(): Promise<void> {
      if (running) {
        again = true;
        return running;
      }
      running = pass().finally(() => void (running = null));
      return running;
    },
  };
}
