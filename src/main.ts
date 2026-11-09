import './styles.css';
import type { Feedback, GameStatus, Mode, RouteData, RoutesFile } from './types';
import { MAX_GUESSES } from './types';
import { answerForDay, dayIndex, formatCountdown, msUntilNextDay, puzzleNumber, randomAnswer } from './game/daily';
import { computeFeedback, zonaLabel } from './game/feedback';
import { buildShareText, shareResult } from './game/share';
import { load, save } from './game/storage';
import { getStats, recordResult } from './game/stats';
import { MapView } from './ui/map';
import { announceText, renderGrid, ROW_REVEAL_MS } from './ui/grid';
import { GuessInput, normalizeId } from './ui/input';
import { openDialog, renderStats, setupDialogs } from './ui/modals';
import { icons, logoSvg } from './ui/icons';

// ---------- estado ----------
type Theme = 'auto' | 'light' | 'dark';
interface Settings {
  theme: Theme;
  seenHelp: boolean;
  showGuesses: boolean;
}
interface DailySave {
  day: number;
  guesses: string[];
  status: GameStatus;
}
interface PracticeSave {
  /** id de la respuesta, ofuscado */
  a: string;
  guesses: string[];
  status: GameStatus;
}

const settings: Settings = { theme: 'auto', seenHelp: false, showGuesses: true, ...load<Partial<Settings>>('settings', {}) };
const today = dayIndex();
let daily: DailySave = load<DailySave | null>('daily', null) ?? { day: today, guesses: [], status: 'playing' };
if (daily.day !== today) daily = { day: today, guesses: [], status: 'playing' };
let practice: PracticeSave | null = load<PracticeSave | null>('practice', null);
let mode: Mode = 'daily';
let busy = false;

let data: RoutesFile;
const byId = new Map<string, RouteData>();
let dailyAnswer: RouteData;

const hide = (id: string) => btoa(unescape(encodeURIComponent([...id].reverse().join('') + '|μ')));
const unhide = (s: string) => {
  try {
    return [...decodeURIComponent(escape(atob(s))).replace(/\|μ$/, '')].reverse().join('');
  } catch {
    return '';
  }
};

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const mapView = new MapView($('map'));
const guessInput = new GuessInput($<HTMLFormElement>('guess-form'), onGuess);

$('btn-help').innerHTML = icons.help;
$('btn-stats').innerHTML = icons.stats;
$('btn-settings').innerHTML = icons.settings;
$('brand-logo').innerHTML = logoSvg(30);
setupDialogs();

// ---------- tema ----------
const mql = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveTheme(): 'light' | 'dark' {
  return settings.theme === 'auto' ? (mql.matches ? 'dark' : 'light') : settings.theme;
}
function applyTheme() {
  const t = effectiveTheme();
  document.documentElement.dataset.theme = t;
  mapView.setTheme(t);
}
mql.addEventListener?.('change', () => settings.theme === 'auto' && applyTheme());
applyTheme();

// ---------- helpers ----------
function current() {
  if (mode === 'daily') return { answer: dailyAnswer, guesses: daily.guesses, status: daily.status };
  const answer = (practice && byId.get(normalizeId(unhide(practice.a)))) || dailyAnswer;
  return { answer, guesses: practice?.guesses ?? [], status: practice?.status ?? 'playing' };
}

function feedbackFor(guesses: string[], answer: RouteData): Feedback[] {
  return guesses
    .map((g) => byId.get(normalizeId(g)))
    .filter((r): r is RouteData => !!r)
    .map((r) => computeFeedback(r, answer));
}

let toastTimer = 0;
function toast(msg: string, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function announce(msg: string) {
  const el = $('sr-live');
  el.textContent = '';
  setTimeout(() => (el.textContent = msg), 50);
}

function persist() {
  save('daily', daily);
  if (practice) save('practice', practice);
  save('settings', settings);
}

// ---------- render ----------
const HINTS = [
  { lvl: 1, name: 'Mapa' },
  { lvl: 2, name: 'Calles' },
  { lvl: 3, name: 'Terminales' },
  { lvl: 4, name: 'Comunas' },
  { lvl: 5, name: 'Zona' },
];

function render(opts: { animateRow?: number; animateReveal?: boolean } = {}) {
  const { answer, guesses, status } = current();
  const fb = feedbackFor(guesses, answer);
  const finished = status !== 'playing';
  const fails = fb.filter((f) => !f.correct).length;
  const level = finished ? 5 : Math.min(fails, 5);

  // Tabs
  $('tab-daily').setAttribute('aria-selected', String(mode === 'daily'));
  $('tab-practice').setAttribute('aria-selected', String(mode === 'practice'));
  document.body.dataset.mode = mode;

  // Mapa
  mapView.render({
    answer,
    level,
    guesses: guesses.map((g) => byId.get(normalizeId(g))).filter((r): r is RouteData => !!r),
    showGuesses: settings.showGuesses,
    finished,
    animateReveal: !!opts.animateReveal,
  });
  $('map').setAttribute(
    'aria-label',
    finished
      ? `Recorrido ${answer.id}: ${answer.origen} a ${answer.destino}`
      : `Trazado del recorrido misterioso. Pistas abiertas: ${level} de 5`,
  );

  // Pistas
  const hints = $('hints');
  hints.innerHTML = HINTS.map((h) => {
    const open = level >= h.lvl;
    const label = open ? `${h.name}: visible` : `${h.name}: se abre tras ${h.lvl} ${h.lvl === 1 ? 'fallo' : 'fallos'}`;
    return `<li class="hint${open ? ' open' : ''}" title="${label}" aria-label="${label}">${open ? '<span class="hint-dot" aria-hidden="true">✓</span>' : icons.lock}<span>${h.name}</span></li>`;
  }).join('');

  const detail: string[] = [];
  if (level >= 4) {
    detail.push(
      `<div class="hint-row"><span class="hint-k">Comunas</span><span class="chips">${answer.comunas
        .map((c) => `<span class="chip">${c}</span>`)
        .join('')}</span></div>`,
    );
  }
  if (level >= 5) {
    detail.push(
      `<div class="hint-row"><span class="hint-k">Zona</span><span class="chips"><span class="chip chip-strong">${zonaLabel(answer.zona)}</span></span></div>`,
    );
  }
  $('hint-detail').innerHTML = detail.join('');

  // Grilla
  renderGrid($('grid'), fb, opts.animateRow ?? null);

  // Input
  guessInput.setExcluded(guesses);
  guessInput.setDisabled(finished || busy);
  $('guess-form').hidden = finished;

  // Resultado
  const res = $('result');
  if (finished && !busy) {
    const won = status === 'won';
    res.hidden = false;
    res.innerHTML = `
      <p class="result-head">${won ? pickCheer(fb.length) : 'Esta vez no fue'}</p>
      <div class="result-route">
        <span class="route-badge">${answer.id}</span>
        <span class="route-name">${answer.nombre.replace(/\s+-\s+/g, ' – ')}</span>
      </div>
      <p class="od"><span>${answer.origen || 'Origen'}</span><span class="od-arrow" aria-label="hacia">→</span><span>${answer.destino || 'Destino'}</span></p>
      <p class="muted small">${answer.largoKm} km · ${answer.comunas.length} ${answer.comunas.length === 1 ? 'comuna' : 'comunas'} · ${zonaLabel(answer.zona)}</p>
      <div class="result-actions">
        <button type="button" class="btn btn-primary" id="btn-share">${icons.share}<span>Compartir</span></button>
        ${
          mode === 'daily'
            ? `<div class="countdown-box"><span class="stat-l">Próxima micro</span><span class="countdown" data-countdown>--:--:--</span></div>`
            : `<button type="button" class="btn" id="btn-new">${icons.shuffle}<span>Nueva micro</span></button>`
        }
      </div>`;
    $('btn-share').addEventListener('click', doShare);
    $('btn-new')?.addEventListener('click', newPractice);
    tick();
  } else {
    res.hidden = true;
    res.innerHTML = '';
  }
}

function pickCheer(n: number) {
  return ['¡Increíble! A la primera', '¡Impresionante!', '¡Muy bien!', '¡Bien hecho!', '¡Justo!', '¡Por un pelo!'][n - 1] ?? '¡Bien!';
}

// ---------- jugar ----------
function onGuess(raw: string) {
  if (busy) return;
  const cur = current();
  if (cur.status !== 'playing') return;
  const q = normalizeId(raw);
  if (!q) return;
  const route = byId.get(q);
  if (!route) {
    guessInput.shake();
    toast('No es un recorrido válido');
    return;
  }
  if (cur.guesses.some((g) => normalizeId(g) === q)) {
    guessInput.shake();
    toast('Ya probaste esa micro');
    return;
  }

  const guesses = [...cur.guesses, route.id];
  const won = route.id === cur.answer.id;
  const status: GameStatus = won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing';

  if (mode === 'daily') {
    daily = { ...daily, guesses, status };
  } else if (practice) {
    practice = { ...practice, guesses, status };
  }
  persist();
  guessInput.clear();

  const fb = computeFeedback(route, cur.answer);
  busy = true;
  // Durante la animación mostramos la fila nueva; el mapa avanza al terminar el flip.
  const animateRow = guesses.length - 1;
  renderGridOnly(guesses, cur.answer, animateRow);
  guessInput.setDisabled(true);

  setTimeout(() => {
    busy = false;
    announce(announceText(fb));
    if (status !== 'playing') {
      if (mode === 'daily') recordResult(today, won, guesses.length);
      render({ animateReveal: true });
      if (!won) toast(`Era la ${cur.answer.id}`, 2600);
      if (mode === 'daily') setTimeout(() => showStats(), 2600);
    } else {
      render();
      guessInput.focus();
      const lvl = Math.min(guesses.filter((g) => g !== cur.answer.id).length, 5);
      const name = HINTS.find((h) => h.lvl === lvl)?.name;
      if (name) toast(`Nueva pista: ${name}`);
    }
  }, ROW_REVEAL_MS + 80);
}

function renderGridOnly(guesses: string[], answer: RouteData, animateRow: number) {
  renderGrid($('grid'), feedbackFor(guesses, answer), animateRow);
}

function newPractice() {
  const prev = practice ? unhide(practice.a) : undefined;
  const a = randomAnswer(data.routes, prev);
  practice = { a: hide(a.id), guesses: [], status: 'playing' };
  persist();
  render();
  guessInput.focus();
}

async function doShare() {
  const { guesses, status, answer } = current();
  const text = buildShareText({
    mode,
    number: puzzleNumber(today),
    feedback: feedbackFor(guesses, answer),
    won: status === 'won',
  });
  const r = await shareResult(text);
  if (r === 'copied') toast('Resultado copiado al portapapeles');
  else if (r === 'failed') toast('No se pudo copiar 😕');
}

function showStats() {
  const s = getStats(today);
  const body = $('stats-body');
  const dailyDone = daily.status !== 'playing';
  renderStats(body, s, {
    highlight: daily.status === 'won' ? daily.guesses.length - 1 : null,
    finished: dailyDone,
  });
  body.querySelector('[data-share]')?.addEventListener('click', async () => {
    const text = buildShareText({
      mode: 'daily',
      number: puzzleNumber(today),
      feedback: feedbackFor(daily.guesses, dailyAnswer),
      won: daily.status === 'won',
    });
    const r = await shareResult(text);
    if (r === 'copied') toast('Resultado copiado al portapapeles');
    else if (r === 'failed') toast('No se pudo copiar 😕');
  });
  tick();
  openDialog('dlg-stats');
}

// ---------- reloj ----------
function tick() {
  const ms = msUntilNextDay();
  const txt = formatCountdown(ms);
  document.querySelectorAll('[data-countdown]').forEach((el) => (el.textContent = txt));
  if (dayIndex() !== today && !busy) {
    // Cambió el día en Chile: nueva micro.
    location.reload();
  }
}
setInterval(tick, 1000);

// ---------- eventos UI ----------
$('btn-help').addEventListener('click', () => openDialog('dlg-help'));
$('btn-stats').addEventListener('click', showStats);
$('btn-settings').addEventListener('click', () => openDialog('dlg-settings'));
document.querySelector('#dlg-help [data-close]')?.addEventListener('click', () =>
  ($('dlg-help') as HTMLDialogElement).close(),
);
$('dlg-help').addEventListener('close', () => {
  settings.seenHelp = true;
  persist();
});

function setMode(m: Mode) {
  if (busy || m === mode) return;
  mode = m;
  if (mode === 'practice' && !practice) {
    newPractice();
    return;
  }
  render();
}
$('tab-daily').addEventListener('click', () => setMode('daily'));
$('tab-practice').addEventListener('click', () => setMode('practice'));
$('tab-daily').addEventListener('keydown', (e) => e.key === 'ArrowRight' && ($('tab-practice').focus(), setMode('practice')));
$('tab-practice').addEventListener('keydown', (e) => e.key === 'ArrowLeft' && ($('tab-daily').focus(), setMode('daily')));

document.querySelectorAll<HTMLInputElement>('input[name=theme]').forEach((r) => {
  r.checked = r.value === settings.theme;
  r.addEventListener('change', () => {
    settings.theme = r.value as Theme;
    persist();
    applyTheme();
  });
});
const showG = $<HTMLInputElement>('opt-show-guesses');
showG.checked = settings.showGuesses;
showG.addEventListener('change', () => {
  settings.showGuesses = showG.checked;
  persist();
  if (data) render();
});

window.addEventListener('resize', () => mapView.invalidate());

// ---------- arranque ----------
async function init() {
  try {
    const res = await fetch('/routes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    $('map-loading').textContent = 'No se pudieron cargar los recorridos. Revisa tu conexión y recarga.';
    return;
  }
  for (const r of data.routes) byId.set(normalizeId(r.id), r);
  guessInput.setRoutes(data.routes);
  dailyAnswer = answerForDay(data.routes, today);
  // Si el GTFS cambió y algún intento guardado ya no existe, se ignora sin romper el juego.
  $('daily-num').textContent = `#${puzzleNumber(today)}`;
  $('data-version').textContent = `Datos: ${data.gtfs}. Generado el ${data.version}.`;
  $('map-loading').remove();
  render();
  if (!settings.seenHelp) openDialog('dlg-help');
  else guessInput.focus();
}

init();
