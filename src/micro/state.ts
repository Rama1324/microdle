/**
 * Estado persistido de Microdle (sin DOM, para poder testearlo).
 * Usa el namespace "microdle:" de siempre: las keys no cambiaron con el refactor,
 * salvo el tema, que pasó a hub:theme (ver shared/theme.ts, con migración).
 */
import type { GameStatus } from './types';
import { MAX_GUESSES } from './types';
import { createStore } from '../shared/store';
import type { StatsConfig } from '../shared/stats';
import { arr, bool, int, obj, oneOf, optional, str } from '../shared/schema';

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

const STATUS = oneOf('playing', 'won', 'lost');

export const SETTINGS_SCHEMA = obj({
  seenHelp: optional(bool),
  showGuesses: optional(bool),
  // formato viejo: el tema vivía acá (ahora en hub:theme)
  theme: optional(oneOf('auto', 'light', 'dark')),
});
export const DAILY_SCHEMA = obj({ day: int(), guesses: arr(str), status: STATUS });
export const PRACTICE_SCHEMA = obj({ a: str, guesses: arr(str), status: STATUS });

export function loadSettings(): MicroSettings {
  const s = microStore.loadValid<Partial<MicroSettings>>('settings', SETTINGS_SCHEMA, {});
  return { seenHelp: !!s.seenHelp, showGuesses: s.showGuesses ?? true };
}

export function loadPractice(): PracticeSave | null {
  return microStore.loadValid<PracticeSave | null>('practice', PRACTICE_SCHEMA, null);
}

export function saveSettings(s: MicroSettings) {
  // Conservamos campos que existan (p. ej. el theme viejo) para no romper versiones cacheadas
  const prev = microStore.loadValid<Record<string, unknown>>('settings', SETTINGS_SCHEMA, {});
  microStore.save('settings', { ...prev, ...s });
}

/** Partida diaria guardada (cualquier día), validada. */
export function loadSavedDaily(): DailySave | null {
  return microStore.loadValid<DailySave | null>('daily', DAILY_SCHEMA, null);
}

/** Partida del día `today`; si la guardada es de otro día, empieza una nueva. */
export function loadDaily(today: number): DailySave {
  const d = loadSavedDaily();
  return d && d.day === today ? d : { day: today, guesses: [], status: 'playing' };
}
