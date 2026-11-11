import type { LatLng } from '../types';

const R = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthKm(pts: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversineKm(pts[i - 1], pts[i]);
  return s;
}

/** Centroide ponderado por largo de tramo (no se sesga por densidad de vértices). */
export function lineCentroid(pts: LatLng[]): LatLng {
  if (pts.length === 1) return pts[0];
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 1; i < pts.length; i++) {
    const w = haversineKm(pts[i - 1], pts[i]);
    sx += ((pts[i - 1][0] + pts[i][0]) / 2) * w;
    sy += ((pts[i - 1][1] + pts[i][1]) / 2) * w;
    sw += w;
  }
  return sw ? [sx / sw, sy / sw] : pts[0];
}

/** Rumbo inicial en grados (0 = norte, sentido horario). */
export function bearing(a: LatLng, b: LatLng): number {
  const p1 = toRad(a[0]);
  const p2 = toRad(b[0]);
  const dl = toRad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const ARROW_NAMES = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

export function arrowFor(deg: number): { arrow: string; label: string } {
  const i = Math.round(deg / 45) % 8;
  return { arrow: ARROWS[i], label: ARROW_NAMES[i] };
}

type XY = [number, number];

/** Proyección equirectangular local en metros, suficiente a escala de ciudad. */
function projector(lat0: number, lng0: number) {
  const kx = 111320 * Math.cos(toRad(lat0));
  const ky = 110540;
  return (p: LatLng): XY => [(p[1] - lng0) * kx, (p[0] - lat0) * ky];
}

/** Puntos cada `step` metros a lo largo de la línea (en XY). */
function resample(line: XY[], step: number): XY[] {
  const out: XY[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg === 0) continue;
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      d += step;
    }
    carry = seg - (d - step);
  }
  return out;
}

function distToSeg2(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = a[0] + t * dx - p[0];
  const ey = a[1] + t * dy - p[1];
  return ex * ex + ey * ey;
}

function countNear(samples: XY[], line: XY[], tol: number): number {
  const tol2 = tol * tol;
  const segs: { a: XY; b: XY; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    segs.push({
      a,
      b,
      x0: Math.min(a[0], b[0]) - tol,
      x1: Math.max(a[0], b[0]) + tol,
      y0: Math.min(a[1], b[1]) - tol,
      y1: Math.max(a[1], b[1]) + tol,
    });
  }
  let hit = 0;
  for (const p of samples) {
    for (const s of segs) {
      if (p[0] < s.x0 || p[0] > s.x1 || p[1] < s.y0 || p[1] > s.y1) continue;
      if (distToSeg2(p, s.a, s.b) <= tol2) {
        hit++;
        break;
      }
    }
  }
  return hit;
}

/**
 * Superposición simétrica entre dos trazados (0–1):
 * (largo de A cerca de B + largo de B cerca de A) / (largo A + largo B).
 * Solo vale 1 si ambos recorridos calzan en toda su extensión.
 */
export function overlapRatio(a: LatLng[], b: LatLng[], tolMeters = 120, stepMeters = 50): number {
  if (a.length < 2 || b.length < 2) return 0;
  const proj = projector(a[0][0], a[0][1]);
  const A = a.map(proj);
  const B = b.map(proj);
  const sa = resample(A, stepMeters);
  const sb = resample(B, stepMeters);
  const hits = countNear(sa, B, tolMeters) + countNear(sb, A, tolMeters);
  return hits / (sa.length + sb.length);
}
