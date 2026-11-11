import type { Store } from './store';
import { arr, int, nullable, num, obj, optional } from './schema';

/** Esquema de las stats guardadas (compatible con el formato anterior de Microdle). */
export const STATS_SCHEMA = obj({
  played: int(0),
  wins: int(0),
  currentStreak: int(0),
  maxStreak: int(0),
  dist: arr(int(0)),
  lastWinDay: nullable(int()),
  lastRecordedDay: nullable(int()),
  totalScore: optional(num),
});

/**
 * Estadísticas diarias genéricas. La forma es compatible con la que Microdle
 * guardaba antes del refactor (microdle:stats), así no se pierde nada.
 */
export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** dist[i] = partidas en el "bucket" i (Microdle: ganó en i+1 intentos; Caro: puntaje i) */
  dist: number[];
  lastWinDay: number | null;
  /** Último día registrado: evita contar dos veces el mismo día */
  lastRecordedDay: number | null;
  /** Suma de puntajes (para promedios) */
  totalScore: number;
}

export interface StatsConfig {
  store: Store;
  key?: string;
  buckets: number;
  /** 'win': racha de días ganados seguidos (Microdle) · 'play': racha de días jugados (Caro) */
  streak: 'win' | 'play';
}

const empty = (buckets: number): Stats => ({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  dist: Array(buckets).fill(0),
  lastWinDay: null,
  lastRecordedDay: null,
  totalScore: 0,
});

export function getStats(cfg: StatsConfig, today: number): Stats {
  const s = { ...empty(cfg.buckets), ...cfg.store.loadValid<Partial<Stats>>(cfg.key ?? 'stats', STATS_SCHEMA, {}) };
  if (!Array.isArray(s.dist)) s.dist = Array(cfg.buckets).fill(0);
  while (s.dist.length < cfg.buckets) s.dist.push(0);
  // Racha visible: si se saltó un día, es 0 (el máximo se conserva)
  const last = cfg.streak === 'win' ? s.lastWinDay : s.lastRecordedDay;
  if (last == null || last < today - 1) s.currentStreak = 0;
  return s;
}

export function recordResult(
  cfg: StatsConfig,
  day: number,
  result: { won: boolean; bucket: number | null; score?: number },
): Stats {
  const s = getStats(cfg, day);
  if (s.lastRecordedDay === day) return s;
  const prevDay = s.lastRecordedDay;
  s.played++;
  if (result.score != null) s.totalScore += result.score;
  if (result.bucket != null && result.bucket >= 0 && result.bucket < s.dist.length) s.dist[result.bucket]++;
  if (result.won) {
    s.wins++;
  }
  if (cfg.streak === 'win') {
    if (result.won) {
      s.currentStreak = s.lastWinDay === day - 1 ? s.currentStreak + 1 : 1;
      s.lastWinDay = day;
    } else s.currentStreak = 0;
  } else {
    s.currentStreak = prevDay === day - 1 ? s.currentStreak + 1 : 1;
    if (result.won) s.lastWinDay = day;
  }
  s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
  s.lastRecordedDay = day;
  cfg.store.save(cfg.key ?? 'stats', s);
  return s;
}
