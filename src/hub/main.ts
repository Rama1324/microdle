import '../shared/base.css';
import './hub.css';
import { GAMES, type GameId } from '../shared/config';
import { globalStreak, playedToday } from '../shared/activity';
import { getThemeSetting, initTheme, setThemeSetting, type ThemeSetting } from '../shared/theme';
import { dayIndex, puzzleNumber } from '../shared/time';
import { icons, logoSvg } from '../shared/ui/icons';
import { loadDaily } from '../micro/state';

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

// ---------- racha global ----------
const streak = globalStreak();
$('hub-streak').innerHTML =
  streak > 0
    ? `<span class="hub-streak-n">🔥 ${streak}</span> ${streak === 1 ? 'día seguido' : 'días seguidos'} jugando`
    : 'Juega cualquier diario para empezar tu racha';

// ---------- tarjetas ----------
/** Juegos ya publicados (los demás se muestran como "Próximamente") */
const LIVE: GameId[] = ['micro'];

function statusFor(id: GameId): string {
  if (!LIVE.includes(id)) return '<span class="card-status soon">Próximamente</span>';
  const g = GAMES[id];
  const n = puzzleNumber(dayIndex(g.epoch));
  if (id === 'micro') {
    const d = loadDaily(dayIndex(g.epoch));
    if (d.status === 'won') return `<span class="card-status done">✓ #${n} resuelto en ${d.guesses.length}/6</span>`;
    if (d.status === 'lost') return `<span class="card-status done">✓ #${n} jugado</span>`;
    if (d.guesses.length) return `<span class="card-status">#${n} en curso · ${d.guesses.length}/6</span>`;
  }
  if (playedToday(id)) return `<span class="card-status done">✓ #${n} jugado</span>`;
  return `<span class="card-status todo">#${n} disponible</span>`;
}

$('hub-cards').innerHTML = (Object.keys(GAMES) as GameId[])
  .map((id) => {
    const g = GAMES[id];
    const live = LIVE.includes(id);
    const inner = `
      <span class="card-icon" aria-hidden="true">${id === 'micro' ? logoSvg(44) : '💸'}</span>
      <span class="card-body">
        <span class="card-title">${g.title}</span>
        <span class="card-tag">${g.tagline}</span>
        ${statusFor(id)}
      </span>`;
    return `<li class="card" style="--card-accent:${g.accent}">${
      live ? `<a class="card-link" href="${g.path}/">${inner}</a>` : `<div class="card-link is-disabled" aria-disabled="true">${inner}</div>`
    }</li>`;
  })
  .join('');
