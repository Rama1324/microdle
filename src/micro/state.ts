/**
 * Estado persistido de Microdle (sin DOM, para poder testearlo).
 * Usa el namespace "microdle:" de siempre: las keys no cambiaron con el refactor,
 * salvo el tema, que pasó a hub:theme (ver shared/theme.ts, con migración).
 */
import type { GameStatus } from './types';
import { MAX_GUESSES } from './types';
import { createStore } from '../shared/store';
import type { StatsConfig } from '../shared/stats';

export const microStore = createStore('microdle');

export const MICRO_STATS: StatsConfig = { store: microStore, buckets: MAX_GUESSES, streak: 'win' };

export interface MicroSettings {
  seenHelp: boolean;
  showGuesses: boolean;
}

export interface DailySave {
  day: number;
  guesses: string[];
  status: GameStatus;
}

export interface PracticeSave {
  /** id de la respuesta, ofuscado */
  a: string;
  guesses: string[];
  status: GameStatus;
}

export function loadSettings(): MicroSettings {
  // microdle:settings puede traer además "theme" (formato viejo): se ignora acá
  const s = microStore.load<Partial<MicroSettings>>('settings', {});
  return { seenHelp: !!s.seenHelp, showGuesses: s.showGuesses ?? true };
}

export function saveSettings(s: MicroSettings) {
  // Conservamos campos que existan (p. ej. el theme viejo) para no romper versiones cacheadas
  const prev = microStore.load<Record<string, unknown>>('settings', {});
  microStore.save('settings', { ...prev, ...s });
}

export function loadDaily(today: number): DailySave {
  const d = microStore.load<DailySave | null>('daily', null);
  return d && d.day === today ? d : { day: today, guesses: [], status: 'playing' };
}
