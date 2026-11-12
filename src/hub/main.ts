import '../shared/base.css';
import './hub.css';
import { GAMES } from '../shared/config';
import { globalStreak } from '../shared/activity';
import { getThemeSetting, initTheme, setThemeSetting, type ThemeSetting } from '../shared/theme';
import { dayIndex, puzzleNumber, santiagoISO } from '../shared/time';
import { icons } from '../shared/ui/icons';
import { loadDaily } from '../micro/state';
import { loadCaroDaily } from '../caro/state';
import { DAILY_ROUNDS } from '../caro/types';

const $ = (id: string) => document.getElementById(id)!;

// ---------- tema: botón que rota auto → claro → oscuro ----------
const NEXT: Record<ThemeSetting, ThemeSetting> = { auto: 'light', light: 'dark', dark: 'auto' };
const LABEL: Record<ThemeSetting, string> = { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema oscuro' };
function paintThemeBtn() {
  const t = getThemeSetting();
  const b = $('btn-theme');
  b.innerHTML = icons[t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon'];
  b.setAttribute('aria-label', `${LABEL[t]}. Cambiar tema`);
  b.title = LABEL[t];
}
initTheme();
paintThemeBtn();
$('btn-theme').addEventListener('click', () => {
  setThemeSetting(NEXT[getThemeSetting()]);
  paintThemeBtn();
});

// ---------- franja: fecha y racha ----------
const fecha = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  .format(new Date(`${santiagoISO()}T12:00:00Z`))
  .replace(/\./g, '')
  .toUpperCase();
$('today').textContent = fecha;
const streak = globalStreak();
$('hub-streak').textContent = streak > 0 ? `${streak} ${streak === 1 ? 'día seguido' : 'días seguidos'}` : 'Empieza tu racha hoy';

// ---------- tarjetas ----------
/** Estado del día; si algo falla al leer, la tarjeta igual se muestra (sin estado). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn('[la-once] No se pudo leer el estado de un juego', e);
    return fallback;
  }
}

function microCard(): string {
  const g = GAMES.micro;
  const day = dayIndex(g.epoch);
  const n = puzzleNumber(day);
  const d = safe(() => loadDaily(day), null);
  let status = `#${n} · por jugar`;
  if (d?.status === 'won') status = `✓ #${n} · resuelto en ${d.guesses.length}/6`;
  else if (d?.status === 'lost') status = `✓ #${n} · jugado`;
  else if (d?.guesses.length) status = `#${n} · en curso ${d.guesses.length}/6`;
  return `
    <li class="card card-micro">
      <a class="card-link" href="${g.path}/">
        <span class="plate" aria-hidden="true"><span class="plate-n">#${n}</span><span class="plate-k">MICRO</span></span>
        <span class="card-body">
          <span class="card-title">${g.title}</span>
          <span class="card-tag">¿Qué micro hace este recorrido?</span>
          <span class="card-status label">${status}</span>
        </span>
      </a>
    </li>`;
}

function caroCard(): string {
  const g = GAMES.caro;
  const day = dayIndex(g.epoch);
  const n = puzzleNumber(day);
  const d = safe(() => loadCaroDaily(day), null);
  const score = d ? d.results.filter(Boolean).length : 0;
  const done = d?.status === 'done';
  const playing = !done && (d?.results.length ?? 0) > 0;
  const status = done ? `✓ #${n} · ${score}/${DAILY_ROUNDS}` : playing ? `#${n} · en curso ${d!.results.length}/${DAILY_ROUNDS}` : `#${n} · por jugar`;
  return `
    <li class="card card-caro">
      <a class="card-link receipt" href="${g.path}/">
        <span class="receipt-top label"><span>${g.title}</span><span>N° ${String(n).padStart(4, '0')}</span></span>
        <span class="receipt-row"><span>Más caro</span><span>↑</span></span>
        <span class="receipt-row"><span>Más barato</span><span>↓</span></span>
        <span class="receipt-total"><span class="card-status label">${status}</span><span class="receipt-amt">$ ???</span></span>
      </a>
    </li>`;
}

$('hub-cards').innerHTML = microCard() + caroCard();
