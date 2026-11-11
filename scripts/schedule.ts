/**
 * Genera/extiende el schedule append-only de cada juego. El resultado se COMMITEA.
 *
 *   npm run schedule                 # todos los juegos
 *   npm run schedule -- --game micro
 *
 * Días pasados, hoy y mañana quedan congelados: se copian del schedule anterior.
 * Solo se recalculan los días futuros (por eso agregar o quitar ítems nunca cambia
 * un puzzle ya publicado).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { extendSchedule, type ScheduleFile } from '../src/shared/schedule';
import { santiagoISO } from '../src/shared/time';
import { MICRO_EPOCH, MICRO_SALT, answerPool, generateMicroDay, microDayIndex } from '../src/micro/game/daily';
import { legacyAnswerForDay, MICRO_LEGACY_UNTIL } from '../src/micro/game/legacy';
import type { RoutesFile } from '../src/micro/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function readJSON<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

function write(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 0).replace(/","/g, '",\n"') + '\n');
}

function scheduleMicro() {
  const routesPath = resolve('public/micro/routes.json');
  const outPath = resolve('public/micro/schedule.json');
  const data = readJSON<RoutesFile>(routesPath);
  if (!data) throw new Error(`No existe ${routesPath}. Corre "npm run data" primero.`);
  const prev = readJSON<ScheduleFile>(outPath);
  const pool = answerPool(data.routes);
  const today = Number(arg('today') ?? microDayIndex());

  const res = extendSchedule({
    prev,
    game: 'micro',
    epoch: MICRO_EPOCH,
    salt: MICRO_SALT,
    today,
    bootstrap: (d) => (d <= MICRO_LEGACY_UNTIL ? [legacyAnswerForDay(data.routes, d)] : null),
    generate: generateMicroDay(pool),
    generatedOn: santiagoISO(),
  });
  write(outPath, res.file);
  console.log(
    `micro: ${res.file.days.length} días (hasta el ${res.file.days.length - 1}), congelados 0..${res.file.frozenThrough}` +
      ` · ${res.kept} copiados sin cambios · ${res.newlyFrozen} congelados nuevos · pool ${pool.length}`,
  );
}

const game = arg('game') ?? 'all';
if (game === 'micro' || game === 'all') scheduleMicro();
