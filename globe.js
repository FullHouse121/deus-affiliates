/* DEUS globe — dotted 3D earth, spins to the selected GEO and lights its shape.
   Land dots are sampled client-side from a country-coded raster mask
   (assets/globe-mask.png: R 1..30 = GEO index+1, 255 = other land). */
import * as THREE from 'three';
import gsap from 'gsap';
import maskUrl from './assets/globe-mask.png?url';
import metaUrl from './assets/globe-meta.json?url';

const D2R = Math.PI / 180;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const latLngToVec3 = (lat, lng, r) => {
  const phi = lat * D2R;
  const lam = lng * D2R;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.sin(lam),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lam),
  );
};

/* quaternion that brings (lat,lng) to face the camera (+z) */
const focusQuat = (lat, lng) => {
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -lng * D2R);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lat * D2R);
  return qx.multiply(qy);
};

const sampleDots = (img, count) => {
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const GA = Math.PI * (3 - Math.sqrt(5));
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const lat = Math.asin(y) / D2R;
    if (lat < -60 || lat > 84) continue;
    const lng = ((((i * GA) % (2 * Math.PI)) / Math.PI) * 180 + 540) % 360 - 180;
    const mx = Math.min(w - 1, Math.round(((lng + 180) / 360) * w));
    const my = Math.min(h - 1, Math.round(((90 - lat) / 180) * h));
    const v = px[(my * w + mx) * 4];
    if (v === 0) continue;
    out.push([lng, lat, v === 255 ? -1 : v - 1]);
  }
  return out;
};

export const initGlobe = (host) => {
  if (!host || !window.WebGLRenderingContext) return null;
  const canvas = host.querySelector('.globe__canvas');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
  camera.position.set(0, 0, 2.8);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const globe = new THREE.Group();
  globe.quaternion.copy(focusQuat(-15, -52)); /* opening view: Brazil */
  scene.add(globe);

  /* core sphere — fresnel-lit deep green, defines the limb */
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.99, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vE = normalize(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vE)), 2.6);
          float l = 0.5 + 0.5 * max(dot(vN, normalize(vec3(-0.4, 0.55, 0.85))), 0.0);
          vec3 base = mix(vec3(0.024, 0.037, 0.030), vec3(0.045, 0.070, 0.055), l);
          vec3 rim = vec3(0.10, 0.38, 0.22) * f;
          gl_FragColor = vec4(base + rim, 1.0);
        }`,
    }),
  );
  globe.add(core);

  /* atmosphere — soft outer halo */
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position * 1.22, 1.0);
          vN = normalize(normalMatrix * normal);
          vE = normalize(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vE)), 6.0);
          gl_FragColor = vec4(vec3(0.16, 0.62, 0.37) * f, f * 0.85);
        }`,
    }),
  );
  scene.add(atmo);

  /* target ring — pulses over the focused country */
  const marker = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x8cffc0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.052, 0.06, 48), ringMat);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.032, 48), ringMat.clone());
  marker.add(ring, ring2);
  marker.visible = false;
  globe.add(marker);

  const selUniform = { value: -1 };
  const timeUniform = { value: 0 };
  let meta = null;

  Promise.all([
    fetch(metaUrl).then((r) => r.json()),
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = maskUrl; }),
  ]).then(([m, img]) => {
    meta = m;
    const dots = sampleDots(img, 150000);
    const n = dots.length;
    const pos = new Float32Array(n * 3);
    const aId = new Float32Array(n);
    const aRnd = new Float32Array(n);
    const v = new THREE.Vector3();
    dots.forEach(([lng, lat, idx], i) => {
      v.copy(latLngToVec3(lat, lng, 1));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      aId[i] = idx;
      aRnd[i] = Math.random();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aId', new THREE.BufferAttribute(aId, 1));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uSel: selUniform, uTime: timeUniform, uPx: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute float aId; attribute float aRnd;
        uniform float uSel; uniform float uTime; uniform float uPx;
        varying float vHi; varying float vShade; varying float vTw;
        void main() {
          vHi = (uSel > -0.5 && abs(aId - uSel) < 0.5) ? 1.0 : 0.0;
          vec3 nrm = normalize(normalMatrix * position);
          vShade = 0.42 + 0.58 * max(dot(nrm, normalize(vec3(-0.35, 0.5, 0.82))), 0.0);
          vTw = 0.85 + 0.15 * sin(uTime * 1.4 + aRnd * 6.2831);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = vHi * (0.5 + 0.5 * sin(uTime * 2.6 + aRnd * 6.2831));
          gl_PointSize = (1.55 + vHi * (0.9 + 0.35 * pulse)) * uPx * (2.7 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vHi; varying float vShade; varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.28, length(c));
          vec3 dim = vec3(0.15, 0.52, 0.31) * vShade * vTw;
          vec3 hot = vec3(0.60, 1.0, 0.75);
          gl_FragColor = vec4(mix(dim, hot, vHi), a * (0.45 + 0.55 * vShade + vHi * 0.4));
        }`,
    });
    globe.add(new THREE.Points(geo, mat));
    if (pendingIso) focus(pendingIso);
  });

  /* render loop — only while on screen */
  let visible = false;
  let idle = true;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.Quaternion();
  const clock = new THREE.Clock();
  const tick = () => {
    if (!visible) return;
    const dt = clock.getDelta();
    timeUniform.value += dt;
    if (idle && !reduced) {
      spin.setFromAxisAngle(yAxis, dt * 0.05);
      globe.quaternion.premultiply(spin);
    }
    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) clock.getDelta(); }, { rootMargin: '120px' });
  io.observe(host);

  const size = () => {
    const w = host.clientWidth;
    const h = host.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  new ResizeObserver(size).observe(host);

  /* drag to explore */
  let dragging = false, px = 0, py = 0, pitch = 0;
  host.addEventListener('pointerdown', (e) => { dragging = true; idle = false; px = e.clientX; py = e.clientY; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - px) * 0.0045;
    const dy = (e.clientY - py) * 0.0045;
    px = e.clientX; py = e.clientY;
    globe.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(yAxis, dx));
    const np = THREE.MathUtils.clamp(pitch + dy, -0.7, 0.7);
    globe.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), np - pitch));
    pitch = np;
  });
  const endDrag = () => { dragging = false; gsap.delayedCall(5, () => { if (!dragging) idle = true; }); };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);

  /* public: rotate to a GEO and light it up */
  let pendingIso = null;
  const focus = (iso) => {
    if (!meta) { pendingIso = iso; return; }
    pendingIso = null;
    const idx = iso ? meta.isoList.indexOf(iso) : -1;
    if (idx < 0 || !meta.centroids[iso]) {
      selUniform.value = -1;
      marker.visible = false;
      idle = true;
      return;
    }
    idle = false;
    selUniform.value = idx;
    const [lng, lat] = meta.centroids[iso];

    /* park the marker just above the country, facing out */
    const p = latLngToVec3(lat, lng, 1.012);
    marker.position.copy(p);
    marker.lookAt(p.clone().multiplyScalar(2));
    marker.visible = true;
    gsap.killTweensOf([ring.material, ring2.material, ring.scale]);
    ring.material.opacity = 0; ring2.material.opacity = 0;
    gsap.to([ring.material, ring2.material], { opacity: 0.9, duration: 0.5, delay: reduced ? 0 : 0.9 });
    if (!reduced) {
      gsap.fromTo(ring.scale, { x: 1.7, y: 1.7 }, { x: 1, y: 1, duration: 0.9, delay: 0.9, ease: 'power3.out' });
      gsap.to(ring.scale, { x: 1.28, y: 1.28, duration: 1.1, delay: 1.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }

    const target = focusQuat(lat, lng);
    pitch = lat * D2R;
    if (reduced) { globe.quaternion.copy(target); return; }
    const start = globe.quaternion.clone();
    const proxy = { t: 0 };
    gsap.to(proxy, {
      t: 1,
      duration: 1.5,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => globe.quaternion.slerpQuaternions(start, target, proxy.t),
      onComplete: () => gsap.delayedCall(7, () => { if (!dragging) idle = true; }),
    });
  };

  return { focus };
};
