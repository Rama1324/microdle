import type { Feedback, LatLng, Level3, RouteData } from '../types';
import { arrowFor, bearing, haversineKm, overlapRatio } from './geo';
import { decodePolyline } from './polyline';

const cache = new Map<string, LatLng[]>();

export function routePoints(r: RouteData): LatLng[] {
  let pts = cache.get(r.id);
  if (!pts) {
    pts = decodePolyline(r.shape);
    cache.set(r.id, pts);
  }
  return pts;
}

/** Umbrales de color para la superposición. */
export const OVERLAP_GREEN = 70;
export const OVERLAP_YELLOW = 30;

export function overlapLevel(pct: number): Level3 {
  return pct >= OVERLAP_GREEN ? 'all' : pct >= OVERLAP_YELLOW ? 'some' : 'none';
}

export function computeFeedback(guess: RouteData, answer: RouteData): Feedback {
  const correct = guess.id === answer.id;
  const overlap = correct ? 100 : Math.round(overlapRatio(routePoints(guess), routePoints(answer)) * 100);
  const distKm = correct ? 0 : haversineKm(guess.centroide, answer.centroide);
  const { arrow, label } =
    correct || distKm < 0.05
      ? { arrow: '◎', label: 'mismo centro' }
      : arrowFor(bearing(guess.centroide, answer.centroide));

  const ans = new Set(answer.comunas);
  const shared = guess.comunas.filter((c) => ans.has(c)).length;
  const sameSet = shared === ans.size && guess.comunas.length === ans.size;
  const comunas: Level3 = sameSet ? 'all' : shared > 0 ? 'some' : 'none';

  return {
    id: guess.id,
    correct,
    overlap: correct ? 100 : Math.min(overlap, 99),
    distKm,
    arrow,
    arrowLabel: label,
    comunasShared: shared,
    comunas,
    sameZona: guess.zona === answer.zona,
  };
}

export function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

export function zonaLabel(zona: string): string {
  return /^[A-Z]$/.test(zona) ? `Zona ${zona}` : `Troncal ${zona}00`;
}

const VARIANTES: Record<string, string> = {
  c: 'corto',
  e: 'expreso',
  n: 'nocturno',
  v: 'variante',
};

/** "506e" → "expreso"; "506" → "" */
export function varianteDe(id: string): string {
  const m = id.match(/\d([a-z])$/i);
  return m ? (VARIANTES[m[1].toLowerCase()] ?? 'variante') : '';
}
