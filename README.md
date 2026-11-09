# Microdle 🚌

**Adivina la micro del día.** Un juego diario donde ves el trazado de un recorrido de bus de Santiago y tienes 6 intentos para adivinar cuál es. Cada fallo abre una pista nueva.

Sitio 100 % estático (Vite + TypeScript + Leaflet), sin backend ni login. El progreso y las estadísticas se guardan en `localStorage`.

> Proyecto independiente, sin afiliación con DTPM ni Red Movilidad. Datos: GTFS DTPM, mapas © OpenStreetMap / CARTO.

---

## Requisitos

- Node.js 20 o superior
- Una API key **gratuita** de CARTO Basemaps (ver más abajo)

```bash
npm install
```

## 1. Descargar el GTFS de DTPM

1. Entra a <https://www.dtpm.cl/index.php/gtfs-vigente>.
2. Descarga el ZIP vigente (por ejemplo, `GTFS_20261003.zip`).
3. Descomprímelo en `data/gtfs/` para que queden `data/gtfs/routes.txt`, `trips.txt`, `shapes.txt`, `stops.txt`, `stop_times.txt`, etc.

```bash
# Linux / macOS / Git Bash
curl -L -o gtfs.zip https://www.dtpm.cl/descargas/gtfs/GTFS_20261003.zip
unzip -o gtfs.zip -d data/gtfs
```

`data/gtfs/` está en `.gitignore`: pesa unos 70 MB y no se publica.
El archivo de comunas `data/comunas-rm.geojson` (52 comunas de la RM) sí se versiona.
Viene de [caracena/chile-geojson](https://github.com/caracena/chile-geojson).

## 2. Generar `public/routes.json`

```bash
npm run data
# opciones:
npm run data -- --gtfs data/gtfs --comunas data/comunas-rm.geojson --out public/routes.json --tolerance 0.0005
```

El script (`scripts/build-data.ts`):

1. Lee `routes.txt` y se queda solo con los buses de Red (`route_type = 3`, agencia `RM`). Excluye Metro, trenes y el bus al aeropuerto.
2. Por cada recorrido toma **un** shape representativo: el más largo del sentido ida (`direction_id = 0`).
3. Simplifica la geometría con Douglas-Peucker (`@turf/simplify`, tolerancia 0.0005°, unos 50 m).
4. Calcula las comunas que cruza. Muestrea el trazado cada 100 m y cuenta una comuna solo si tiene al menos 3 muestras, para no contar las que apenas toca en el borde.
5. Calcula también el centroide (ponderado por largo), el largo en km y los terminales (primer y último paradero del viaje representativo, sacados de `stop_times.txt`).
6. Marca como `elegible: false` los servicios cortos (`c`), expresos (`e`), nocturnos (`n`) y variantes (`v`). Se pueden usar como intento, pero nunca son la respuesta.

**Cuando DTPM publique un GTFS nuevo**, reemplaza `data/gtfs/`, corre `npm run data` y vuelve a desplegar.

### Formato

```jsonc
{
  "version": "2026-11-09",
  "gtfs": "GTFS DTPM V168.20261003 (desde 2026-10-03)",
  "routes": [
    {
      "id": "506",
      "nombre": "Maipu - Peñalolen",
      "shape": "polilínea codificada (Google, precisión 5)",
      "comunas": ["Maipú", "Estación Central", "Santiago", "Ñuñoa", "Peñalolén"],
      "centroide": [-33.48625, -70.68553],
      "largoKm": 36.9,
      "origen": "Avenida Portales / esq. La Galaxia",
      "destino": "Av. Diagonal Las Torres / esq. Álvaro Casanova",
      "zona": "5",
      "elegible": true
    }
  ]
}
```

`zona` es la letra del alimentador (`B`…`J`) o el dígito de la centena del troncal (`1`…`7`).

## 3. API key del mapa (CARTO)

Desde 2026, CARTO Basemaps exige una key. Sin ella, los tiles aparecen con la marca de agua *"API KEY REQUIRED"*.

1. Pídela gratis (solo con un e-mail) en <https://carto.com/basemaps/apikey>. Es gratis hasta 5 M de tiles al mes para proyectos no comerciales y hasta 1 M para uso comercial.
2. Copia `.env.example` a `.env.local` y pega la key:

   ```
   VITE_CARTO_KEY=tu_key
   ```

3. En Vercel o Netlify, define `VITE_CARTO_KEY` como variable de entorno del proyecto. Se incrusta al compilar.

El juego funciona sin key: el paso 0 (forma pura) no usa mapa base. Pero desde el primer fallo se verá la marca de agua.

## 4. Desarrollo local

```bash
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

Para empezar de cero, borra las claves `microdle:*` de `localStorage` en DevTools.

### Íconos e imagen OG

```bash
npm run assets
```

Genera desde SVG (con `sharp`): `favicon.svg`, `favicon-32.png`, `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `manifest.webmanifest` y `og.png` (1200×630).
La imagen OG dibuja la red completa de recorridos y destaca un servicio **no elegible**, así nunca revela una respuesta.
Los archivos generados se versionan, así que el build del hosting no necesita correr este paso.

## 5. Desplegar

**Vercel:** importa el repo. `vercel.json` ya define `npm run build` → `dist`. Agrega `VITE_CARTO_KEY` en *Settings → Environment Variables*.

**Netlify:** importa el repo. `netlify.toml` ya define build y headers. Agrega `VITE_CARTO_KEY` en *Site configuration → Environment variables*.

Si usas otro dominio distinto de `microdle.cl`, cambia las URLs absolutas de `og:url`, `og:image`, `twitter:image` y `canonical` en `index.html`, además de `SITE` en `src/game/share.ts`.

---

## Cómo funciona

### Respuesta del día

- El día se calcula con la fecha en `America/Santiago`. El #1 es el 2026-11-09 (`EPOCH` en `src/game/daily.ts`).
- Los recorridos elegibles se ordenan por id y se barajan con Fisher-Yates + `mulberry32`, usando una semilla fija por ciclo. Así todos los jugadores ven la misma micro y ninguna se repite hasta agotar la lista (314 recorridos). Al agotarse empieza un ciclo nuevo con otro orden.
- La respuesta **no está escrita** en el bundle ni en `routes.json`: se calcula en el cliente. En modo práctica, la respuesta se guarda ofuscada en `localStorage`.
- ⚠️ Si `routes.json` cambia (GTFS nuevo con recorridos agregados o eliminados), cambia la lista elegible y con ella el calendario desde ese despliegue. Todos siguen viendo la misma micro. Si quieres evitar que cambie la micro a mitad de día, conviene desplegar los datos nuevos justo después de medianoche.

### Pistas (una por fallo)

| Fallos | Se revela |
|---|---|
| 0 | Solo la forma, sobre un fondo sin mapa |
| 1 | Mapa base sin nombres (`*_nolabels`) |
| 2 | Mapa con nombres de calles (`*_all`) |
| 3 | Terminales (A y B) |
| 4 | Comunas que cruza |
| 5 | Zona o letra del recorrido |

### Feedback por intento

- **Traza:** superposición simétrica = (largo del intento a ≤120 m del real + largo del real a ≤120 m del intento) / (suma de ambos largos). Verde ≥70 %, amarillo ≥30 %.
- **Distancia:** km entre centroides y flecha (8 rumbos) desde el intento hacia la respuesta. Amarillo si está a ≤5 km.
- **Comunas:** cantidad en común. Verde si son exactamente las mismas, amarillo si comparten alguna, gris si ninguna.
- **Zona:** misma letra o centena, sí o no.

Cada celda lleva además un símbolo (✓ ≈ ✗) y un `aria-label`, así que no depende solo del color. El texto sobre las celdas es oscuro para cumplir contraste AA en los tres colores.

## Estructura

```
├─ data/
│  ├─ gtfs/                  GTFS DTPM descomprimido (no versionado)
│  └─ comunas-rm.geojson
├─ scripts/
│  ├─ build-data.ts          GTFS → public/routes.json
│  └─ build-assets.ts        íconos, manifest, og.png
├─ public/                   routes.json + íconos + manifest + og.png
├─ src/
│  ├─ main.ts                estado del juego y conexión con la UI
│  ├─ types.ts
│  ├─ styles.css
│  ├─ game/                  lógica pura (sin DOM)
│  │  ├─ daily.ts            fecha Chile, calendario, cuenta regresiva
│  │  ├─ rng.ts              hash + PRNG + barajado con semilla
│  │  ├─ geo.ts              distancias, rumbo, superposición
│  │  ├─ polyline.ts         codificar/decodificar polilíneas
│  │  ├─ feedback.ts
│  │  ├─ share.ts            texto sin spoilers + Web Share / portapapeles
│  │  ├─ stats.ts
│  │  └─ storage.ts          localStorage con try/catch
│  └─ ui/
│     ├─ map.ts              Leaflet, revelación progresiva, animación final
│     ├─ grid.ts             grilla con animación flip
│     ├─ input.ts            combobox accesible con autocompletado
│     ├─ modals.ts
│     └─ icons.ts
├─ index.html
├─ vercel.json / netlify.toml
└─ .env.example
```

## Licencias y créditos

- Datos de recorridos: GTFS publicado por DTPM.
- Límites comunales: [caracena/chile-geojson](https://github.com/caracena/chile-geojson).
- Mapas: © OpenStreetMap contributors, © CARTO.
