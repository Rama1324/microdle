/** Ítem tal como se publica en public/caro/items.json (solo verificados). */
export interface CaroItem {
  id: string;
  item: string;
  /** CLP, entero */
  precio: number;
  categoria: string;
  fuente: string;
  fuenteUrl: string;
  /** YYYY-MM-DD */
  fechaPrecio: string;
  imagen: string;
}

export interface CaroItemsFile {
  generado: string;
  items: CaroItem[];
}

/** Ítem como se escribe en data/caro.json (fuente de verdad, incluye no verificados). */
export interface CaroSourceItem extends Omit<CaroItem, 'precio'> {
  precio: number | null;
  unidad: string;
  verificado: boolean;
}

export type Guess = 'higher' | 'lower';

/** Un ítem con el precio congelado para un día del schedule. */
export interface PricedRef {
  id: string;
  precio: number;
}

/** Comparaciones del diario. */
export const DAILY_ROUNDS = 10;
