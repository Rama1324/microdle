import type { Stats } from '../game/stats';
import { icons } from './icons';

export function setupDialogs() {
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) => {
    d.querySelector('.dlg-close')?.insertAdjacentHTML('afterbegin', icons.close);
    d.querySelector('.dlg-close')?.addEventListener('click', () => d.close());
    // clic en el fondo cierra
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    });
  });
}

export function openDialog(id: string) {
  const d = document.getElementById(id) as HTMLDialogElement | null;
  if (!d || d.open) return;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((o) => o.close());
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
}

export function renderStats(
  el: HTMLElement,
  s: Stats,
  opts: { highlight: number | null; finished: boolean },
) {
  const pct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  const max = Math.max(1, ...s.dist);
  const nums: [number | string, string][] = [
    [s.played, 'Jugadas'],
    [`${pct}%`, 'Victorias'],
    [s.currentStreak, 'Racha actual'],
    [s.maxStreak, 'Racha máxima'],
  ];
  el.innerHTML = `
    <div class="stat-nums">
      ${nums.map(([n, l]) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></div>`).join('')}
    </div>
    <h3 class="dlg-sub">Distribución de intentos</h3>
    <ol class="dist" aria-label="Distribución de intentos">
      ${s.dist
        .map((n, i) => {
          const w = Math.max(8, Math.round((n / max) * 100));
          const hl = opts.highlight === i ? ' is-today' : '';
          return `<li class="dist-row"><span class="dist-k">${i + 1}</span><span class="dist-bar${hl}" style="width:${w}%" aria-label="${n} ${n === 1 ? 'victoria' : 'victorias'} en ${i + 1} ${i ? 'intentos' : 'intento'}"><span>${n}</span></span></li>`;
        })
        .join('')}
    </ol>
    ${
      opts.finished
        ? `<div class="stat-foot">
        <div class="countdown-box"><span class="stat-l">Próxima micro en</span><span class="countdown" data-countdown>--:--:--</span></div>
        <button type="button" class="btn btn-primary" data-share>${icons.share}<span>Compartir</span></button>
      </div>`
        : `<p class="muted center">Termina la micro de hoy para compartir tu resultado.</p>`
    }
  `;
}
