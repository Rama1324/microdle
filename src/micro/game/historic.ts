import type { RouteData } from '../types';
import { entryForDay, type ScheduleFile } from '../../shared/schedule';
import { MICRO_SALT } from './daily';

/**
 * Recorridos del routes.json anterior que son respuesta de algún día congelado
 * del schedule y ya no vienen en el GTFS nuevo. Se devuelven tal cual estaban
 * (mismo shape), marcados historico: true y elegible: false.
 */
export function historicRoutes(
  prev: RouteData[],
  current: RouteData[],
  schedule: ScheduleFile,
  today: number,
): RouteData[] {
  const frozen = Math.min(Math.max(schedule.frozenThrough, today + 1), schedule.days.length - 1);
  const needed = new Set<string>();
  for (let d = 0; d <= frozen; d++) {
    for (const id of entryForDay(schedule, d, MICRO_SALT) ?? []) needed.add(id);
  }
  const have = new Set(current.map((r) => r.id));
  return prev
    .filter((r) => needed.has(r.id) && !have.has(r.id))
    .map((r) => ({ ...r, historico: true, elegible: false }));
}
