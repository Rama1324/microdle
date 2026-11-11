import { daysBetween, santiagoISO } from './time';
import { readJSON, writeJSON } from './store';
import type { GameId } from './config';

/**
 * Racha global del hub: días (calendario de Santiago) en que se terminó
 * al menos un juego diario, de cualquier juego.
 */
const KEY = 'hub:activity';

interface Activity {
  /** "YYYY-MM-DD" → juegos terminados ese día */
  days: Record<string, GameId[]>;
}

function load(): Activity {
  const a = readJSON<Activity>(KEY, { days: {} });
  return a && typeof a.days === 'object' ? a : { days: {} };
}

export function recordDailyPlayed(game: GameId, now = new Date()) {
  const a = load();
  const today = santiagoISO(now);
  const list = a.days[today] ?? [];
  if (!list.includes(game)) list.push(game);
  a.days[today] = list;
  // Guardamos como máximo ~2 años
  const keys = Object.keys(a.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 800))) delete a.days[k];
  writeJSON(KEY, a);
}

export function playedToday(game: GameId, now = new Date()): boolean {
  return (load().days[santiagoISO(now)] ?? []).includes(game);
}

/** Racha de días seguidos con actividad, contando hasta hoy (o hasta ayer si hoy aún no juega). */
export function globalStreak(now = new Date()): number {
  const a = load();
  const today = santiagoISO(now);
  const played = new Set(Object.keys(a.days).filter((k) => a.days[k]?.length));
  let streak = 0;
  // Si hoy no jugó todavía, la racha sigue viva desde ayer
  let offset = played.has(today) ? 0 : 1;
  const base = new Date(`${today}T12:00:00Z`).getTime();
  for (;;) {
    const d = new Date(base - offset * 86_400_000).toISOString().slice(0, 10);
    if (!played.has(d)) break;
    streak++;
    offset++;
    if (daysBetween(d, today) > 1000) break;
  }
  return streak;
}
