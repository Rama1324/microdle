/** Un recorrido tal como viene en public/routes.json */
export interface RouteData {
  /** route_short_name: "506", "B27", "I09c"… */
  id: string;
  /** route_long_name */
  nombre: string;
  /** Polilínea codificada (algoritmo de Google, precisión 1e5) */
  shape: string;
  /** Comunas que atraviesa, en orden de aparición */
  comunas: string[];
  /** [lat, lng] */
  centroide: [number, number];
  largoKm: number;
  origen: string;
  destino: string;
  /** Letra del alimentador (B…J) o dígito del troncal ("1".."7") */
  zona: string;
  /** false = servicio corto/nocturno/expreso/variante: válido como intento, nunca respuesta */
  elegible: boolean;
}

export interface RoutesFile {
  version: string;
  gtfs: string;
  routes: RouteData[];
}

export type LatLng = [number, number];

export type Level3 = 'all' | 'some' | 'none';

export interface Feedback {
  id: string;
  correct: boolean;
  /** 0–100 */
  overlap: number;
  distKm: number;
  /** Flecha desde el intento hacia la respuesta */
  arrow: string;
  arrowLabel: string;
  comunasShared: number;
  comunas: Level3;
  sameZona: boolean;
}

export type GameStatus = 'playing' | 'won' | 'lost';
export type Mode = 'daily' | 'practice';
export const MAX_GUESSES = 6;
