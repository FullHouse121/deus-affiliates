/* DEUS globe — dotted 3D earth, spins to the selected GEO and lights its shape */
import * as THREE from 'three';
import gsap from 'gsap';
import dotsUrl from './assets/globe-dots.json?url';

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

export const initGlobe = (host) => {
  if (!host || !window.WebGLRenderingContext) return null;
  const canvas = host.querySelector('.globe__canvas');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
  camera.position.set(0, 0, 2.85);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const globe = new THREE.Group();
  globe.quaternion.copy(focusQuat(-15, -52)); /* opening view: Brazil */
  scene.add(globe);

  /* inner sphere occludes back-side dots */
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.992, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x0b100d }),
  );
  globe.add(core);

  /* atmosphere — fresnel glow, additive */
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 48, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position * 1.24, 1.0);
          vN = normalize(normalMatrix * normal);
          vE = normalize(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vE;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vE)), 5.5);
          gl_FragColor = vec4(vec3(0.18, 0.65, 0.39) * f, f * 0.9);
        }`,
    }),
  );
  scene.add(atmo);

  let selUniform = { value: -1 };
  let timeUniform = { value: 0 };
  let meta = null;

  fetch(dotsUrl).then((r) => r.json()).then((data) => {
    meta = data;
    const n = data.dots.length;
    const pos = new Float32Array(n * 3);
    const aId = new Float32Array(n);
    const aRnd = new Float32Array(n);
    const v = new THREE.Vector3();
    data.dots.forEach(([lng, lat, idx], i) => {
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
        varying float vHi; varying float vShade;
        void main() {
          vHi = (uSel > -0.5 && abs(aId - uSel) < 0.5) ? 1.0 : 0.0;
          vec3 nrm = normalize(normalMatrix * position);
          vShade = 0.45 + 0.55 * max(dot(nrm, normalize(vec3(0.3, 0.45, 0.85))), 0.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = vHi * (0.55 + 0.45 * sin(uTime * 3.2 + aRnd * 6.28));
          gl_PointSize = (2.1 + vHi * 1.7 + pulse * 0.7) * uPx * (2.6 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vHi; varying float vShade;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.32, d);
          vec3 dim = vec3(0.16, 0.55, 0.33) * vShade;
          vec3 hot = vec3(0.56, 1.0, 0.72);
          gl_FragColor = vec4(mix(dim, hot, vHi), a * (0.5 + 0.5 * vShade + vHi * 0.35));
        }`,
    });
    globe.add(new THREE.Points(geo, mat));
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
      spin.setFromAxisAngle(yAxis, dt * 0.055);
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
    const qy = new THREE.Quaternion().setFromAxisAngle(yAxis, dx);
    globe.quaternion.premultiply(qy);
    const np = THREE.MathUtils.clamp(pitch + dy, -0.7, 0.7);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), np - pitch);
    pitch = np;
    globe.quaternion.premultiply(qx);
  });
  const endDrag = () => { dragging = false; gsap.delayedCall(5, () => { if (!dragging) idle = true; }); };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);

  /* public: rotate to a GEO and light it up */
  const focus = (iso) => {
    if (!meta) { gsap.delayedCall(0.4, () => focus(iso)); return; }
    const idx = meta.isoList.indexOf(iso);
    if (idx < 0 || !meta.centroids[iso]) { selUniform.value = -1; idle = true; return; }
    idle = false;
    selUniform.value = idx;
    const [lng, lat] = meta.centroids[iso];
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
      onComplete: () => gsap.delayedCall(6, () => { if (!dragging) idle = true; }),
    });
  };

  return { focus };
};
