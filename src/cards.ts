import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture, TextureLoader } from 'three';
import { C } from './palette';
import { BOB_M, bob, kenBurns } from './motion';
import { LEVELS_PER_STAGE, STAGES, type StageId } from './stages';
import type { Button } from './ui';

/** Canvas pixels per metre of a card's words and gradient, as in src/panels.ts. */
const PX = 3000;
const mm = (v: number) => v * 3;
const JOSEFIN = '"Josefin Sans", system-ui, sans-serif';
const IMAGE_ASPECT = 480 / 640;

/** What a card shows besides its stage: the player's best time there, if any, as m:ss. */
export type CardData = { hover: string | null; bests: Partial<Record<StageId, string>>; narrow: boolean };

/** The words over a card's art: a dark gradient, the stage name, its hint, "20 LEVELS" and the best time; an amber outline when hovered. */
function drawOverlay(g: CanvasRenderingContext2D, w: number, h: number, st: (typeof STAGES)[number], best: string | undefined, hover: boolean, landscape: boolean) {
  g.clearRect(0, 0, w, h);
  g.letterSpacing = '0px';
  const shade = landscape ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, h * 0.3, 0, h);
  shade.addColorStop(0, landscape ? 'rgba(10,7,4,0.88)' : 'rgba(10,7,4,0)');
  shade.addColorStop(landscape ? 0.65 : 1, landscape ? 'rgba(10,7,4,0.15)' : 'rgba(10,7,4,0.92)');
  g.fillStyle = shade;
  g.fillRect(0, landscape ? 0 : h * 0.3, w, landscape ? h : h * 0.7);
  const word = (s: string, x: number, y: number, weight: number, size: number, color: string, track: number, align: CanvasTextAlign = 'left') => {
    g.font = `${weight} ${size}px ${JOSEFIN}`;
    g.letterSpacing = `${track}px`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  const pad = mm(6);
  const levels = `${LEVELS_PER_STAGE} LEVELS`;
  if (landscape) {
    word(st.name.toUpperCase(), pad, h * 0.38, 300, h * 0.3, C.logo, 5);
    word(st.hint, pad, h * 0.72, 400, h * 0.15, C.menuInk, 1);
    word(levels, w - pad, h * 0.38, 600, h * 0.13, C.amber, 4, 'right');
    if (best) word(`BEST ${best}`, w - pad, h * 0.72, 400, h * 0.14, C.menuHi, 2, 'right');
  } else {
    word(st.name.toUpperCase(), pad, h * 0.66, 300, w * 0.15, C.logo, 4);
    word(st.hint, pad, h * 0.77, 400, w * 0.068, C.menuInk, 1);
    word(levels, pad, h * 0.865, 600, w * 0.058, C.amber, 4);
    if (best) word(`BEST ${best}`, pad, h * 0.935, 400, w * 0.06, C.menuHi, 2);
  }
  if (hover) {
    g.lineWidth = mm(1.6);
    g.strokeStyle = C.amber;
    g.strokeRect(mm(0.8), mm(0.8), w - mm(1.6), h - mm(1.6));
  }
}

/**
 * The stage picker's three cards: each a group of two textured planes (the stage's art, and the words over it), laid over the
 * menu panel at the rectangles of the layout's `card` buttons. They float and the art pans on a texture offset and a position,
 * a frame at a time (`update`): no extra render pass, and the words are only redrawn when the hover or the bests change.
 */
export function createStageCards() {
  const group = new Group();
  group.name = 'stage-cards';
  group.visible = false;
  const loader = new TextureLoader();
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const cards = STAGES.map((st) => {
    const art = loader.load(`backdrops/card-${st.id}.jpg`, undefined, undefined, () => undefined);
    art.colorSpace = SRGBColorSpace;
    const canvas = document.createElement('canvas');
    const words = new CanvasTexture(canvas);
    words.colorSpace = SRGBColorSpace;
    const artMesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: art, transparent: true, depthWrite: false }));
    const wordsMesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: words, transparent: true, depthWrite: false }));
    artMesh.renderOrder = 11;
    wordsMesh.renderOrder = 12;
    wordsMesh.position.z = 0.0005;
    const holder = new Group();
    holder.add(artMesh, wordsMesh);
    group.add(holder);
    return { st, art: art as Texture, canvas, words, artMesh, wordsMesh, holder, home: [0, 0] as [number, number], size: [1, 1] as [number, number], mix: 0, key: '' };
  });
  let hover: string | null = null;
  let narrow = false;

  const state = () => ({
    visible: group.visible,
    reduced: !!reducedQuery?.matches,
    cards: cards.map((c) => ({ id: `stage-${c.st.id}`, hint: c.st.hint, lift: c.holder.position.y - c.home[1], mix: c.mix, brightness: (c.artMesh.material as MeshBasicMaterial).color.r, hover: hover === `stage-${c.st.id}`, offset: [c.art.offset.x, c.art.offset.y] as [number, number] })),
  });

  return {
    group,
    state,
    /** Places the cards at the layout's card buttons (panel space) and redraws their words; none given hides them. */
    set(buttons: readonly Button[], data: CardData) {
      const mine = buttons.filter((b) => b.kind === 'card');
      group.visible = mine.length > 0;
      hover = data.hover;
      narrow = data.narrow;
      for (const c of cards) {
        const b = mine.find((x) => x.id === `stage-${c.st.id}`);
        if (!b) continue;
        c.home = [b.x, b.y];
        c.size = [b.w, b.h];
        c.artMesh.scale.set(b.w, b.h, 1);
        c.wordsMesh.scale.set(b.w, b.h, 1);
        const key = JSON.stringify([b.w, b.h, hover === b.id, data.bests[c.st.id] ?? '']);
        if (key === c.key) continue;
        c.key = key;
        const [pw, ph] = [Math.round(b.w * PX), Math.round(b.h * PX)];
        if (c.canvas.width !== pw || c.canvas.height !== ph) {
          c.canvas.width = pw;
          c.canvas.height = ph;
          c.words.dispose();
        }
        drawOverlay(c.canvas.getContext('2d')!, pw, ph, c.st, data.bests[c.st.id], hover === b.id, b.w / b.h > 2);
        c.words.needsUpdate = true;
      }
    },
    /** One frame: float, pan and zoom the art, and ease the hover (lift, brighter art; the others dim a little). */
    update(now: number) {
      if (!group.visible) return;
      const t = now / 1000;
      const reduced = !!reducedQuery?.matches;
      cards.forEach((c, i) => {
        const on = hover === `stage-${c.st.id}`;
        c.mix += ((on ? 1 : 0) - c.mix) * 0.2;
        const lift = 0.004 * c.mix;
        c.holder.position.set(c.home[0], c.home[1] + bob(t, i, reduced) + lift, 0.004);
        c.holder.scale.setScalar(1 + 0.035 * c.mix);
        const others = hover !== null && !on ? 1 : 0;
        const k = 0.92 + 0.3 * c.mix - 0.3 * others;
        (c.artMesh.material as MeshBasicMaterial).color.setScalar(k);
        const win = kenBurns(t, i, c.size[0] / c.size[1], IMAGE_ASPECT, reduced);
        c.art.repeat.set(win.repeat.x, win.repeat.y);
        c.art.offset.set(win.offset.x, win.offset.y);
      });
    },
    /** A phone's card draws over everything (no depth test); in XR a real hand still hides it. */
    setDepth(on: boolean) {
      for (const c of cards) for (const m of [c.artMesh, c.wordsMesh]) (m.material as MeshBasicMaterial).depthTest = on;
    },
    BOB_M,
    get narrow() {
      return narrow;
    },
  };
}
