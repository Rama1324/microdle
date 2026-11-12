/**
 * PLACEHOLDER TEMPORAL: emoji por categoría mientras no existan íconos SVG propios.
 * Es el ÚNICO lugar donde se definen; para reemplazarlos por SVG basta con cambiar
 * este mapa (el resto del código usa categoryIcon()).
 */
const CATEGORY_ICON: Record<string, string> = {
  Suscripciones: '📺',
  Tecnología: '🎮',
  'Música y eventos': '🎟️',
  Fútbol: '⚽',
  'Comida rápida': '🍔',
  Transporte: '🚌',
  Educación: '🎓',
  Vivienda: '🏠',
  Trámites: '🪪',
  Deporte: '🏋️',
  Supermercado: '🛒',
  Farmacia: '💊',
};

export const DEFAULT_ICON = '🏷️';

export function categoryIcon(categoria: string): string {
  return CATEGORY_ICON[categoria] ?? DEFAULT_ICON;
}
