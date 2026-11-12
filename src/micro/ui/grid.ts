import type { Feedback, Level3 } from '../types';
import { MAX_GUESSES } from '../types';
import { formatKm, overlapLevel } from '../game/feedback';

type CellState = Level3 | 'neutral';

interface Cell {
  main: string;
  sub?: string;
  state: CellState;
  label: string;
}

/** Símbolo además del color (accesibilidad para daltónicos). */
const MARK: Record<CellState, string> = { all: '✓', some: '≈', none: '✗', neutral: '' };

export const COLUMNS = ['Micro', 'Traza', 'Distancia', 'Comunas', 'Zona'];

/** Duración del flip por celda y desfase entre celdas (ms). Deben calzar con --flip-ms y --flip-stagger de tokens.css. */
export const FLIP_MS = 450;
export const FLIP_STAGGER = 180;
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Espera hasta que termina de voltearse la fila. Con movimiento reducido no hay espera. */
export const rowRevealMs = () => (reduced() ? 0 : FLIP_STAGGER * (COLUMNS.length - 1) + FLIP_MS);

function cellsFor(f: Feedback): Cell[] {
  const ov = f.correct ? 'all' : overlapLevel(f.overlap);
  const distState: CellState = f.correct ? 'all' : f.distKm <= 5 ? 'some' : 'none';
  const zonaState: CellState = f.sameZona ? 'all' : 'none';
  const comunasTxt = { all: 'todas en común', some: 'algunas en común', none: 'ninguna en común' }[f.comunas];
  return [
    {
      main: f.id,
      state: f.correct ? 'all' : 'neutral',
      label: `Micro ${f.id}${f.correct ? ', correcta' : ''}`,
    },
    { main: `${f.overlap}%`, state: ov, label: `Superposición del trazado ${f.overlap} por ciento` },
    {
      main: f.correct ? '◎' : f.arrow,
      sub: f.correct ? '0km' : formatKm(f.distKm),
      state: distState,
      label: f.correct
        ? 'Distancia 0 kilómetros'
        : `Distancia ${formatKm(f.distKm).replace('km', ' kilómetros')} hacia el ${f.arrowLabel}`,
    },
    {
      main: String(f.comunasShared),
      state: f.comunas,
      label: `Comunas: ${f.comunasShared} ${f.comunasShared === 1 ? 'comuna' : 'comunas'}, ${comunasTxt}`,
    },
    { main: f.sameZona ? 'Sí' : 'No', state: zonaState, label: f.sameZona ? 'Misma zona' : 'Distinta zona' },
  ];
}

export function renderGrid(root: HTMLElement, feedback: Feedback[], animateIndex: number | null) {
  root.innerHTML = '';
  root.setAttribute('role', 'table');
  root.setAttribute('aria-label', 'Intentos');

  const head = document.createElement('div');
  head.className = 'grid-row grid-head';
  head.setAttribute('role', 'row');
  for (const c of COLUMNS) {
    const h = document.createElement('div');
    h.className = 'grid-label';
    h.setAttribute('role', 'columnheader');
    h.textContent = c;
    head.appendChild(h);
  }
  root.appendChild(head);

  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.setAttribute('role', 'row');
    const f = feedback[r];
    if (!f) {
      if (r === feedback.length) row.classList.add('is-next');
      row.setAttribute('aria-label', `Intento ${r + 1}, vacío`);
      for (let c = 0; c < COLUMNS.length; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell empty';
        cell.setAttribute('role', 'cell');
        cell.setAttribute('aria-hidden', 'true');
        row.appendChild(cell);
      }
    } else {
      const animate = r === animateIndex;
      cellsFor(f).forEach((c, i) => {
        const cell = document.createElement('div');
        cell.className = `cell s-${c.state}${animate ? ' flip' : ''}`;
        cell.style.setProperty('--i', String(i));
        cell.setAttribute('role', 'cell');
        cell.setAttribute('aria-label', c.label);
        cell.innerHTML =
          `<span class="cell-main" aria-hidden="true">${c.main}</span>` +
          (c.sub ? `<span class="cell-sub" aria-hidden="true">${c.sub}</span>` : '') +
          (MARK[c.state] ? `<span class="cell-mark" aria-hidden="true">${MARK[c.state]}</span>` : '');
        row.appendChild(cell);
      });
    }
    root.appendChild(row);
  }
}

/** Resumen hablado para lectores de pantalla. */
export function announceText(f: Feedback): string {
  if (f.correct) return `¡Correcto! Era la ${f.id}.`;
  return cellsFor(f)
    .map((c) => c.label)
    .join('. ');
}
