# La Once

Juegos diarios chilenos en **[laonce.cl](https://laonce.cl)**. Sitio 100 % estático (Vite + TypeScript), sin backend ni login; el progreso vive en `localStorage`.

| Juego | Ruta | Estado |
|---|---|---|
| **Microdle**: adivina la micro por su trazado | `/micro/` | Publicado |
| **¿Qué sale más caro?**: higher/lower con precios reales de Chile | `/caro/` | Publicado |

`microdle.cl` redirige a `laonce.cl/micro/` (ver `vercel.json`).

> Proyecto independiente, sin afiliación con DTPM ni Red Movilidad. Datos: GTFS DTPM, mapas © OpenStreetMap / CARTO.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173  (home) · /micro/
npm test           # tests (schedule, migración, seed diario, storage, contraste, Caro)
npm run build      # prebuild: check-schedules · build · postbuild: check-dist
npm run preview
```

### Configuración central

`src/shared/config.ts` es el **único** lugar con el nombre, el dominio y la descripción del hub, más los datos de cada juego (ruta, acento, fecha del #1). Los HTML usan `%SITE_NAME%`, `%SITE_DOMAIN%`, `%SITE_DESCRIPTION%` y `%SITE_URL%`, que reemplaza el plugin de `vite.config.ts`. `postbuild` falla si queda alguno sin reemplazar.

### API key del mapa (CARTO)

CARTO Basemaps exige una key gratuita (<https://carto.com/basemaps/apikey>). Defínela como `VITE_CARTO_KEY` en `.env.local` y en Vercel, con tipo **Config** (las variables `VITE_*` quedan en el JS público). Si activas la restricción de sitios en CARTO, agrega `laonce.cl` y `localhost`.

## Estructura

```
index.html            home del hub
micro/index.html      Microdle
src/shared/           config, time (calendario de Santiago), rng, store (localStorage),
                      stats, activity (racha global), theme, share, schedule, ui/
src/hub/              home
src/micro/            Microdle (game/, ui/, state.ts)
scripts/              build-data (GTFS), schedule, check-schedules, check-dist, build-assets
public/micro/         routes.json, schedule.json, og.png
tests/                node:test vía tsx
AUDIT.md              auditoría de lanzamiento y seguimiento
design/propuesta.html propuesta de sistema de diseño (pendiente de aprobación)
```

## Schedule diario append-only (todos los juegos)

El puzzle de cada día está en un archivo **generado y commiteado** (`public/<juego>/schedule.json`). El cliente solo lo lee.

- Al regenerarlo (`npm run schedule`), los días pasados, hoy y mañana se **copian sin cambios**. Solo se recalculan los días futuros. Agregar o quitar ítems nunca cambia un puzzle ya publicado.
- Cada día se guarda ofuscado: el repo y el bundle no traen las respuestas en texto plano.
- `prebuild` falla si el schedule cubre menos de 14 días desde hoy, o si un día congelado apunta a algo que no existe en los datos.
- **Microdle:** los días 2026-11-09 a 2026-11-12 se publicaron con el algoritmo anterior. Están congelados idénticos (`src/micro/game/legacy.ts`, `tests/legacy-freeze.test.ts`).

## Microdle: datos

1. Descarga el GTFS vigente desde <https://www.dtpm.cl/index.php/gtfs-vigente> y descomprímelo en `data/gtfs/`.
2. `npm run data`: genera `public/micro/routes.json` y extiende el schedule.
3. Commitea `routes.json` y `schedule.json`.

Si un recorrido que es respuesta de un día congelado desaparece del GTFS, se conserva con su shape histórico (`historico: true`, nunca vuelve a salir como respuesta).

Íconos, manifest y OG: `npm run assets`.

## ¿Qué sale más caro?: cómo agregar y verificar precios

**Regla:** ningún precio sale de la memoria de nadie. Cada precio publicado tiene que venir de una página que alguien leyó, con su link y su fecha.

Los ítems viven en `data/caro.json`:

```json
{ "id": "coca-3l-jumbo", "item": "Coca-Cola 3 L en Jumbo", "precio": 3450, "unidad": "CLP",
  "categoria": "Supermercado", "fuente": "Jumbo", "fuenteUrl": "https://www.jumbo.cl/busqueda?ft=coca%20cola%203%20litros",
  "fechaPrecio": "2026-11-11", "imagen": "", "verificado": true }
```

**Agregar un ítem:**
1. Agrega el objeto con `id` (minúsculas y guiones, único), `item` y `categoria`. Deja `"precio": null` y `"verificado": false` si todavía no tiene precio: queda como idea y no se publica.
2. Para verificarlo, abre la página de la tienda o del organismo y anota:
   - `precio`: entero en pesos, sin puntos. Usa el precio **normal**. Si solo hay oferta, anótalo en `fuente` (por ejemplo, "Falabella (precio de oferta)").
   - `fuente`: nombre del sitio, con aclaraciones si hacen falta ("Jumbo (precio por kg)").
   - `fuenteUrl`: el link exacto donde se ve el precio.
   - `fechaPrecio`: el día en que lo viste (`YYYY-MM-DD`).
   - `"verificado": true`.
3. Corre `npm run caro`. Esto valida, publica `public/caro/items.json` (solo los verificados) y extiende el schedule.
4. Commitea `data/caro.json`, `public/caro/items.json` y `public/caro/schedule.json`.

**Qué revisa el validador** (`scripts/validate-caro.ts`, corre solo antes de cada build):
- ❌ **Falla** si un ítem verificado no tiene precio (entero > 0), fuente, fuenteUrl (http/https) o fechaPrecio válida, si la fecha está en el futuro, o si hay ids duplicados.
- ⚠️ **Avisa** si un precio verificado tiene más de 12 meses: conviene volver a mirarlo.
- Los ítems no verificados se excluyen sin error.

**Reglas del juego que dependen de los datos:**
- Nunca se comparan dos precios con menos de 10% de diferencia (sería azar). Por eso Jumbo y Santa Isabel, que tienen precios casi iguales, compiten con todo lo demás, pero no entre sí.
- El diario necesita 11 ítems con precios suficientemente distintos. Con menos, la página muestra "Próximamente".
- Cada día del schedule guarda su precio congelado ("id@precio"): actualizar un precio cambia los días futuros, nunca los publicados.
- No des de baja (`verificado: false`) un ítem que aparece en un día congelado: `prebuild` lo detecta y falla.

**Íconos por categoría:** son emoji provisorios, definidos en un solo mapa (`src/caro/icons.ts`) para reemplazarlos después por SVG propios.

## Despliegue (Vercel)

Importa el repo. `vercel.json` define el build y los redirects. En **Settings → Domains** agrega `laonce.cl`, `www.laonce.cl`, `microdle.cl` y `www.microdle.cl`. Los redirects por host ya están en `vercel.json`.

## Créditos

GTFS: DTPM · límites comunales: [caracena/chile-geojson](https://github.com/caracena/chile-geojson) · mapas: © OpenStreetMap contributors, © CARTO.
