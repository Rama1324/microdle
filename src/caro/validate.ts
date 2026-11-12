/**
 * Validación de data/caro.json (sin efectos: la usa scripts/validate-caro.ts y los tests).
 *
 * - ERROR (falla el build): un ítem verificado sin precio, fuente, fuenteUrl o
 *   fechaPrecio válidos; ids duplicados o mal formados.
 * - AVISO: precio verificado con fechaPrecio de más de 12 meses.
 * - Los ítems NO verificados se excluyen de lo publicado (no son error).
 */
import type { CaroItem, CaroSourceItem } from './types';
import { daysBetween } from '../shared/time';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  published: CaroItem[];
  excluded: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateCaro(source: unknown, today: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const published: CaroItem[] = [];
  let excluded = 0;

  if (!Array.isArray(source)) {
    return { errors: ['data/caro.json debe ser una lista de ítems'], warnings, published, excluded };
  }

  const seen = new Set<string>();
  source.forEach((raw: CaroSourceItem, i) => {
    const where = `ítem ${i + 1}${raw?.id ? ` (${raw.id})` : ''}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${where}: no es un objeto`);
      return;
    }
    if (typeof raw.id !== 'string' || !SLUG.test(raw.id)) errors.push(`${where}: id inválido (usa minúsculas y guiones)`);
    else if (seen.has(raw.id)) errors.push(`${where}: id duplicado`);
    else seen.add(raw.id);
    if (typeof raw.item !== 'string' || !raw.item.trim()) errors.push(`${where}: falta "item"`);
    if (typeof raw.categoria !== 'string' || !raw.categoria.trim()) errors.push(`${where}: falta "categoria"`);

    if (raw.verificado !== true) {
      excluded++;
      return;
    }

    // Verificado: todo es obligatorio
    const missing: string[] = [];
    if (!Number.isInteger(raw.precio) || (raw.precio as number) <= 0) missing.push('precio (entero > 0)');
    if (typeof raw.fuente !== 'string' || !raw.fuente.trim()) missing.push('fuente');
    if (typeof raw.fuenteUrl !== 'string' || !validUrl(raw.fuenteUrl)) missing.push('fuenteUrl (URL http/https)');
    if (typeof raw.fechaPrecio !== 'string' || !validDate(raw.fechaPrecio)) missing.push('fechaPrecio (YYYY-MM-DD)');
    if (raw.unidad !== 'CLP') missing.push('unidad "CLP"');
    if (missing.length) {
      errors.push(`${where}: verificado pero le falta ${missing.join(', ')}`);
      return;
    }

    const age = daysBetween(raw.fechaPrecio, today);
    if (age < 0) {
      errors.push(`${where}: fechaPrecio ${raw.fechaPrecio} está en el futuro`);
      return;
    }
    if (age > 365) warnings.push(`${where}: precio de ${raw.fechaPrecio} (hace ${age} días, más de 12 meses). Conviene re-verificarlo.`);

    published.push({
      id: raw.id,
      item: raw.item.trim(),
      precio: raw.precio as number,
      categoria: raw.categoria.trim(),
      fuente: raw.fuente.trim(),
      fuenteUrl: raw.fuenteUrl,
      fechaPrecio: raw.fechaPrecio,
      imagen: typeof raw.imagen === 'string' ? raw.imagen : '',
    });
  });

  published.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { errors, warnings, published, excluded };
}
