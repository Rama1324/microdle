/**
 * Configuración central del hub. ÚNICO lugar donde se define el nombre, dominio
 * y descripción del sitio: los HTML los reciben vía el plugin de vite.config.ts
 * (placeholders %SITE_NAME%, %SITE_DOMAIN%, %SITE_DESCRIPTION%) y el código TS los importa.
 */
export const HUB = {
  /** Nombre visible del hub */
  name: 'La Once',
  /** Dominio público sin protocolo ni barra final (se usa en metatags y textos para compartir) */
  domain: 'laonce.cl',
  /** Descripción corta para la home y metatags */
  description: 'Juegos diarios chilenos: adivina la micro, compara precios y más.',
} as const;

export const SITE_URL = `https://${HUB.domain}`;

/** Juegos del hub. `path` sin barra final. */
export const GAMES = {
  micro: {
    id: 'micro',
    path: '/micro',
    title: 'Microdle',
    tagline: 'Adivina la micro del día por su trazado',
    accent: '#6AAA64',
    /** Fecha del puzzle #1 (calendario de Santiago) */
    epoch: '2026-11-09',
  },
  caro: {
    id: 'caro',
    path: '/caro',
    title: '¿Qué sale más caro?',
    tagline: 'Más caro o más barato: precios de cosas en Chile',
    accent: '#E07A3F',
    epoch: '2026-11-12',
  },
} as const;

export type GameId = keyof typeof GAMES;
