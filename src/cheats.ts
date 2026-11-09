/**
 * The cheat panel, only in a DEV_MODE=on build (vite.config.ts defines __DEV_MODE__; main.ts imports this file behind it, so no
 * other build carries it). A small pill at the bottom left of the page opens: pick a stage, solve the level on the board, play
 * any level 1-20, or clear the stage (level 20, solved) to see the stage-cleared celebration. Every action runs the game's own
 * flow (window.__chronoDev), so the complete card, the run and the high scores behave as if played.
 */
type Stage = 'easy' | 'medium' | 'hard';
export type CheatState = () => { stage: Stage; level: number; flow: string };

export const CHEATS_ID = 'chronogrip-cheats';

export function mountCheats(dev: ChronoDev, state: CheatState): HTMLElement {
  document.getElementById(CHEATS_ID)?.remove();
  const root = document.createElement('div');
  root.id = CHEATS_ID;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Developer cheats');
  root.innerHTML = `
    <style>
      #${CHEATS_ID} { position: fixed; left: 16px; bottom: 16px; z-index: 50; font: 600 13px/1.3 system-ui, sans-serif; color: #f3e6cf; }
      #${CHEATS_ID} .pill { border: 0; border-radius: 999px; padding: 7px 12px; background: rgba(20, 15, 10, .82); color: #e0a43a;
        letter-spacing: .12em; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
      #${CHEATS_ID} .card { display: none; margin-top: 8px; width: 236px; padding: 14px; border-radius: 16px;
        background: rgba(20, 15, 10, .9); backdrop-filter: blur(8px); box-shadow: 0 10px 34px rgba(0,0,0,.45); }
      #${CHEATS_ID}.open .card { display: block; }
      #${CHEATS_ID} .row { display: flex; gap: 6px; margin-top: 8px; }
      #${CHEATS_ID} button.act { flex: 1; padding: 8px 0; white-space: nowrap; border: 0; border-radius: 999px; background: #2b221a; color: #f3e6cf; font: inherit; cursor: pointer; }
      #${CHEATS_ID} button.act.primary { background: #e0a43a; color: #1a130b; }
      #${CHEATS_ID} button.act:hover { filter: brightness(1.15); }
      #${CHEATS_ID} select, #${CHEATS_ID} input { padding: 6px 8px; border-radius: 10px; border: 1px solid #3d3126; background: #1d1711; color: #f3e6cf; font: inherit; }
      #${CHEATS_ID} select { width: 100%; }
      #${CHEATS_ID} input { flex: 0 0 64px; min-width: 0; }
      #${CHEATS_ID} .now { color: #b9a68a; font-weight: 500; margin-top: 2px; }
    </style>
    <button class="pill" data-cheat="toggle" aria-expanded="false">DEV</button>
    <div class="card">
      <div>Developer cheats</div>
      <div class="now" data-cheat="now"></div>
      <div class="row"><select data-cheat="stage" aria-label="Stage"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
      <div class="row"><button class="act primary" data-cheat="solve">Solve level</button></div>
      <div class="row">
        <input data-cheat="level" type="number" min="1" max="20" value="20" aria-label="Level">
        <button class="act" data-cheat="jump">Play level</button>
      </div>
      <div class="row"><button class="act" data-cheat="clear">Clear stage</button></div>
    </div>`;
  const $ = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-cheat="${name}"]`)!;
  const stageSel = $<HTMLSelectElement>('stage'), levelIn = $<HTMLInputElement>('level');
  let shown: Stage | null = null;
  const refresh = () => {
    const s = state();
    // follow the game's stage only when it changes, so a pick in the list is not snapped back by the 500 ms poll
    if (s.stage !== shown) stageSel.value = shown = s.stage;
    $('now').textContent = `${s.stage[0]!.toUpperCase()}${s.stage.slice(1)} · level ${s.level} · ${s.flow}`;
  };
  $('toggle').addEventListener('click', () => {
    const open = root.classList.toggle('open');
    $('toggle').setAttribute('aria-expanded', String(open));
    if (open) refresh();
  });
  // A click on a cheat must not reach the canvas behind it (an orbit drag or a gear pick).
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  $('solve').addEventListener('click', () => (dev.solve(), refresh()));
  $('jump').addEventListener('click', () => (dev.jump(Number(levelIn.value), stageSel.value as Stage), refresh()));
  $('clear').addEventListener('click', () => (dev.clearStage(stageSel.value as Stage), refresh()));
  // While open, the status line follows the game (a level solved, a card changed).
  setInterval(() => root.classList.contains('open') && refresh(), 500);
  document.body.append(root);
  return root;
}
