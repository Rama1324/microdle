import { MAX_GUESSES } from '../types';
import { load, save } from './storage';

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** dist[i] = victorias en i+1 intentos */
  dist: number[];
  /** Último día (índice) con victoria */
  lastWinDay: number | null;
  /** Último día registrado, para no contar dos veces */
  lastRecordedDay: number | null;
}

const KEY = 'stats';

const empty = (): Stats => ({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  dist: Array(MAX_GUESSES).fill(0),
  lastWinDay: null,
  lastRecordedDay: null,
});

export function getStats(today: number): Stats {
  const s = { ...empty(), ...load<Partial<Stats>>(KEY, {}) };
  if (!Array.isArray(s.dist) || s.dist.length !== MAX_GUESSES) s.dist = Array(MAX_GUESSES).fill(0);
  // Si se saltó un día, la racha visible es 0 (sin modificar el máximo).
  if (s.lastWinDay == null || s.lastWinDay < today - 1) s.currentStreak = 0;
  return s;
}

export function recordResult(day: number, won: boolean, guesses: number): Stats {
  const s = getStats(day);
  if (s.lastRecordedDay === day) return s;
  s.played++;
  if (won) {
    s.wins++;
    s.dist[guesses - 1]++;
    s.currentStreak = s.lastWinDay === day - 1 ? s.currentStreak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
    s.lastWinDay = day;
  } else {
    s.currentStreak = 0;
  }
  s.lastRecordedDay = day;
  save(KEY, s);
  return s;
}
