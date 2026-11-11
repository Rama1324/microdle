import { daysBetween, santiagoISO } from './time';
import { readValid, writeJSON } from './store';
import { GAMES, type GameId } from './config';
import { arr, obj, oneOf, record } from './schema';

/**
 * Racha global del hub: días (calendario de Santiago) en que se terminó
 * al menos un juego diario, de cualquier juego.
 */
const KEY = 'hub:activity';

interface Activity {
  /** "YYYY-MM-DD" → juegos terminados ese día */
  days: Record<string, GameId[]>;
}

const ACTIVITY_SCHEMA = obj({
  days: record(arr(oneOf(...Object.keys(GAMES))), (k) => /^\d{4}-\d{2}-\d{2}$/.test(k)),
});

function load(): Activity {
  return readValid<Activity>(KEY, ACTIVITY_SCHEMA, { days: {} });
}

/**
 * Registra que se terminó el diario de `game` correspondiente a la fecha `puzzleDate`
 * (la del puzzle, no la del momento de terminar: una partida empezada a las 23:59
 * y terminada a las 00:01 cuenta para el día en que empezó).
 */
export function recordDailyPlayed(game: GameId, puzzleDate: string = santiagoISO()) {
  const a = load();
  const today = puzzleDate;
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
