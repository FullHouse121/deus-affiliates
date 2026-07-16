/* DEUS globe — globe.gl (three-globe): hex-binned land in our green,
   selected GEO extrudes its true polygon, ripple rings + traffic arcs. */
import Globe from 'globe.gl';
import gsap from 'gsap';
import { feature } from 'topojson-client';
import { polygonToCells } from 'h3-js';
import topoUrl from 'world-atlas/countries-110m.json?url';
import metaUrl from './assets/globe-meta.json?url';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* world-atlas feature name -> our iso codes */
const GEO_NAMES = {
  br: ['Brazil'], mx: ['Mexico'], ar: ['Argentina'], cl: ['Chile'], pe: ['Peru'], co: ['Colombia'],
  tr: ['Turkey', 'Türkiye'], kz: ['Kazakhstan'], uz: ['Uzbekistan'], az: ['Azerbaijan'], in: ['India'],
  bd: ['Bangladesh'], th: ['Thailand'], vn: ['Vietnam', 'Viet Nam'], id: ['Indonesia'], ph: ['Philippines'],
  de: ['Germany'], at: ['Austria'], ch: ['Switzerland'], fr: ['France'], it: ['Italy'], es: ['Spain'],
  pt: ['Portugal'], pl: ['Poland'], cz: ['Czechia', 'Czech Republic', 'Czech Rep.'], gr: ['Greece'],
  ro: ['Romania'], ca: ['Canada'], au: ['Australia'], jp: ['Japan'],
};
const ISO_BY_NAME = {};
Object.entries(GEO_NAMES).forEach(([iso, names]) => names.forEach((n) => { ISO_BY_NAME[n] = iso; }));

/* camera distance tuned to country size */
const ALT = { ca: 2.1, br: 1.9, au: 1.9, kz: 1.7, ar: 1.7, in: 1.6, mx: 1.6, id: 1.7 };
const HUBS = ['br', 'mx', 'ar', 'de', 'tr', 'kz', 'in', 'th'];

export const initGlobe = (host) => {
  if (!host || !window.WebGLRenderingContext) return null;

  const world = Globe({ animateIn: false, rendererConfig: { alpha: true, antialias: true } })(host)
    .backgroundColor('rgba(0,0,0,0)')
    .width(host.clientWidth)
    .height(host.clientHeight || host.clientWidth)
    .showAtmosphere(true)
    .atmosphereColor('#2ea664')
    .atmosphereAltitude(0.16)
    .pointOfView({ lat: -14, lng: -52, altitude: 1.9 }, 0);

  const mat = world.globeMaterial();
  mat.color.set('#0b100d');
  mat.emissive.set('#06170e');
  mat.emissiveIntensity = 0.45;
  mat.shininess = 8;

  const controls = world.controls();
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.5;
  controls.enableZoom = false;
  controls.enablePan = false;

  /* pause rendering offscreen */
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) world.resumeAnimation(); else world.pauseAnimation();
  }, { rootMargin: '120px' });
  io.observe(host);

  new ResizeObserver(() => {
    world.width(host.clientWidth).height(host.clientHeight || host.clientWidth);
  }).observe(host);

  let meta = null;
  let featureByIso = {};
  let pendingIso = null;
  let resumeSpin = null;

  Promise.all([
    fetch(metaUrl).then((r) => r.json()),
    fetch(topoUrl).then((r) => r.json()),
  ]).then(([m, topo]) => {
    meta = m;
    const land = feature(topo, topo.objects.countries).features
      .filter((f) => f.properties.name !== 'Antarctica');
    land.forEach((f) => {
      const iso = ISO_BY_NAME[f.properties.name];
      if (iso) featureByIso[iso] = f;
    });

    /* h3 rejects some rings (antimeridian crossers, odd data like the
       110m North Korea ring) — probe each part and keep only what it
       can hex. None of our 30 GEOs are affected. */
    const hexable = (p) => { try { polygonToCells(p, 3, true); return true; } catch { return false; } };
    const hexLand = land
      .map((f) => {
        const g = f.geometry;
        if (g.type === 'Polygon') return hexable(g.coordinates) ? f : null;
        const parts = g.coordinates.filter(hexable);
        if (!parts.length) return null;
        return { ...f, geometry: { type: 'MultiPolygon', coordinates: parts } };
      })
      .filter(Boolean);

    world
      .hexPolygonsData(hexLand)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.55)
      .hexPolygonAltitude(0.004)
      .hexPolygonColor(() => 'rgba(74, 189, 120, 0.55)')

      /* selected country: raised true-shape polygon */
      .polygonsData([])
      .polygonCapColor(() => 'rgba(140, 255, 192, 0.26)')
      .polygonSideColor(() => 'rgba(46, 166, 100, 0.30)')
      .polygonStrokeColor(() => '#8cffc0')
      .polygonAltitude(0.016)
      .polygonsTransitionDuration(reduced ? 0 : 500)

      /* ripple rings at the focused centroid */
      .ringColor(() => (t) => `rgba(140, 255, 192, ${Math.max(0, 1 - t)})`)
      .ringMaxRadius(5.5)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1200)
      .ringAltitude(0.018)

      /* idle traffic arcs between hub markets */
      .arcColor(() => ['rgba(46,166,100,0)', 'rgba(140,231,176,0.9)'])
      .arcStroke(0.32)
      .arcAltitudeAutoScale(0.38)
      .arcDashLength(0.4)
      .arcDashGap(1.6)
      .arcDashInitialGap(() => Math.random() * 2)
      .arcDashAnimateTime(2800)
      .arcsTransitionDuration(0);

    if (!reduced) {
      const arcs = [];
      for (let i = 0; i < 7; i++) {
        const a = meta.centroids[HUBS[i % HUBS.length]];
        const b = meta.centroids[HUBS[(i + 2 + (i % 3)) % HUBS.length]];
        arcs.push({ startLat: a[1], startLng: a[0], endLat: b[1], endLng: b[0] });
      }
      world.arcsData(arcs);
    }

    if (pendingIso) focus(pendingIso);
  });

  const focus = (iso) => {
    if (!meta) { pendingIso = iso; return; }
    pendingIso = null;
    resumeSpin?.kill();
    const f = iso && featureByIso[iso];
    if (!f || !meta.centroids[iso]) {
      world.polygonsData([]).ringsData([]);
      controls.autoRotate = !reduced;
      return;
    }
    const [lng, lat] = meta.centroids[iso];
    controls.autoRotate = false;
    world.polygonsData([f]);
    world.ringsData(reduced ? [] : [{ lat, lng }]);
    world.pointOfView({ lat, lng, altitude: ALT[iso] || 1.5 }, reduced ? 0 : 1500);
    resumeSpin = gsap.delayedCall(9, () => { controls.autoRotate = !reduced; });
  };

  return { focus };
};
