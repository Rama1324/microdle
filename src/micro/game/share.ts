import type { Feedback, Level3, Mode } from '../types';
import { MAX_GUESSES } from '../types';
import { formatKm, overlapLevel } from './feedback';
import { shareUrl } from '../../shared/share';
import { GAMES } from '../../shared/config';

const OVERLAP_SQ: Record<Level3, string> = { all: '🟩', some: '🟨', none: '🟥' };
const COMUNA_SQ: Record<Level3, string> = { all: '🟩', some: '🟨', none: '⬛' };

/** Texto sin spoilers: solo colores, distancias y flechas. */
export function buildShareText(opts: { mode: Mode; number: number; feedback: Feedback[]; won: boolean }): string {
  const { mode, number, feedback, won } = opts;
  const score = won ? `${feedback.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const title = mode === 'daily' ? `Microdle #${number} ${score} 🚌` : `Microdle (práctica) ${score} 🚌`;
  const rows = feedback.map((f) => {
    if (f.correct) return '🟩🟩🟩 🎉';
    const sq = OVERLAP_SQ[overlapLevel(f.overlap)] + COMUNA_SQ[f.comunas] + (f.sameZona ? '🟩' : '⬛');
    return `${sq} ${formatKm(f.distKm)} ${f.arrow}`;
  });
  return [title, ...rows, shareUrl(GAMES.micro.path)].join('\n');
}
