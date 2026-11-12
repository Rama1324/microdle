/**
 * Vibración breve en móviles que la soportan (Android; iOS no tiene la API y no
 * pasa nada). No vibra con prefers-reduced-motion ni si el jugador la apagó.
 */
import { readRaw, writeRaw } from '../store';

const KEY = 'hub:haptics';

export const HAPTIC = {
  tap: 10,
  ok: [20, 40, 20],
  bad: 60,
} as const;

export function hapticsEnabled(): boolean {
  return readRaw(KEY) !== 'off';
}

export function setHapticsEnabled(on: boolean) {
  writeRaw(KEY, on ? 'on' : 'off');
}

export function haptic(pattern: number | readonly number[]) {
  try {
    if (!hapticsEnabled()) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    /* sin vibración */
  }
}

/** Respeta prefers-reduced-motion en animaciones manejadas por JS. */
export const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
