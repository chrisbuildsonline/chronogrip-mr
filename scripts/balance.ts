// bun scripts/balance.ts [seeds] [stage]  : mean/min/max measured score and par per stage x level (default 100 seeds, all stages).
import { difficultyOf, randomLevel } from '../src/random';
import { LEVELS_PER_STAGE, STAGES, dOf, parOf, targetScore } from '../src/stages';

const seeds = Number(process.argv[2]) || 100;
const f = (x: number) => x.toFixed(1).padStart(5);
for (const st of STAGES.filter((s) => !process.argv[3] || s.id === process.argv[3])) {
  console.log(`\n${st.name}  (${st.hint})`);
  console.log('lvl     D  target   mean    min    max   par');
  for (let n = 1; n <= LEVELS_PER_STAGE; n++) {
    const xs = Array.from({ length: seeds }, (_, i) => difficultyOf(randomLevel(dOf(st.id, n), (i + 1) * 7919)));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`${String(n).padStart(3)}  ${dOf(st.id, n).toFixed(2)}  ${f(targetScore(st.id, n))}  ${f(mean)}  ${f(Math.min(...xs))}  ${f(Math.max(...xs))}  ${String(parOf(st.id, n)).padStart(4)}`);
  }
}
