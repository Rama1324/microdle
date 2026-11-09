import type { LatLng } from '../types';

/** Codifica [lat,lng][] con el algoritmo de polilíneas de Google (precisión 5). */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * f);
    const iLng = Math.round(lng * f);
    out += encodeValue(iLat - pLat) + encodeValue(iLng - pLng);
    pLat = iLat;
    pLng = iLng;
  }
  return out;
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (n >= 0x20) {
    s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return s + String.fromCharCode(n + 63);
}

export function decodePolyline(str: string, precision = 5): LatLng[] {
  const f = 10 ** precision;
  const pts: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    pts.push([lat / f, lng / f]);
  }
  return pts;
}
