import { icons } from './icons';

export function setupDialogs() {
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) => {
    const close = d.querySelector('.dlg-close');
    if (close && !close.querySelector('svg')) close.insertAdjacentHTML('afterbegin', icons.close);
    close?.addEventListener('click', () => d.close());
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
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

export interface StatsView {
  numbers: [value: number | string, label: string][];
  dist?: {
    title: string;
    /** Etiqueta de cada barra ("1".."6", "0".."10") */
    labels: string[];
    values: number[];
    highlight: number | null;
    /** Texto accesible de una barra */
    aria: (value: number, label: string) => string;
  };
  /** Bloque final: cuenta regresiva + compartir, o una nota */
  footer: { countdown: boolean; share: boolean; countdownLabel?: string } | { note: string };
  extra?: string;
}

/** Contenido del diálogo de estadísticas (común a todos los juegos). */
export function renderStats(el: HTMLElement, v: StatsView) {
  const d = v.dist;
  const max = d ? Math.max(1, ...d.values) : 1;
  el.innerHTML = `
    <div class="stat-nums" style="grid-template-columns:repeat(${v.numbers.length},minmax(0,1fr))">
      ${v.numbers.map(([n, l]) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></div>`).join('')}
    </div>
    ${v.extra ?? ''}
    ${
      d
        ? `<h3 class="dlg-sub">${d.title}</h3>
    <ol class="dist" aria-label="${d.title}">
      ${d.values
        .map((n, i) => {
          const w = Math.max(8, Math.round((n / max) * 100));
          const hl = d.highlight === i ? ' is-today' : '';
          return `<li class="dist-row"><span class="dist-k">${d.labels[i]}</span><span class="dist-bar${hl}" style="width:${w}%" aria-label="${d.aria(n, d.labels[i])}"><span>${n}</span></span></li>`;
        })
        .join('')}
    </ol>`
        : ''
    }
    ${
      'note' in v.footer
        ? `<p class="muted center">${v.footer.note}</p>`
        : `<div class="stat-foot">
        ${v.footer.countdown ? `<div class="countdown-box"><span class="stat-l">${v.footer.countdownLabel ?? 'Próximo juego en'}</span><span class="countdown" data-countdown>--:--:--</span></div>` : ''}
        ${v.footer.share ? `<button type="button" class="btn btn-primary" data-share>${icons.share}<span>Compartir</span></button>` : ''}
      </div>`
    }
  `;
}
