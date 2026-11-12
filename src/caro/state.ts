/**
 * Estado persistido de "¿Qué sale más caro?" (namespace caro:), validado con esquemas.
 */
import { createStore } from '../shared/store';
import type { StatsConfig } from '../shared/stats';
import { arr, bool, int, obj, oneOf, optional } from '../shared/schema';
import { DAILY_ROUNDS } from './types';

export const caroStore = createStore('caro');

/** Diario: distribución de puntajes 0..10, racha de días jugados. */
export const CARO_STATS: StatsConfig = { store: caroStore, buckets: DAILY_ROUNDS + 1, streak: 'play' };

export interface CaroDaily {
  day: number;
  /** Resultado de cada comparación jugada (true = acierto) */
  results: boolean[];
  status: 'playing' | 'done';
}

export interface CaroSettings {
  seenHelp: boolean;
}

const DAILY_SCHEMA = obj({ day: int(), results: arr(bool), status: oneOf('playing', 'done') });
const RECORD_SCHEMA = obj({ record: int(0) });
const SETTINGS_SCHEMA = obj({ seenHelp: optional(bool) });

export function loadCaroDaily(day: number): CaroDaily {
  const d = caroStore.loadValid<CaroDaily | null>('daily', DAILY_SCHEMA, null);
  if (d && d.day === day && d.results.length <= DAILY_ROUNDS) return d;
  return { day, results: [], status: 'playing' };
}

export function saveCaroDaily(d: CaroDaily) {
  caroStore.save('daily', d);
}

export function loadRecord(): number {
  return caroStore.loadValid<{ record: number }>('infinite', RECORD_SCHEMA, { record: 0 }).record;
}

export function saveRecord(record: number) {
  caroStore.save('infinite', { record });
}

export function loadCaroSettings(): CaroSettings {
  return { seenHelp: !!caroStore.loadValid<Partial<CaroSettings>>('settings', SETTINGS_SCHEMA, {}).seenHelp };
}

export function saveCaroSettings(s: CaroSettings) {
  caroStore.save('settings', s);
}
