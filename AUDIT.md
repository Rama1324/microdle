# Auditoría de lanzamiento — hub + juegos

**Fecha:** 2026-11-11 · **Alcance:** hub (`/`) y Microdle (`/micro/`), en el estado del refactor a hub (aún sin commitear).
**Estado:** Fase 1 (diagnóstico). No se cambió código de la app; solo se agregó `tests/daily-seed.test.ts`.

> **¿Qué sale más caro?** todavía no está implementado: sus puntos (botones higher/lower, doble clic, validador de precios, contador, fuentes de precios en el footer) quedan **pendientes de auditar** cuando exista.

## Resumen

| Severidad | Cantidad | Lo más importante |
|---|---|---|
| CRÍTICO | 2 | Placeholder `HUB_NAME` visible en producción · el refactor no está commiteado ni desplegado |
| ALTO | 7 | Datos corruptos rompen la app · recarga a medianoche borra la partida · input fuera de pantalla en móvil · contraste AA de celda gris y link del footer |
| MEDIO | 17 | Rachas (desfase de fecha, historia previa) · sin versionado · SEO (robots, sitemap, OG del hub, manifest) · fuentes bloqueantes · CLS · tipografía/espaciado inconsistentes · estética genérica |
| BAJO | 13 | Copy, accesibilidad menor, warnings ocultos, ofuscación débil en práctica |

**Lo que está bien (verificado, no supuesto):** el seed diario cambia exactamente a las 00:00 de Santiago, incluidos los cambios de horario, Año Nuevo y el 29 de febrero. Dos dispositivos en zonas horarias distintas ven el mismo puzzle (test nuevo). El schedule es append-only (18 tests). Recargar no cuenta una partida dos veces. El doble Enter no duplica intentos. El juego funciona con localStorage bloqueado o lleno, aunque sin guardar. No hay scroll horizontal en 360–1440px. Los modales cierran con Esc y devuelven el foco. Lighthouse Accessibility da 100 en ambas rutas.

---

## Evidencia (cómo se probó)

| Prueba | Resultado |
|---|---|
| `npm run build` (incluye `prebuild` → `check-schedules`) | ✅ sin errores. ⚠ el warning de chunk >500 KB está **silenciado** (ver B-09) |
| `npm test` | ✅ 21/21 (schedule 11, migración 7, seed diario 3) |
| Validador de datos de Caro | ⏳ no existe aún (Caro no implementado) |
| Seed diario con fechas simuladas 2026–2028 (cada 5 min, 3 años) | ✅ 0 saltos, 0 retrocesos. El cambio de día ocurre a las 00:00 locales todos los días, salvo el primer domingo de septiembre, que cambia a la 01:00 porque las 00:00 no existen ese día (correcto) |
| DST abril (24:00→23:00) y septiembre (24:00→01:00), 31-dic→1-ene, 28/29-feb-2028 | ✅ cuenta regresiva y día correctos en los 30 casos |
| Dos usuarios (Tokio `ja-JP`, Los Ángeles `en-US`, Santiago) en 4 instantes, incl. 23:59:59 y 00:00:00 | ✅ mismo día y misma respuesta (`tests/daily-seed.test.ts`) |
| localStorage con JSON inválido | ✅ no rompe |
| localStorage con JSON válido pero tipos incorrectos | ❌ rompe Microdle y la home (A-01, A-02, A-03) |
| localStorage bloqueado (SecurityError) / lleno (QuotaExceeded) | ✅ se juega en memoria |
| Doble Enter, Enter durante la animación, 2 recargas tras ganar | ✅ 1 intento, `played` = 1 |
| Partida que termina a las 00:00:00.5 | ⚠ stats correctas (día anterior), racha global registrada en el día nuevo (M-01) |
| Partida a medias a las 00:00 | ❌ recarga forzada, se pierde lo escrito y la partida (A-04) |
| Responsive 360/390/768/1024/1440 (hub y Microdle) | ✅ sin scroll horizontal · ❌ input fuera de pantalla en móvil (A-05) |
| Contraste calculado (WCAG 2.x, fórmula de luminancia relativa) | ❌ 4 pares fallan (A-06, A-07, M-10) |
| Lighthouse móvil (simulado, servidor local sin compresión) | Hub 95/100/96/92 · Microdle 91/100/100/91 (Perf/A11y/BP/SEO) |

---

## CRÍTICO

### C-01 · El nombre del hub es un placeholder visible
- **Dónde:** `src/shared/config.ts:8` (`name: 'HUB_NAME'`). Se propaga a `<title>`, `og:site_name`, el header de la home, el `aria-label` del botón casa (`micro/index.html:48`) y el footer de Microdle (`micro/index.html:105`).
- **Qué pasa:** en producción se leería "HUB_NAME — juegos diarios chilenos", también en el preview de WhatsApp/X.
- **Arreglo:** definir el nombre real (pendiente de tu confirmación). Agregar a `check-schedules` (o a un `check-config.ts`) un chequeo que **falle el build** si `HUB.name === 'HUB_NAME'`.

### C-02 · El refactor a hub no está commiteado y producción sigue en la versión anterior
- **Dónde:** working tree (`git status`): rutas movidas, `src/shared/*`, `public/micro/*`, tests.
- **Qué pasa:** `microdle-tau.vercel.app` sirve Microdle en `/` con el algoritmo viejo. El schedule nuevo congela hasta el día 3 (2026-11-12) con las mismas respuestas que el algoritmo viejo. **Si el despliegue ocurre después del 2026-11-12**, hay que regenerar el schedule ese día (`npm run schedule`): los días posteriores ya fueron elegidos por el algoritmo viejo en producción y deben congelarse igual (usar `bootstrap` con `legacyAnswerForDay` hasta la fecha de despliegue).
- **Arreglo:** commits por tema y deploy antes del 12-nov, o ajustar `MICRO_LEGACY_UNTIL` (`scripts/schedule.ts`) a la fecha real de despliegue.

## ALTO

### A-01 · Datos corruptos (tipos incorrectos) rompen Microdle
- **Dónde:** `src/micro/state.ts:47` (`loadDaily` solo valida `day`), `src/micro/main.ts` (`guesses.map`).
- **Qué pasa:** con `microdle:daily = {"day":2,"guesses":123}` → `TypeError: h.map is not a function`, la grilla no se dibuja y no se puede jugar. El usuario no puede arreglarlo sin borrar datos del sitio.
- **Arreglo:** validar la forma (`Array.isArray(guesses) && guesses.every(s => typeof s === 'string')`, `status` ∈ enum). Si no calza, descartar con un aviso en consola. Lo mismo para `practice`.

### A-02 · Datos corruptos rompen la home completa
- **Dónde:** `src/hub/main.ts:45-48` (`d.guesses.length` con `guesses: null`).
- **Qué pasa:** no se dibuja ninguna tarjeta: la home queda vacía.
- **Arreglo:** usar el mismo `loadDaily` validado (A-01) y envolver el render de cada tarjeta en `try/catch`, para que un juego roto no tumbe la home.

### A-03 · Stats con tipos incorrectos muestran `NaN%`
- **Dónde:** `src/shared/stats.ts` (`getStats` mezcla sin validar). Con `played: "x"` el diálogo muestra `x | NaN% | 0 | 0`.
- **Arreglo:** normalizar cada campo numérico (`Number.isFinite` o 0) al leer.

### A-04 · A medianoche la página se recarga sola y se pierde la partida en curso
- **Dónde:** `src/micro/main.ts:309` (`startCountdown` → `location.reload()` apenas cambia el día y no hay animación).
- **Qué pasa:** si estás jugando a las 23:59, a las 00:00 la página se recarga, se borra lo que escribías y el puzzle empezado ya no se puede terminar. Si ibas ganando ayer, **pierdes la racha** sin haber fallado.
- **Arreglo:** no recargar si hay una partida diaria en curso (`daily.guesses.length > 0 && status === 'playing'`). Dejar terminar el puzzle de la fecha en que empezó, registrar stats con *ese* día y mostrar un aviso "Ya salió la micro de hoy · Ir". Recargar solo si no hay partida empezada.

### A-05 · En móvil el campo para escribir queda fuera de pantalla
- **Dónde:** layout de `src/micro/micro.css` (mapa 45vh + pistas + 6 filas de grilla + input).
- **Qué pasa:** en 360×780 el input está en y=961 px, y en 390×780 en y=997 px. Hay que hacer scroll en cada intento. Al abrir el teclado, el mapa queda fuera de vista justo cuando se necesita.
- **Arreglo:** barra de respuesta fija abajo (`position: sticky; bottom: 0` + `env(safe-area-inset-bottom)`), grilla compacta que solo muestre las filas jugadas más la siguiente, y mapa a ~40dvh. Probar con `visualViewport` para el teclado de iOS.

### A-06 · Texto oscuro sobre la celda gris no cumple AA
- **Dónde:** `src/shared/base.css:5` (`--gray: #787c7e`) con `--on-color: #101212`.
- **Medido:** **4.46:1** (mínimo 4.5). Afecta todas las celdas "✗" de la grilla y las barras de la distribución. *En la entrega original de Microdle afirmé que cumplía: el cálculo estaba mal.*
- **Arreglo:** `--miss: #7b7f81` → 4.65:1 (calculado), o texto blanco sobre un gris más oscuro.

### A-07 · El link del footer de Microdle no tiene estilo y en modo oscuro marca 1.97:1
- **Dónde:** `micro/index.html:105` + falta la regla `.foot a` en `src/shared/base.css`.
- **Qué pasa:** se ve el azul por defecto del navegador (`#0000ee`) subrayado: 8.76:1 en claro, pero **1.97:1** en oscuro. Además se ve roto visualmente.
- **Arreglo:** `.foot a { color: var(--ink); text-decoration-thickness: 1px; text-underline-offset: 2px }`.

## MEDIO

| ID | Dónde | Qué pasa | Arreglo |
|---|---|---|---|
| M-01 | `src/shared/activity.ts:23`, `src/micro/main.ts:228` | La racha global usa la fecha **del momento de terminar**. Una partida empezada a las 23:59 y terminada a las 00:00:00.5 queda en stats como el día anterior (bien), pero en `hub:activity` como el día nuevo (comprobado: `"2026-11-12":["micro"]`) | `recordDailyPlayed(game, day)` debe recibir el índice/fecha del puzzle, no `new Date()` |
| M-02 | `src/shared/activity.ts` | Los jugadores previos al refactor empiezan la racha global en 0, aunque tengan racha en Microdle | Migración única: sembrar `hub:activity` desde `microdle:stats.lastRecordedDay` y `currentStreak` |
| M-03 | `src/shared/store.ts` | Sin versionado de datos: no hay forma limpia de migrar formatos futuros | Guardar `{ v: 1, data }` por key, o una key `hub:schema` con migraciones encadenadas `migrate[v→v+1]` |
| M-04 | `src/micro/game/share.ts:16-18` y `grid.ts` | Una variante casi idéntica (506e cuando es la 506) da **93%**. En el texto para compartir sale `🟩🟩🟩 0.8km ↙`, igual a una victoria (solo falta 🎉) | Reservar 🟩🟩🟩 para el acierto. Topar la superposición de variantes a 🟨, o indicar "variante" en la celda |
| M-05 | `src/micro/ui/map.ts` (pista "Calles") | Al zoom inicial casi no se ven nombres: la pista 2 aporta poco hasta que el jugador hace zoom | Al abrir la pista 2, acercar +1 nivel o centrar en el tramo con más etiquetas |
| M-06 | `public/` | No hay `robots.txt` ni `sitemap.xml` (Lighthouse: "robots-txt: 54 errores", porque sirve el HTML) | Agregar ambos, generados con el dominio de `config.ts` |
| M-07 | `public/og.png` | La home usa la misma imagen OG de Microdle (dice "MICRODLE") | Generar un OG del hub en `build-assets.ts` |
| M-08 | `public/manifest.webmanifest:2-6` | El manifest sigue diciendo "Microdle — adivina la micro del día", pero `start_url: "/"` ahora es la home | Manifest del hub (nombre de `config.ts`) y `shortcuts` a `/micro/` y `/caro/` |
| M-09 | `index.html:33`, `micro/index.html:38` | Google Fonts bloquea el render (Lighthouse: −1.2 a −1.5 s de FCP). Se cargan 5 pesos de Inter + JetBrains Mono, **que no se usa** | Autoalojar 2 familias en WOFF2 con subset latino, `preload` del peso display y `font-display: swap` con métricas ajustadas (`size-adjust`) para no mover el layout |
| M-10 | `src/shared/base.css:13,35` | Bordes de input y celdas vacías: 1.46:1 (claro) y 1.55:1 (oscuro); WCAG 1.4.11 pide 3:1 para límites de controles | `--line` calculado: `#878a8b` (3.42:1) y `#646a6f` (3.05:1) |
| M-11 | `src/micro/micro.css:227` (`.grid-label` 0.66rem ≈ 10.6px), `base.css:257` (footer 0.74rem), atribución del mapa 10px | Texto <12px: Lighthouse marca solo 49% de texto legible en la home | Escala con mínimo 12px (ver propuesta) |
| M-12 | Microdle | CLS 0.107 (Lighthouse): 3 desplazamientos (quitar `#map-loading`, insertar `#hint-detail`, cambio de fuente) | Reservar alto de pistas, skeleton de grilla estable, fuentes con `size-adjust` |
| M-13 | `src/shared/base.css:159,188`, Leaflet | Objetivos táctiles chicos: botones de ícono 40×40, tabs 33px de alto, zoom de Leaflet 30×30. Cumplen el mínimo AA de 24px (2.5.8), no los 44px recomendados para un juego de pulgar | `--hit: 44px` como mínimo en controles táctiles |
| M-14 | `src/micro/main.ts:181`, `src/shared/ui/dialogs.ts:66` | Copy genérico ("¡Increíble!", "¡Impresionante!"). El refactor cambió "Próxima micro en" por "Próximo juego en" | Copy por juego (ver propuesta) |
| M-15 | `src/hub/main.ts:33,59`, `src/micro/ui/grid.ts:37`, `src/micro/main.ts:266` | Emojis como íconos de interfaz: 🔥 racha, 💸 tarjeta de Caro, 🎯 celda de acierto, 😕 en el toast. Se ven distintos en cada sistema y suben la estética de "plantilla" | SVG propios (ya se pidió el mapa central de íconos para Caro) |
| M-16 | Todo el CSS | **24 tamaños de fuente distintos** (0.66rem…2rem, más px sueltos), **16 valores de espaciado** (1–24px, sin escala), **11 radios distintos** (4, 5, 6, 7, 8, 12, 14, 16px, 50%, 999px, var), 4 pesos (500–800, 18 usos de 800) | Tokens de escala tipográfica y espaciado base 4 (ver propuesta) |
| M-17 | `src/micro/ui/map.ts:28`, `src/shared/ui/icons.ts`, `base.css:488` | Colores hardcodeados fuera de los tokens: etiquetas del mapa oscuro, logo SVG (8 hex), `#fff` del switch | Mover a tokens; el SVG del logo con `currentColor` + variables |

## BAJO

| ID | Dónde | Qué pasa | Arreglo |
|---|---|---|---|
| B-01 | `src/shared/time.ts` `formatCountdown` | A las 00:00:00 exactas muestra "24:00:00" | Mostrar `00:00:00` o forzar el cambio |
| B-02 | `src/micro/main.ts:35` | La respuesta de **práctica** se guarda como base64 de la cadena invertida: `atob` + `reverse` en DevTools y listo | Usar `encodeEntry` del schedule (misma ofuscación del diario) |
| B-03 | `public/micro/schedule.json` + bundle | La respuesta diaria no está en texto plano en el repo, los JSON ni el bundle. Pero la sal y el algoritmo están en el JS: con un breakpoint en `answerForDay` se lee. Es ofuscación, no seguridad, como en cualquier juego diario estático | Aceptable. Documentado |
| B-04 | `src/shared/share.ts:6` | iPadOS se identifica como Mac: usa el portapapeles en vez del menú de compartir | Detectar `navigator.maxTouchPoints > 1` |
| B-05 | Leaflet | Controles en inglés ("Zoom in", "Zoom out") para lectores de pantalla | `zoomInTitle: 'Acercar'`, `zoomOutTitle: 'Alejar'` |
| B-06 | `<dialog>` nativo | Esc y el regreso del foco funcionan. El fondo queda inerte, pero Tab puede salir a la UI del navegador (comportamiento estándar de `showModal`) | Aceptable. Opcional: trampa de foco explícita |
| B-07 | `src/micro/ui/grid.ts:22` | Con `prefers-reduced-motion` la animación se apaga, pero igual se esperan ~1.2 s antes de habilitar el input | Usar `ROW_REVEAL_MS = 0` si `matchMedia('(prefers-reduced-motion: reduce)')` |
| B-08 | `src/micro/ui/map.ts:138` | Al pasar a tema claro, la capa MapLibre se quita del mapa pero su contexto WebGL sigue vivo | `layer.getMaplibreMap().remove()` y soltar la referencia |
| B-09 | `vite.config.ts:31` | `chunkSizeWarningLimit: 900` silencia el aviso del chunk de MapLibre (789 KB, 178 KB br) | Dejar el límite por defecto y documentar el chunk como lazy; o reconsiderar MapLibre (P-03) |
| B-10 | `src/shared/base.css:498` | Media query con `.cell-main` (clase de Microdle) dentro del CSS compartido | Moverla a `micro.css` |
| B-11 | `src/micro/game/geo.ts:127` | Superposición con tolerancia 120 m: recorridos por calles paralelas a 150 m dan 0% aunque sean "el mismo corredor" | Aceptable. Documentar en "Cómo jugar" |
| B-12 | `src/micro/game/historic.ts` | Solo se conserva el shape de recorridos que **desaparecen**. Si el GTFS cambia el trazado de la respuesta de hoy, el feedback cambia a mitad del día | Congelar también el shape de las respuestas de hoy y mañana |
| B-13 | Estética general | Paleta idéntica a la de Wordle (#6AAA64/#C9B458/#787C7E) + grilla 5×6 + título en mayúsculas: se lee como "clon de Wordle" | Lo resuelve la dirección visual propuesta (acentos propios, la grilla como letrero) |

## Rendimiento

| Recurso | Raw | gzip | brotli | Cuándo carga |
|---|---|---|---|---|
| Hub JS + CSS (+ chunk compartido) | 16.6 KB | 6.7 KB | 5.7 KB | `/` |
| Microdle JS (incluye Leaflet ~40 KB gz) | 175 KB | 53.8 KB | 47.0 KB | `/micro/` al inicio |
| `micro/routes.json` | 176 KB | 54.6 KB | 44.6 KB | `/micro/` al inicio |
| `micro/schedule.json` | 3 KB | 1.6 KB | 1.2 KB | `/micro/` al inicio |
| MapLibre JS + CSS | 853 KB | 222 KB | 185 KB | Solo tema oscuro, desde el 1er fallo |
| OG PNG | 154 KB | — | — | Solo scrapers (OK: < 300 KB para WhatsApp) |

**Propuestas (P):**
- **P-01 · Leaflet lazy:** en el intento 0 no hay mapa base. La forma se puede dibujar como SVG puro con el `routes.json` ya cargado, y `import('leaflet')` recién en el primer fallo. Ahorra ~40 KB gz del JS inicial de Microdle.
- **P-02 · `routes.json` más liviano:** separar `routes-index.json` (id, zona, comunas, centroide, origen/destino: ~15 KB gz) de los shapes. Los shapes se piden en bloque tras el primer render. Con polilíneas de precisión 4 (~11 m, suficiente con tolerancia 0.0005°) se ahorra ~20% más.
- **P-03 · MapLibre (185 KB br) solo para recolorear etiquetas en modo oscuro:** es la dependencia más pesada del proyecto. Alternativa sin dependencia: raster `dark_nolabels` y, en la pista "Calles", usar `light_all` invertido solo para etiquetas (probado antes: legible pero menos fino). Decisión tuya: calidad vs. 185 KB.
- **P-04 · Code-splitting por juego:** ya ocurre (multi-página de Vite). El chunk compartido (`state-*.js`, 2.6 KB br) es correcto, pero su nombre es confuso: nombrarlo `shared` con `manualChunks`.
- **Imágenes:** no hay `<img>` en las páginas (todo es SVG/CSS). WebP/AVIF no aplica salvo a los OG, y ahí **PNG es la opción segura** para WhatsApp/X.

## SEO y compartir

| Ítem | Hub | Microdle |
|---|---|---|
| `<title>` y description propios | ⚠ con placeholder (C-01) | ✅ |
| OG/Twitter con imagen propia | ❌ usa la de Microdle (M-07) | ✅ `/micro/og.png` 1200×630 |
| `lang="es-CL"`, canonical, favicon | ✅ (canonical apunta a `microdle-tau.vercel.app` hasta definir dominio) | ✅ |
| manifest | ⚠ M-08 | (compartido) |
| robots.txt / sitemap.xml | ❌ M-06 | ❌ |
| Preview real en WhatsApp/X | ⏳ **no verificable hasta desplegar** (producción sirve la versión anterior) | ⏳ |
| Footer: atribuciones OSM/CARTO/DTPM + no afiliación | ✅ | ✅ |
| Footer: fuentes de precios | ⏳ Caro | — |

## Diseño — señales de "estética de IA genérica"

| Señal | ¿Está? | Dónde |
|---|---|---|
| Inter/system-ui como única tipografía | **Sí** | `base.css` `--font: 'Inter', system-ui…`. JetBrains Mono se descarga y no se usa |
| Degradados morados/azules, glassmorphism, blobs | No | — |
| Tarjetas idénticas con radio grande y sombra suave | **Sí** | `hub.css:46,56`: radio 16 + sombra al hover. Resultado, panel, diálogos y mapa con 14–16px |
| Emojis como íconos de interfaz | **Sí** | M-15 |
| Copy genérico | **Parcial** | M-14. La home: "Juegos diarios chilenos: adivina la micro, compara precios y más." es descriptiva, sin voz |
| Espaciados inconsistentes, muchos pesos, jerarquía plana | **Sí** | M-16. La home en desktop: 2 tarjetas en un lienzo vacío de 1440×900, sin jerarquía ni identidad |
| Parecido a Wordle | **Sí** | B-13 |

---

## Fase 2 — Propuesta de diseño

Ver **`design/propuesta.html`**: dirección visual, 3 parejas tipográficas con su justificación, tokens con contraste calculado, escalas, microinteracciones, copy y preview de la home y de Microdle en claro/oscuro. **Espera tu OK antes de aplicarse.**

## Fase 3 — Seguimiento

Leyenda: ✅ arreglado y verificado · ⏸ pendiente (con razón) · ✖ descartado (con razón).

| ID | Estado | Cómo se arregló / verificó |
|---|---|---|
| C-01 | ✅ | Nombre "La Once", dominio `laonce.cl` en `config.ts`. Los tokens HTML pasan a `%SITE_*%`. `postbuild` (`scripts/check-dist.ts`) falla si queda un placeholder |
| C-02 | ✅ | 7 commits por tema, desplegados el 2026-11-11. Días 0–3 congelados con el algoritmo viejo. `tests/legacy-freeze.test.ts` compara contra un snapshot del `routes.json` de producción. Respuesta de hoy (B04) verificada en producción antes y después |
| A-01/A-02/A-03 | ✅ | `src/shared/schema.ts` + `readValid`: si una key no calza con su esquema, se borra **solo esa key** y se loguea. 14 casos en `tests/storage.test.ts`. En el navegador: datos corruptos → 0 errores, grilla y home completas, stats en 0 sin `NaN`. La home además aísla cada tarjeta con `try/catch` |
| A-04 | ✅ | Nunca se recarga sola. La partida empezada se termina con la respuesta de su día, y aparece un aviso "Ya hay micro nueva — jugar". Si se cerró a medias y se vuelve después de medianoche, se retoma. Verificado con reloj falso: lo escrito se conserva, gana con la respuesta de ayer, stats y racha global quedan en el día del puzzle |
| A-05 | ✅ | Barra de respuesta fija en móvil + `visualViewport` (`--kb`) + `interactive-widget=resizes-content`. Input visible sin scroll en 360×640 y 390×780, también con teclado (simulado: headless no tiene teclado virtual; falta probar en iPhone y Android reales). El mapa se aisló con `isolation: isolate` para que sus controles no tapen las sugerencias |
| A-06 | ✅ | `--gray` #787c7e → #7b7f81 (4.46 → 4.65:1). `tests/contrast.test.ts` calcula todos los pares desde `base.css`, en claro y oscuro |
| A-07 | ✅ | `.foot a` con `--text` |
| M-01 | ✅ | `recordDailyPlayed(game, fechaDelPuzzle)` |
| M-09 | ✅ | Chivo + Chivo Mono self-hosted (Fontsource, OFL) en `public/fonts/`, con `preload` y `font-display: swap`, y fallbacks con `size-adjust` medido. Sin Google Fonts |
| M-10 | ✅ | Token `--line` (≥3:1) para bordes de input, botones y celdas vacías |
| M-11 | ✅ (home) | Home: texto ≥14px, metadatos 12px. Microdle sigue con texto de 10–11px en la grilla: ⏸ lo resuelve el sistema de diseño |
| M-12 | ✅ | CLS de Microdle 0.107 → 0.001: padding de la barra en el HTML inicial + fallbacks de fuente ajustados |
| P-03 | ✅ | MapLibre se mantiene, con `import()` dinámico solo en `/micro` y solo en tema oscuro. Ni la home ni Microdle lo precargan |
| Resto de MEDIO y BAJO | ⏸ | Orden acordado: sistema de diseño → Caro → auditoría de Caro → MEDIOS → BAJOS |

**Lighthouse móvil tras los arreglos** (local con brotli, como en Vercel):

| Ruta | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS |
|---|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 1.1 s | 1.5 s | 0 |
| `/micro/` | 100 | 100 | 100 | 100 | 0.9 s | 1.4 s | 0.001 |
