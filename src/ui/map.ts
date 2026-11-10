import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, RouteData } from '../types';
import { routePoints } from '../game/feedback';
import { icons } from './icons';

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions/" target="_blank" rel="noopener">CARTO</a>';

/**
 * CARTO Basemaps exige una API key gratuita (https://carto.com/basemaps/apikey).
 * Se define en VITE_CARTO_KEY (.env / variables del hosting). Sin key, los tiles
 * llegan con la marca de agua "API KEY REQUIRED".
 */
const CARTO_KEY = (import.meta.env.VITE_CARTO_KEY as string | undefined)?.trim() ?? '';
if (!CARTO_KEY) console.warn('[microdle] Falta VITE_CARTO_KEY: el mapa base mostrará la marca de agua de CARTO.');

const keyParam = CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : '';

/** Tema claro: tiles raster Positron, nolabels (fallo 1) / all (fallo 2, con nombres de calles) */
const tileUrl = (theme: 'light' | 'dark', labels: boolean) =>
  `https://basemaps.cartocdn.com/rastertiles/${theme}_${labels ? 'all' : 'nolabels'}/{z}/{x}/{y}.png` + keyParam;

/** Tema oscuro: estilo vectorial Dark Matter, para poder recolorear las etiquetas. */
const DARK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' + keyParam;

/** Colores de etiquetas en el mapa oscuro: calles en amarillo, lugares en blanco. */
const DARK_LABELS = {
  road: '#f5d76e',
  place: '#ffffff',
  water: '#8fc1e3',
  halo: '#000000',
};
/** Calles un poco más claras que en Dark Matter para que se distingan del fondo. */
const DARK_ROAD_LINE = '#4a4f55';

type GLMap = import('maplibre-gl').Map;

/** Bounding box aproximado de la RM para limitar el paneo. */
const RM_BOUNDS = L.latLngBounds([-34.4, -71.8], [-32.8, -69.9]);

export interface MapRenderOpts {
  answer: RouteData;
  /** 0..5: cuántas pistas visuales están abiertas */
  level: number;
  guesses: RouteData[];
  showGuesses: boolean;
  finished: boolean;
  /** true solo la primera vez que se muestra el final, para animar */
  animateReveal: boolean;
}

export class MapView {
  private map: L.Map;
  private theme: 'light' | 'dark' = 'light';
  private base: L.TileLayer | null = null;
  /** Mapa base actual: '' (ninguno), 'raster:true|false' o 'vector' */
  private baseKey = '';
  private level = 0;
  /** Capa vectorial (solo tema oscuro); se carga bajo demanda */
  private glLayer: L.Layer | null = null;
  private glMap: GLMap | null = null;
  private glLoading = false;
  private glFailed = false;
  private routeLayer = L.layerGroup();
  private guessLayer = L.layerGroup();
  private markerLayer = L.layerGroup();
  private currentAnswerId: string | null = null;
  private bounds: L.LatLngBounds | null = null;
  private lastOpts: MapRenderOpts | null = null;

  constructor(el: HTMLElement) {
    this.map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      maxBounds: RM_BOUNDS.pad(0.2),
      minZoom: 9,
      maxZoom: 17,
      zoomSnap: 0.25,
      preferCanvas: false,
    });
    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution(ATTRIBUTION);
    this.guessLayer.addTo(this.map);
    this.routeLayer.addTo(this.map);
    this.markerLayer.addTo(this.map);
    this.map.setView([-33.45, -70.65], 11);

    // Botón "recentrar"
    const Recenter = L.Control.extend({
      onAdd: () => {
        const b = L.DomUtil.create('button', 'map-btn');
        b.type = 'button';
        b.innerHTML = icons.recenter;
        b.setAttribute('aria-label', 'Recentrar el mapa en el recorrido');
        b.title = 'Recentrar';
        L.DomEvent.disableClickPropagation(b);
        b.addEventListener('click', () => this.fit(true));
        return b;
      },
    });
    new Recenter({ position: 'topleft' }).addTo(this.map);
  }

  setTheme(theme: 'light' | 'dark') {
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.lastOpts) this.render(this.lastOpts);
  }

  invalidate() {
    this.map.invalidateSize();
  }

  private fit(animate = false) {
    if (this.bounds) this.map.fitBounds(this.bounds, { padding: [24, 24], animate });
  }

  private setTiles(level: number) {
    this.level = level;
    const wantBase = level >= 1;
    const labels = level >= 2;
    const useVector = this.theme === 'dark' && !this.glFailed;
    const key = !wantBase ? '' : useVector ? 'vector' : `raster:${this.theme}:${labels}`;

    if (key !== this.baseKey) {
      // Raster: se reemplaza cuando la capa nueva terminó de cargar, para no "parpadear"
      const old = this.base;
      this.base = null;
      if (key.startsWith('raster')) {
        this.base = L.tileLayer(tileUrl(this.theme, labels), { maxZoom: 19, className: 'tiles-base' }).addTo(this.map);
      }
      if (old) {
        if (this.base) this.base.once('load', () => old.remove());
        else old.remove();
      }
      if (key === 'vector') this.showVector();
      else if (this.glLayer && this.map.hasLayer(this.glLayer)) this.glLayer.remove();
      this.baseKey = key;
    }
    if (key === 'vector') this.applyGlLabels();
    this.map.getContainer().classList.toggle('no-basemap', !wantBase);
  }

  /** Carga MapLibre solo cuando se necesita (tema oscuro + mapa visible). */
  private showVector() {
    if (this.glLayer) {
      if (!this.map.hasLayer(this.glLayer)) this.glLayer.addTo(this.map);
      return;
    }
    if (this.glLoading) return;
    this.glLoading = true;
    (async () => {
      const [{ maplibreGL }] = await Promise.all([
        import('@maplibre/maplibre-gl-leaflet'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ]);
      const layer = maplibreGL({ style: DARK_STYLE_URL, attributionControl: false, interactive: false });
      this.glLayer = layer;
      layer.addTo(this.map);
      const gl = layer.getMaplibreMap();
      // MapLibre mide el contenedor antes de que el plugin le dé tamaño y queda
      // dibujando en 400×300: forzamos el resize cuando ya está en el DOM.
      requestAnimationFrame(() => gl.resize());
      this.map.on('resize', () => this.baseKey === 'vector' && gl.resize());
      gl.once('load', () => {
        gl.resize();
        this.glMap = gl;
        this.recolorDark(gl);
        this.applyGlLabels();
      });
      gl.on('error', (e) => console.warn('[microdle] mapa vectorial:', e.error?.message ?? e));
      if (this.baseKey !== 'vector') layer.remove();
    })()
      .catch((err) => {
        // Sin WebGL u otro error: volvemos al raster oscuro de CARTO
        console.warn('[microdle] No se pudo cargar el mapa vectorial, uso raster.', err);
        this.glFailed = true;
        this.baseKey = '';
        if (this.lastOpts) this.render(this.lastOpts);
      })
      .finally(() => (this.glLoading = false));
  }

  private symbolLayers(gl: GLMap) {
    return (gl.getStyle().layers ?? []).filter((l) => l.type === 'symbol');
  }

  /** Etiquetas visibles solo desde el fallo 2, igual que en el tema claro. */
  private applyGlLabels() {
    const gl = this.glMap;
    if (!gl) return;
    const vis = this.level >= 2 ? 'visible' : 'none';
    for (const l of this.symbolLayers(gl)) gl.setLayoutProperty(l.id, 'visibility', vis);
  }

  /** Colores de alto contraste para las etiquetas y calles del mapa oscuro. */
  private recolorDark(gl: GLMap) {
    for (const l of gl.getStyle().layers ?? []) {
      const id = l.id;
      try {
        if (l.type === 'symbol') {
          const color = id.startsWith('roadname')
            ? DARK_LABELS.road
            : id.startsWith('water')
              ? DARK_LABELS.water
              : DARK_LABELS.place;
          if (id === 'housenumber') continue;
          gl.setPaintProperty(id, 'text-color', color);
          gl.setPaintProperty(id, 'text-halo-color', DARK_LABELS.halo);
          gl.setPaintProperty(id, 'text-halo-width', 1.6);
        } else if (l.type === 'line' && /^(road|tunnel|bridge)/.test(id) && !/case|casing/.test(id)) {
          gl.setPaintProperty(id, 'line-color', DARK_ROAD_LINE);
        }
      } catch {
        /* capa sin esa propiedad: se ignora */
      }
    }
  }

  render(opts: MapRenderOpts) {
    this.lastOpts = opts;
    const { answer, level, guesses, showGuesses, finished, animateReveal } = opts;
    this.setTiles(level);

    const pts = routePoints(answer);
    const isNew = this.currentAnswerId !== answer.id;
    this.currentAnswerId = answer.id;

    // Intentos (líneas punteadas, debajo del recorrido)
    this.guessLayer.clearLayers();
    if (showGuesses) {
      for (const g of guesses) {
        if (g.id === answer.id) continue;
        L.polyline(routePoints(g), {
          className: 'guess-line',
          weight: 3,
          interactive: true,
        })
          .bindTooltip(g.id, { sticky: true, className: 'map-tip' })
          .addTo(this.guessLayer);
      }
    }

    // Recorrido misterioso
    this.routeLayer.clearLayers();
    L.polyline(pts, { className: 'route-casing', weight: 9, interactive: false }).addTo(this.routeLayer);
    const line = L.polyline(pts, {
      className: finished ? 'route-line route-final' : 'route-line',
      weight: 5,
      interactive: false,
    }).addTo(this.routeLayer);

    // Terminales
    this.markerLayer.clearLayers();
    if (level >= 3 || finished) {
      this.addTerminal(pts[0], 'A', finished ? `Origen: ${answer.origen}` : 'Terminal');
      this.addTerminal(pts[pts.length - 1], 'B', finished ? `Destino: ${answer.destino}` : 'Terminal');
    }

    this.bounds = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
    if (isNew) {
      this.map.invalidateSize();
      this.fit(false);
    }

    if (finished && animateReveal) {
      requestAnimationFrame(() => this.animateLine(line));
    }
  }

  private addTerminal(p: LatLng, letter: string, label: string) {
    const icon = L.divIcon({
      className: 'terminal-icon',
      html: `<span aria-hidden="true">${letter}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    L.marker(p, { icon, keyboard: false, title: label, alt: label })
      .bindTooltip(label, { direction: 'top', offset: [0, -12], className: 'map-tip' })
      .addTo(this.markerLayer);
  }

  /** Dibuja la línea progresivamente animando stroke-dashoffset. */
  private animateLine(line: L.Polyline) {
    const path = line.getElement() as SVGPathElement | undefined;
    if (!path || typeof path.getTotalLength !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const len = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.getBoundingClientRect(); // forzar reflow
    path.style.transition = 'stroke-dashoffset 2.2s ease-in-out';
    path.style.strokeDashoffset = '0';
    const done = () => {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
      path.style.transition = '';
    };
    path.addEventListener('transitionend', done, { once: true });
    // si el usuario hace zoom durante la animación, Leaflet redibuja: limpiamos igual
    this.map.once('zoomstart', done);
  }
}
