import '../shared/base.css';
import './caro.css';
import type { CaroItem, CaroItemsFile, Guess, PricedRef } from './types';
import { DAILY_ROUNDS } from './types';
import {
  absurdPhrase,
  buildCaroShare,
  buildChain,
  CARO_EPOCH,
  CARO_SALT,
  decodeRef,
  formatCLP,
  isCorrect,
  nextInfinite,
  pricedPool,
} from './game';
import { categoryIcon } from './icons';
import {
  CARO_STATS,
  loadCaroDaily,
  loadCaroSettings,
  loadRecord,
  saveCaroDaily,
  saveCaroSettings,
  saveRecord,
  type CaroDaily,
} from './state';
import { entryForDay, type ScheduleFile } from '../shared/schedule';
import { dateForDay, dayIndex, formatCountdown, msUntilNextDay, puzzleNumber } from '../shared/time';
import { hashString, mulberry32 } from '../shared/rng';
import { getStats, recordResult } from '../shared/stats';
import { recordDailyPlayed } from '../shared/activity';
import { shareResult } from '../shared/share';
import { bindThemeRadios, initTheme } from '../shared/theme';
import { openDialog, renderStats, setupDialogs } from '../shared/ui/dialogs';
import { announce, startCountdown, toast } from '../shared/ui/toast';
import { icons } from '../shared/ui/icons';
import { haptic, HAPTIC, hapticsEnabled, reducedMotion, setHapticsEnabled } from '../shared/ui/haptics';

type Mode = 'daily' | 'infinite';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- estado ----------
const params = new URLSearchParams(location.search);
if (params.has('hoy')) history.replaceState(null, '', location.pathname);
/** Día del puzzle de esta sesión: no cambia aunque pase la medianoche */
const today = dayIndex(CARO_EPOCH);
const settings = loadCaroSettings();
let mode: Mode = params.get('modo') === 'infinito' ? 'infinite' : 'daily';
let busy = false;

let byId = new Map<string, CaroItem>();
let pool: PricedRef[] = [];
let chain: PricedRef[] | null = null; // diario: 11 ítems
let daily: CaroDaily = loadCaroDaily(today);

// infinito
let inf: { a: PricedRef; b: PricedRef; used: Set<string>; score: number; over: boolean } | null = null;
let record = loadRecord();

const fechaFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fechaCorta = (iso: string) => fechaFmt.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');

// ---------- DOM fijo ----------
$('btn-home').innerHTML = icons.home;
$('btn-help').innerHTML = icons.help;
$('btn-stats').innerHTML = icons.stats;
$('btn-settings').innerHTML = icons.settings;
setupDialogs();
initTheme();
bindThemeRadios();
const hapt = $<HTMLInputElement>('opt-haptics');
hapt.checked = hapticsEnabled();
hapt.addEventListener('change', () => setHapticsEnabled(hapt.checked));

// ---------- helpers ----------
const item = (r: PricedRef): CaroItem => ({ ...byId.get(r.id)!, precio: r.precio });

/** Par actual (A con precio visible, B oculto). */
function currentPair(): { a: PricedRef; b: PricedRef } | null {
  if (mode === 'daily') {
    if (!chain || daily.status === 'done') return null;
    const i = daily.results.length;
    return { a: chain[i], b: chain[i + 1] };
  }
  return inf && !inf.over ? { a: inf.a, b: inf.b } : null;
}

/** Nombre del ítem con link a la página donde se vio el precio (en la boleta final). */
function srcLink(it: CaroItem): string {
  return `<a href="${it.fuenteUrl}" target="_blank" rel="noopener noreferrer" title="${it.fuente} · ${fechaCorta(it.fechaPrecio)}">${it.item}</a>`;
}

const imageUrl = (it: CaroItem) => (it.imagen ? `/caro/img/${it.imagen}.webp` : '');

/** Precarga la foto de un ítem que viene después, para que no aparezca en blanco. */
function preload(r: PricedRef | undefined) {
  const it = r && byId.get(r.id);
  const url = it && imageUrl(it);
  if (url) new Image().src = url;
}

/** La fuente es un enlace: dentro de un botón no se puede, así que va como texto y el link en la boleta y el pie. */
function sourceText(it: CaroItem): string {
  return `Fuente: ${it.fuente} · ${fechaCorta(it.fechaPrecio)}`;
}

function fillSide(side: 'a' | 'b', it: CaroItem, revealPrice: boolean) {
  const el = $(`side-${side}`);
  const url = imageUrl(it);
  el.style.backgroundImage = url ? `url("${url}")` : '';
  el.classList.remove('is-ok', 'is-bad');
  $(`verdict-${side}`).hidden = true;
  $(`cat-${side}`).innerHTML = `<span class="ico" aria-hidden="true">${categoryIcon(it.categoria)}</span>${it.categoria}`;
  $(`name-${side}`).textContent = it.item;
  const price = $(`price-${side}`);
  price.textContent = revealPrice ? formatCLP(it.precio) : '$ ???';
  price.classList.toggle('hidden-price', !revealPrice);
  $(`src-${side}`).textContent = revealPrice ? sourceText(it) : '';
  el.setAttribute(
    'aria-label',
    `${it.item}. ${revealPrice ? `Cuesta ${formatCLP(it.precio)}` : 'Precio oculto'}. Tocar si es el más caro.`,
  );
}

function setButtons(enabled: boolean) {
  ($('side-a') as HTMLButtonElement).disabled = !enabled;
  ($('side-b') as HTMLButtonElement).disabled = !enabled;
}

// ---------- render ----------
function renderProgress() {
  const p = $('progress');
  if (mode === 'daily') {
    const ticks = Array.from({ length: DAILY_ROUNDS }, (_, i) => {
      const r = daily.results[i];
      const cls = r === true ? 'ok' : r === false ? 'bad' : i === daily.results.length && daily.status !== 'done' ? 'now' : '';
      return `<span class="tick ${cls}"></span>`;
    }).join('');
    const score = daily.results.filter(Boolean).length;
    p.innerHTML = `<span>#${puzzleNumber(today)}</span><span class="ticks" aria-hidden="true">${ticks}</span><span class="sr-only">Comparación ${Math.min(daily.results.length + 1, DAILY_ROUNDS)} de ${DAILY_ROUNDS}, ${score} aciertos</span>`;
  } else {
    p.innerHTML = `<span>Racha ${inf?.score ?? 0}</span><span class="muted">· Récord ${record}</span>`;
  }
  $('tab-daily').setAttribute('aria-selected', String(mode === 'daily'));
  $('tab-infinite').setAttribute('aria-selected', String(mode === 'infinite'));
}

function render(opts: { enter?: boolean } = {}) {
  renderProgress();
  const pair = currentPair();
  const ended = !pair;
  $('duel').hidden = ended;
  $('controls').hidden = ended;
  $('soon').hidden = !!pool.length && (mode === 'infinite' || !!chain);
  if (!$('soon').hidden) {
    $('duel').hidden = true;
    $('controls').hidden = true;
    $('end').hidden = true;
    return;
  }
  if (ended) {
    renderEnd();
    return;
  }
  $('end').hidden = true;
  const a = item(pair.a);
  const b = item(pair.b);
  fillSide('a', a, true);
  fillSide('b', b, false);
  $('phrase').innerHTML = '<span class="ask">¿Cuál sale más caro?</span>';
  $('btn-next').hidden = true;
  setButtons(!busy);
  // La siguiente foto (la que entra después) ya queda descargada
  if (mode === 'daily' && chain) preload(chain[daily.results.length + 2]);
  const duel = $('duel');
  duel.classList.remove('enter');
  if (opts.enter && !reducedMotion()) {
    void duel.offsetWidth;
    duel.classList.add('enter');
  }
}

/** Boleta final del diario o del infinito. */
function renderEnd() {
  const end = $('end');
  end.hidden = false;
  if (mode === 'daily' && chain) {
    const score = daily.results.filter(Boolean).length;
    const lines = daily.results
      .map((ok, i) => {
        const a = item(chain![i]);
        const b = item(chain![i + 1]);
        return `<li><span class="mark ${ok ? 'ok' : 'bad'}" aria-label="${ok ? 'Acierto' : 'Error'}">${ok ? '✓' : '✗'}</span><span class="vs-txt">${srcLink(b)} <span class="muted">vs</span> ${srcLink(a)}</span><span class="amt">${formatCLP(b.precio)}</span></li>`;
      })
      .join('');
    end.innerHTML = `
      <div class="receipt-head label"><span>¿Qué sale más caro?</span><span>N° ${String(puzzleNumber(today)).padStart(4, '0')}</span></div>
      <p class="score">${score}<small>/${DAILY_ROUNDS}</small></p>
      <p class="score-note">${scoreNote(score)}</p>
      <div class="end-actions">
        <button type="button" class="btn btn-primary" id="btn-share">${icons.share}<span>Compartir</span></button>
        <div class="countdown-box"><span class="stat-l">Próxima boleta en</span><span class="countdown" data-countdown>--:--:--</span></div>
      </div>
      <ol class="lines" aria-label="Tus respuestas">${lines}</ol>
      <div class="end-actions"><button type="button" class="btn" id="btn-go-inf">Seguir en modo infinito</button></div>`;
    $('btn-share').addEventListener('click', doShare);
    $('btn-go-inf').addEventListener('click', () => setMode('infinite'));
    tick();
  } else {
    const s = inf?.score ?? 0;
    end.innerHTML = `
      <div class="receipt-head label"><span>Modo infinito</span><span>Récord ${record}</span></div>
      <p class="score">${s}</p>
      <p class="score-note">${s >= record && s > 0 ? 'Nuevo récord.' : s === 0 ? 'A la primera no.' : `Seguidas. Tu récord es ${record}.`}</p>
      <div class="end-actions"><button type="button" class="btn btn-primary" id="btn-again">Otra vez</button></div>`;
    $('btn-again').addEventListener('click', () => {
      startInfinite();
      render({ enter: true });
      ($('side-a') as HTMLButtonElement).focus({ preventScroll: true });
    });
  }
}

function scoreNote(s: number): string {
  if (s === DAILY_ROUNDS) return 'Perfecto. Sabes cuánto cuesta todo.';
  if (s >= 8) return 'Muy bien. Tienes ojo para los precios.';
  if (s >= 5) return 'Nada mal.';
  if (s >= 3) return 'Los precios están difíciles.';
  return 'Mañana sale otra.';
}

// ---------- jugar ----------
/** Sube el número de 0 al precio en ~800 ms (instantáneo con movimiento reducido). */
function countUp(el: HTMLElement, to: number, ms = 800): Promise<void> {
  el.classList.remove('hidden-price');
  if (reducedMotion()) {
    el.textContent = formatCLP(to);
    return Promise.resolve();
  }
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = formatCLP(Math.round(to * eased));
      if (k < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

async function answer(guess: Guess) {
  const pair = currentPair();
  if (busy || !pair) return;
  busy = true;
  setButtons(false);
  haptic(HAPTIC.tap);

  const a = item(pair.a);
  const b = item(pair.b);
  const ok = isCorrect(a.precio, b.precio, guess);

  // Se guarda ANTES de animar: recargar a mitad de animación no permite reintentar
  if (mode === 'daily') {
    daily = { ...daily, results: [...daily.results, ok] };
    if (daily.results.length >= DAILY_ROUNDS) daily.status = 'done';
    saveCaroDaily(daily);
  }

  await countUp($('price-b'), b.precio);
  $('src-b').textContent = sourceText(b);
  $('side-b').setAttribute('aria-label', `${b.item}. Cuesta ${formatCLP(b.precio)}.`);
  // Sello sobre la mitad que tocaste
  const picked = guess === 'higher' ? 'b' : 'a';
  $(`side-${picked}`).classList.add(ok ? 'is-ok' : 'is-bad');
  const verdict = $(`verdict-${picked}`);
  verdict.hidden = false;
  verdict.textContent = ok ? '✓ Bien' : '✗ No';
  $('phrase').textContent = absurdPhrase(a, b);
  haptic(ok ? HAPTIC.ok : HAPTIC.bad);
  announce(`${b.item} cuesta ${formatCLP(b.precio)}. ${ok ? 'Correcto' : 'Incorrecto'}. ${absurdPhrase(a, b)}`);
  renderProgress();

  if (mode === 'daily') {
    if (daily.status === 'done') {
      finishDaily();
      showNext('Ver resultado');
    } else if (ok) {
      setTimeout(advance, reducedMotion() ? 900 : 1500);
    } else {
      showNext('Siguiente');
    }
  } else if (inf) {
    if (ok) {
      inf.score++;
      if (inf.score > record) {
        record = inf.score;
        saveRecord(record);
      }
      renderProgress();
      setTimeout(advance, reducedMotion() ? 900 : 1500);
    } else {
      inf.over = true;
      showNext('Ver resultado');
    }
  }
}

function showNext(label: string) {
  const next = $('btn-next');
  next.innerHTML = `${label} <span aria-hidden="true">→</span>`;
  next.hidden = false;
  next.focus({ preventScroll: true });
  busy = false;
}

function advance() {
  busy = false;
  if (mode === 'infinite' && inf && !inf.over) {
    const nb = nextInfinite(pool, inf.b, inf.used);
    if (!nb) {
      inf.over = true;
    } else {
      inf.used.add(nb.id);
      inf = { ...inf, a: inf.b, b: nb };
    }
  }
  const wasKeyboard = document.activeElement?.matches(':focus-visible');
  render({ enter: true });
  if (currentPair()) {
    if (wasKeyboard) ($('side-a') as HTMLButtonElement).focus({ preventScroll: true });
  }
  else $('end').focus?.();
}

function finishDaily() {
  const score = daily.results.filter(Boolean).length;
  recordResult(CARO_STATS, today, { won: score >= DAILY_ROUNDS / 2, bucket: score, score });
  recordDailyPlayed('caro', dateForDay(CARO_EPOCH, today));
}

function startInfinite() {
  const rng = mulberry32(Math.floor(Math.random() * 2 ** 32));
  const a = pool[Math.floor(rng() * pool.length)];
  const used = new Set([a.id]);
  const b = nextInfinite(pool, a, used, rng);
  if (!b) {
    inf = null;
    return;
  }
  used.add(b.id);
  inf = { a, b, used, score: 0, over: false };
}

function setMode(m: Mode) {
  if (busy || m === mode) return;
  mode = m;
  if (mode === 'infinite' && (!inf || inf.over)) startInfinite();
  render({ enter: true });
}

async function doShare() {
  const text = buildCaroShare({ number: puzzleNumber(today), results: daily.results });
  const r = await shareResult(text);
  if (r === 'copied') toast('Copiado. Pégalo donde quieras.');
  else if (r === 'failed') toast('No se pudo copiar.');
}

function showStats() {
  const s = getStats(CARO_STATS, today);
  const avg = s.played ? (s.totalScore / s.played).toLocaleString('es-CL', { maximumFractionDigits: 1 }) : '0';
  const done = daily.status === 'done';
  renderStats($('stats-body'), {
    numbers: [
      [s.played, 'Jugadas'],
      [avg, 'Promedio'],
      [s.currentStreak, 'Racha (días)'],
      [record, 'Récord ∞'],
    ],
    dist: {
      title: 'Puntajes del diario',
      labels: s.dist.map((_, i) => String(i)),
      values: s.dist,
      highlight: done ? daily.results.filter(Boolean).length : null,
      aria: (n, l) => `${n} ${n === 1 ? 'día' : 'días'} con ${l} de ${DAILY_ROUNDS}`,
    },
    footer: done
      ? { countdown: true, share: true, countdownLabel: 'Próxima boleta en' }
      : { note: 'Termina el diario de hoy para compartir tu resultado.' },
  });
  $('stats-body').querySelector('[data-share]')?.addEventListener('click', doShare);
  tick();
  openDialog('dlg-stats');
}

// ---------- reloj (nunca recarga sola) ----------
const newDay = () => dayIndex(CARO_EPOCH) !== today;
const tick = startCountdown(
  () => (newDay() ? '00:00:00' : formatCountdown(msUntilNextDay())),
  newDay,
  () => {
    const el = $('new-day');
    if (el.hidden) {
      el.hidden = false;
      announce('Ya hay boleta nueva');
    }
  },
);

// ---------- eventos ----------
// Tocar A = "A es más caro" (B más barato); tocar B = "B es más caro"
$('side-a').addEventListener('click', () => answer('lower'));
$('side-b').addEventListener('click', () => answer('higher'));
$('btn-next').addEventListener('click', () => {
  $('btn-next').hidden = true;
  advance();
});
$('btn-help').addEventListener('click', () => openDialog('dlg-help'));
$('btn-stats').addEventListener('click', showStats);
$('btn-settings').addEventListener('click', () => openDialog('dlg-settings'));
$('dlg-help').addEventListener('close', () => {
  settings.seenHelp = true;
  saveCaroSettings(settings);
});
$('tab-daily').addEventListener('click', () => setMode('daily'));
$('tab-infinite').addEventListener('click', () => setMode('infinite'));
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
  // 1 / ↑ / ← = el primero (arriba o izquierda); 2 / ↓ / → = el segundo
  if (['1', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
    e.preventDefault();
    answer('lower');
  } else if (['2', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    answer('higher');
  } else if ((e.key === 'Enter' || e.key === ' ') && !$('btn-next').hidden && document.activeElement === document.body) {
    e.preventDefault();
    $('btn-next').click();
  }
});

/** Pie: crédito de cada foto (autor y licencia, con link a Commons). */
function renderCredits(data: CaroItemsFile) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const usedBy = new Map<string, string[]>();
  for (const it of data.items) if (it.imagen) usedBy.set(it.imagen, [...(usedBy.get(it.imagen) ?? []), it.item]);
  const rows = Object.entries(data.creditos ?? {})
    .map(([k, c]) => {
      const what = usedBy.get(k)?.[0] ?? k;
      return `<li>${esc(what)}: <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.autor)}</a>, ${esc(c.licencia)}</li>`;
    })
    .join('');
  $('credits-list').innerHTML = rows;
  $('creditos').hidden = !rows;
}

// ---------- arranque ----------
async function init() {
  try {
    const [itemsRes, schedRes] = await Promise.all([
      fetch('/caro/items.json', { cache: 'no-cache' }),
      fetch('/caro/schedule.json', { cache: 'no-cache' }).catch(() => null),
    ]);
    if (!itemsRes.ok) throw new Error(String(itemsRes.status));
    const data: CaroItemsFile = await itemsRes.json();
    const sched: ScheduleFile | null = schedRes && schedRes.ok ? await schedRes.json() : null;
    byId = new Map(data.items.map((i) => [i.id, i]));
    pool = pricedPool(data.items);
    $('data-version').textContent = `${data.items.length} precios verificados. Actualizado el ${fechaCorta(data.generado)}.`;
    renderCredits(data);

    const entry = sched ? entryForDay(sched, today, CARO_SALT) : null;
    const refs = entry?.map(decodeRef).filter((r) => byId.has(r.id)) ?? [];
    if (refs.length === DAILY_ROUNDS + 1) chain = refs;
    else {
      // Respaldo si el schedule no cubre hoy (no debería pasar: prebuild lo verifica)
      console.warn('[caro] El schedule no cubre hoy: usando respaldo determinístico.');
      chain = buildChain(pool, DAILY_ROUNDS + 1, mulberry32(hashString(`${CARO_SALT}:fallback:${today}`)));
    }
  } catch {
    $('name-a').textContent = 'No se pudieron cargar los precios. Revisa tu conexión y recarga.';
    return;
  }
  if (mode === 'infinite') startInfinite();
  render();
  if (!settings.seenHelp) openDialog('dlg-help');
}

init();
