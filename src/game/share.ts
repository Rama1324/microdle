import type { Feedback, Level3, Mode } from '../types';
import { MAX_GUESSES } from '../types';
import { formatKm, overlapLevel } from './feedback';

const SITE = 'microdle.cl';

const OVERLAP_SQ: Record<Level3, string> = { all: '🟩', some: '🟨', none: '🟥' };
const COMUNA_SQ: Record<Level3, string> = { all: '🟩', some: '🟨', none: '⬛' };

/** Texto sin spoilers: solo colores, distancias y flechas. */
export function buildShareText(opts: {
  mode: Mode;
  number: number;
  feedback: Feedback[];
  won: boolean;
}): string {
  const { mode, number, feedback, won } = opts;
  const score = won ? `${feedback.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const title = mode === 'daily' ? `Microdle #${number} ${score} 🚌` : `Microdle (práctica) ${score} 🚌`;
  const rows = feedback.map((f) => {
    if (f.correct) return '🟩🟩🟩 🎉';
    const sq =
      OVERLAP_SQ[overlapLevel(f.overlap)] + COMUNA_SQ[f.comunas] + (f.sameZona ? '🟩' : '⬛');
    return `${sq} ${formatKm(f.distKm)} ${f.arrow}`;
  });
  return [title, ...rows, SITE].join('\n');
}

const isMobile = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Web Share API en móvil, portapapeles en desktop. Devuelve qué se hizo. */
export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (isMobile() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
      // si falla, caemos al portapapeles
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // Fallback antiguo
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
}
