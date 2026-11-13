// The landing page's global high scores: each stage's live top ten, read from the same public Supabase table the game uses
// (src/global.ts). Read-only. Everything that comes back is untrusted: rows are re-checked like parseRows and drawn with textContent.
const BASE = 'https://xsidhlyprisxfnverwdk.supabase.co/rest/v1/chronogrip_scores';
const KEY = 'sb_publishable_Jy8ytY7s0_ifaWOSznEScg_seDnXsrR'; // the publishable key: safe in a frontend by design
const TOP = 10;
const RUN_STEP = 20;
const TIMEOUT_MS = 4000;
// src/scores.ts BLOCKED_INITIALS: such initials are never shown.
const BLOCKED = new Set(['ASS', 'BCH', 'CNT', 'COK', 'CUK', 'CUM', 'DIC', 'DIK', 'DYK', 'FAG', 'FCK', 'FUC', 'FUK', 'FUQ', 'FUX', 'HOE', 'JIZ', 'KKK', 'KYS', 'NAZ', 'NGR', 'NIG', 'PUS', 'SEX', 'SHT', 'SUK', 'TIT', 'TWA', 'TWT', 'VAG', 'WNK', 'WTF', 'XXX']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const boardUrl = (board) =>
  `${BASE}?select=initials,seconds,step,created_at&level=eq.${board}&step=gte.1&step=lte.20&order=step.desc,seconds.asc&limit=${TOP}`;

/** "4 Nov" for a YYYY-MM-DD day; empty for anything else (src/scores.ts formatDate). */
function formatDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return '';
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${day} ${MONTHS[month - 1]}` : '';
}

/** m:ss.t, tenths floored (src/ui.ts clockTenths). */
function clockTenths(s) {
  const t = Math.floor(s * 10 + 1e-6);
  return `${Math.floor(t / 600)}:${String(Math.floor((t % 600) / 10)).padStart(2, '0')}.${t % 10}`;
}

/** Rows off the wire, keeping only those fit for a board (src/global.ts parseRows). */
function parseRows(body) {
  if (!Array.isArray(body)) return null;
  const out = [];
  for (const r of body) {
    if (out.length >= TOP) break;
    if (typeof r !== 'object' || r === null) continue;
    const { initials, seconds, step, created_at } = r;
    const secs = typeof seconds === 'string' && seconds.trim() !== '' ? Number(seconds) : seconds;
    const date = typeof created_at === 'string' ? created_at.slice(0, 10) : '';
    if (typeof initials !== 'string' || !/^[A-Z]{3}$/.test(initials) || BLOCKED.has(initials)) continue;
    if (typeof secs !== 'number' || !Number.isFinite(secs) || secs <= 0 || secs >= 86400 || !formatDate(date)) continue;
    if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > RUN_STEP) continue;
    out.push({ name: initials, ms: Math.round(secs * 1000), date, step });
  }
  return out;
}

/** A board's top ten, or null when it cannot be had (offline, an error, a timeout, rubbish back). Never throws. */
async function fetchBoard(board) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(boardUrl(board), { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: ctl.signal });
    return res.ok ? parseRows(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** A panel's fixed shape: the column labels, ten slots and the status line over them, so nothing moves when rows arrive. */
function buildPanel(panel, label) {
  const table = el('table', 'rows');
  table.append(el('caption', 'sr', `${label}: global top ten`));
  const head = el('tr');
  for (const [t, cls] of [['#', 'c-rank'], ['Name', 'c-name'], ['Levels', 'c-lvl'], ['Time', 'c-time'], ['Date', 'c-date']]) {
    const th = el('th', cls, t);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (let i = 0; i < TOP; i++) body.append(emptyRow(i));
  table.append(body);
  const status = el('p', 'board-status');
  status.setAttribute('role', 'status');
  panel.replaceChildren(table, status);
  return { body, status };
}

function emptyRow(i) {
  const tr = el('tr', 'slot');
  tr.setAttribute('aria-hidden', 'true');
  tr.append(el('td', 'c-rank', String(i + 1)), el('td', 'c-name', '—'), el('td', 'c-lvl'), el('td', 'c-time'), el('td', 'c-date'));
  return tr;
}

/** A time with every digit in one fixed cell, so the column lines up (the face's own digits are proportional), as the game's tabular(). Read out once, whole. */
function timeCell(s) {
  const td = el('td', 'c-time');
  const shown = el('span', 'cells');
  shown.setAttribute('aria-hidden', 'true');
  for (const ch of s) shown.append(el('span', /\d/.test(ch) ? 'd' : 'p', ch));
  td.append(el('span', 'sr', s), shown);
  return td;
}

function entryRow(e, i) {
  const tr = el('tr', i < 3 ? 'entry podium' : 'entry');
  tr.style.setProperty('--i', String(i));
  const full = e.step >= RUN_STEP;
  const lvl = el('td', full ? 'c-lvl full' : 'c-lvl', `${e.step}/${RUN_STEP}`);
  tr.append(el('td', 'c-rank', String(i + 1)), el('td', 'c-name', e.name), lvl, timeCell(clockTenths(e.ms / 1000)), el('td', 'c-date', formatDate(e.date)));
  return tr;
}

function setStatus(view, state, text) {
  view.panel.dataset.state = state;
  view.status.replaceChildren();
  if (state === 'loading') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cog');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#gear');
    svg.append(use);
    view.status.append(svg);
  }
  if (text) view.status.append(el('span', '', text));
  if (state === 'empty') {
    const a = el('a', '', 'Play');
    a.href = 'play/';
    view.status.append(' ', a);
  }
}

function show(view, rows) {
  if (!rows) return setStatus(view, 'offline', 'Scores are offline right now.');
  view.body.replaceChildren(...rows.map(entryRow), ...Array.from({ length: TOP - rows.length }, (_, k) => emptyRow(rows.length + k)));
  setStatus(view, rows.length ? 'ready' : 'empty', rows.length ? '' : 'No times yet. Be the first.');
}

function init(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  let touched = false;

  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };

  root.querySelector('[role="tablist"]').addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
    if (to === undefined) return;
    ev.preventDefault();
    touched = true;
    select(tabs[(to + tabs.length) % tabs.length], true);
  });
  for (const t of tabs) t.addEventListener('click', () => { touched = true; select(t, false); });

  const loads = tabs.map((tab) => {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    const view = { panel, ...buildPanel(panel, tab.textContent.trim()) };
    setStatus(view, 'loading', 'Loading scores');
    return fetchBoard(tab.dataset.boardId).then((rows) => {
      show(view, rows);
      return rows;
    });
  });

  // Opening on an empty stage while another has times undersells the board: until the visitor picks a tab, show the first stage with rows.
  Promise.all(loads).then((boards) => {
    if (touched || boards[0]?.length) return;
    const k = boards.findIndex((b) => b?.length);
    if (k > 0) select(tabs[k], false);
  });
}

const root = document.querySelector('[data-board]');
if (root) init(root);
