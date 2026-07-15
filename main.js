/* DEUS Affiliates v3 — interactions */
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { translations } from './i18n.js';

gsap.registerPlugin(ScrollTrigger);

/* ---------------- i18n ----------------
   Text nodes are translated by their English source text; original
   strings are cached so switching back to EN restores them. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
let currentLang = 'en';
const t = (s) => (translations[currentLang] && translations[currentLang][s]) || s;

const textNodes = [];
{
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
      return norm(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let n;
  while ((n = walker.nextNode())) textNodes.push([n, norm(n.nodeValue)]);
}
const attrNodes = [];
document.querySelectorAll('input[placeholder]').forEach((el) => attrNodes.push([el, 'placeholder', el.getAttribute('placeholder')]));
document.querySelectorAll('[aria-label]').forEach((el) => attrNodes.push([el, 'aria-label', el.getAttribute('aria-label')]));

const setLang = (lang) => {
  currentLang = translations[lang] ? lang : 'en';
  const dict = translations[currentLang] || {};
  textNodes.forEach(([node, orig]) => {
    const out = dict[orig] || orig;
    if (norm(node.nodeValue) !== out) node.nodeValue = out;
  });
  attrNodes.forEach(([el, attr, orig]) => el.setAttribute(attr, dict[orig] || orig));
  document.documentElement.lang = currentLang;
  document.querySelectorAll('.lang__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === currentLang));
  try { localStorage.setItem('deus-lang', currentLang); } catch { /* private mode */ }
  if (window.ScrollTrigger) ScrollTrigger.refresh();
};
document.querySelectorAll('.lang__btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
{
  let saved = null;
  try { saved = localStorage.getItem('deus-lang'); } catch { /* private mode */ }
  if (saved && saved !== 'en') setLang(saved);
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer:fine)').matches;
/* cinematic tier: rack focus, drift & sweep only where the GPU can afford it */
const cine = !reduced && finePointer && innerWidth > 900;
document.documentElement.classList.toggle('is-cine', cine);

/* Lenis smooth scroll on GSAP ticker (shared RAF) */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1 });
  window.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* Nav scroll state */
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* Scroll progress line under the nav */
gsap.fromTo('.nav__progress', { scaleX: 0 }, {
  scaleX: 1,
  ease: 'none',
  scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
});

/* Fixed backdrop drifts slower than the page — depth without clutter */
if (!reduced) {
  gsap.fromTo('.backdrop img', { yPercent: -2.5 }, {
    yPercent: 2.5,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.6 },
  });
}

/* Mobile menu (scroll-locked, focus-trapped, Escape to close) */
const burger = document.querySelector('.nav__burger');
const mobileMenu = document.querySelector('.mobile-menu');
const lockScroll = (lock) => {
  document.body.style.overflow = lock ? 'hidden' : '';
  if (lenis) lock ? lenis.stop() : lenis.start();
};
const menuOpen = () => mobileMenu.classList.contains('is-open');
const setMenu = (open) => {
  nav.classList.toggle('is-menu-open', open);
  mobileMenu.classList.toggle('is-open', open);
  mobileMenu.setAttribute('aria-hidden', String(!open));
  burger.setAttribute('aria-expanded', String(open));
  lockScroll(open);
  if (open) mobileMenu.querySelector('a')?.focus();
  else burger.focus();
};
burger.addEventListener('click', () => setMenu(!menuOpen()));
mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (!menuOpen()) return;
  if (e.key === 'Escape') { setMenu(false); return; }
  if (e.key !== 'Tab') return;
  const focusables = [burger, ...mobileMenu.querySelectorAll('a')];
  const i = focusables.indexOf(document.activeElement);
  const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i === focusables.length - 1 ? 0 : i + 1);
  focusables[next].focus();
  e.preventDefault();
});

/* Smooth anchor scrolling (Lenis-aware) */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -70, duration: 1.2 });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
});

/* Intro loader → cinematic cold open */
const loader = document.querySelector('.loader');

/* idle cinematography: perpetual Ken Burns drift + anamorphic light sweep */
const startIdleCinema = () => {
  if (!cine) return;
  gsap.to('.hero__bg', { scale: 1.05, duration: 22, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to('.hero__bg', { xPercent: 0.6, duration: 29, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.fromTo('.hero__sweep', { xPercent: -120 }, {
    xPercent: 120, duration: 2.6, ease: 'power2.inOut', repeat: -1, repeatDelay: 6.4, delay: 2.5,
  });
};

/* exit shot: scrolling away pushes the camera in, defocuses and cuts to black */
const startExitShot = () => {
  const scrub = { trigger: '.hero', start: 'top top', end: 'bottom 15%', scrub: true };
  gsap.to('.hero__fade', { opacity: 1, ease: 'none', scrollTrigger: scrub });
  gsap.to('.hero__poster', { scale: 1.14, ease: 'none', immediateRender: false, scrollTrigger: scrub });
  if (cine) gsap.to(document.documentElement, { '--cineblur': '13px', ease: 'none', scrollTrigger: scrub });
  // the CTA answers with the mirrored shot: it settles into focus as it enters
  gsap.fromTo('.cta__poster', { scale: 1.12 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: '.cta', start: 'top 95%', end: 'top 25%', scrub: true },
  });
};

const heroEntrance = () => {
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: () => { startIdleCinema(); startExitShot(); } });
  // cold open: extreme close-up on the DEUSMACHINE bar → dolly out
  gsap.set('.hero__poster', { transformOrigin: '50% 55%' });
  gsap.set('.hero__bar', { yPercent: 0 }); // letterbox on for the opening shot
  tl.fromTo('.hero__poster', { scale: 2.4 }, { scale: 1, duration: 2.1, ease: 'expo.out' }, 0)
    .from('.hero__poster', { opacity: 0, duration: 0.5, ease: 'power1.out' }, 0);
  if (cine) tl.fromTo(document.documentElement, { '--cineblur': '18px' }, { '--cineblur': '5px', duration: 2.1, ease: 'expo.out' }, 0);
  tl.to('.hero__bar--top', { yPercent: -101, duration: 1.05, ease: 'power4.inOut' }, 0.6)
    .to('.hero__bar--bottom', { yPercent: 101, duration: 1.05, ease: 'power4.inOut' }, 0.6)
    .to('.hero__title .l > span', { y: 0, duration: 1.15, stagger: 0.09 }, 0.55)
    .fromTo('.hero__sub', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, 1.0)
    .fromTo('.hero__cta', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, 1.12);
};
/* returning visitors in the same session skip the loader + full cold open */
const returning = (() => {
  try {
    const seen = sessionStorage.getItem('deus-seen');
    sessionStorage.setItem('deus-seen', '1');
    return !!seen;
  } catch { return false; }
})();

const heroQuickEntrance = () => {
  gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { startIdleCinema(); startExitShot(); } })
    .from('.hero__poster', { scale: 1.12, opacity: 0, duration: 0.9, ease: 'power2.out' }, 0)
    .to('.hero__title .l > span', { y: 0, duration: 0.8, stagger: 0.06 }, 0.05)
    .fromTo('.hero__sub', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 0.3)
    .fromTo('.hero__cta', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 0.4);
};

if (!reduced && returning) {
  loader.remove();
  heroQuickEntrance();
} else if (!reduced) {
  const loaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((r) => addEventListener('load', r, { once: true }));
  const ready = Promise.race([
    Promise.all([document.fonts.ready, loaded]),
    new Promise((r) => setTimeout(r, 1400)),
  ]);
  ready.then(() => {
    gsap.timeline({ onComplete: () => loader.remove() })
      .to('.loader__logo', { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
      .to('.loader__logo', { opacity: 0, y: -14, duration: 0.3, ease: 'power2.in', delay: 0.25 })
      .to(loader, { yPercent: -100, duration: 0.55, ease: 'power4.inOut' }, '-=0.05')
      .add(heroEntrance, '-=0.45');
  });
} else {
  loader.remove();
  document.querySelectorAll('.hero__title .l > span').forEach(el => el.style.transform = 'none');
  document.querySelectorAll('.hero__sub, .hero__cta').forEach(el => el.style.opacity = 1);
}

/* Poster mouse parallax (bw + color layers move as one so they stay aligned) */
const posters = Array.from(document.querySelectorAll('.hero__poster'));
if (posters.length && !reduced && finePointer) {
  const movers = posters.map((el) => {
    gsap.set(el, { xPercent: -50, yPercent: -50 });
    return {
      qx: gsap.quickTo(el, 'x', { duration: 1.4, ease: 'power3.out' }),
      qy: gsap.quickTo(el, 'y', { duration: 1.4, ease: 'power3.out' }),
    };
  });
  addEventListener('mousemove', (e) => {
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    movers.forEach(({ qx, qy }) => { qx(nx * -22); qy(ny * -16); });
  }, { passive: true });
}

/* Cursor spotlight — reveals a color halftone layer through a radial mask.
   Used on the hero and the CTA (bookends of the page). */
const attachSpotlight = (container, layer) => {
  if (!container || !layer) return;
  const mx = gsap.quickTo(layer, '--mx', { duration: 0.45, ease: 'power3.out' });
  const my = gsap.quickTo(layer, '--my', { duration: 0.45, ease: 'power3.out' });
  const spotRadius = () => Math.min(innerWidth * 0.2, 280);

  // rect cached per hover; invalidated on scroll/resize so mousemove stays layout-read-free
  let rect = null;
  const getRect = () => rect || (rect = container.getBoundingClientRect());
  addEventListener('scroll', () => { rect = null; }, { passive: true });
  addEventListener('resize', () => { rect = null; });

  container.addEventListener('mouseenter', (e) => {
    rect = null;
    const r = getRect();
    // jump the center to the entry point so the circle doesn't sweep in from a stale spot
    gsap.set(layer, { '--mx': `${e.clientX - r.left}px`, '--my': `${e.clientY - r.top}px` });
    gsap.to(layer, { '--mr': `${spotRadius()}px`, duration: 0.7, ease: 'power3.out', overwrite: 'auto' });
  });
  container.addEventListener('mousemove', (e) => {
    const r = getRect();
    mx(e.clientX - r.left);
    my(e.clientY - r.top);
  }, { passive: true });
  container.addEventListener('mouseleave', () => {
    gsap.to(layer, { '--mr': '0px', duration: 0.5, ease: 'power2.inOut', overwrite: 'auto' });
  });
};
if (!reduced && finePointer) {
  attachSpotlight(document.querySelector('.hero'), document.querySelector('.hero__layer--color'));
  attachSpotlight(document.querySelector('.cta'), document.querySelector('.cta__layer--color'));
}

/* Magnetic buttons (fine pointers, rect cached per hover) */
if (!reduced && finePointer) {
  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    const sx = gsap.quickTo(btn, 'x', { duration: 0.35, ease: 'power3.out' });
    const sy = gsap.quickTo(btn, 'y', { duration: 0.35, ease: 'power3.out' });
    let rect = null;
    btn.addEventListener('mouseenter', () => { rect = btn.getBoundingClientRect(); });
    btn.addEventListener('mousemove', (e) => {
      if (!rect) rect = btn.getBoundingClientRect();
      sx((e.clientX - rect.left - rect.width / 2) * 0.22);
      sy((e.clientY - rect.top - rect.height / 2) * 0.3);
    });
    btn.addEventListener('mouseleave', () => { rect = null; sx(0); sy(0); });
  });
}

/* Section & CTA titles — masked rise (echoes the hero headline) */
if (!reduced) {
  gsap.utils.toArray('.section__title, .cta__title').forEach((t) => {
    gsap.fromTo(t,
      { clipPath: 'inset(0% 0% 100% 0%)', y: 44 },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        y: 0,
        duration: 1.05,
        ease: 'power4.out',
        scrollTrigger: { trigger: t, start: 'top 88%', once: true },
      });
  });
}

/* Scroll reveals — grids stagger as choreographed groups, the rest one-by-one */
const batchGroups = ['.bento > .bcell', '.deals > .deal', '.features > .feature', '.team__grid > .tcard', '.products > .product', '.steps > .step', '.tlist > .tlist__row', '.confs > .conf', '.faq > .faq__item'];
const batched = new Set();
if (!reduced) {
  batchGroups.forEach((sel) => {
    const items = gsap.utils.toArray(sel);
    if (!items.length) return;
    items.forEach((el) => batched.add(el));
    gsap.set(items, { y: 30, opacity: 0 });
    ScrollTrigger.batch(items, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true }),
    });
  });
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    if (batched.has(el)) return;
    gsap.from(el, {
      y: 30,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

/* Stat counters */
if (!reduced) {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = parseInt(el.dataset.count, 10);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString('en-US').replace(/,/g, ' '); },
    });
  });
} else {
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = parseInt(el.dataset.count, 10).toLocaleString('en-US').replace(/,/g, ' ');
  });
}

/* FAQ accordion (one open at a time) */
const faqItems = Array.from(document.querySelectorAll('.faq__item'));
faqItems.forEach((item) => {
  const q = item.querySelector('.faq__q');
  q.addEventListener('click', () => {
    const willOpen = !item.classList.contains('is-open');
    faqItems.forEach((it) => {
      it.classList.remove('is-open');
      it.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
    });
    if (willOpen) {
      item.classList.add('is-open');
      q.setAttribute('aria-expanded', 'true');
    }
  });
});

/* Growth chart — draws itself in, then keeps breathing like a live feed */
const chartLine = document.querySelector('.chartline');
if (chartLine && !reduced) {
  // same point count as the markup paths, endpoints pinned so node/badge stay put
  const LINE_B = 'M0,152 L50,146 L100,132 L150,126 L200,94 L250,82 L300,50 L350,34 L386,14';
  const AREA_B = LINE_B.replace('M', 'M') + ' L386,170 L0,170 Z';
  const len = chartLine.getTotalLength();
  gsap.set(chartLine, { strokeDasharray: len, strokeDashoffset: len });
  gsap.set('.chartarea', { opacity: 0 });
  gsap.set('.chartnode, .chartlab--end', { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' });
  gsap.timeline({ scrollTrigger: { trigger: '.bcell--chart', start: 'top 78%', once: true } })
    .to(chartLine, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' })
    .to('.chartarea', { opacity: 1, duration: 0.7, ease: 'power2.out' }, '-=0.5')
    .to('.chartnode, .chartlab--end', { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.5)' }, '-=0.25')
    .call(() => {
      gsap.set(chartLine, { strokeDasharray: 'none' }); // free the path for morphing
      gsap.to(chartLine, { attr: { d: LINE_B }, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to('.chartarea', { attr: { d: AREA_B }, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
}

/* GEO map — beacons pop in staggered; chips light up their pin */
if (!reduced) {
  const pins = gsap.utils.toArray('.geopin');
  if (pins.length) {
    gsap.from(pins, {
      scale: 0,
      opacity: 0,
      duration: 0.5,
      ease: 'back.out(2.5)',
      stagger: 0.09,
      scrollTrigger: { trigger: '.geomap', start: 'top 70%', once: true },
    });
  }
}
/* traffic arcs — each route draws, holds, fades, repeats */
if (!reduced) {
  document.querySelectorAll('.geoarcs path').forEach((arc, i) => {
    const len = arc.getTotalLength();
    gsap.set(arc, { strokeDasharray: len, strokeDashoffset: len });
    gsap.timeline({
      repeat: -1,
      repeatDelay: 2.4,
      delay: i * 0.85,
      scrollTrigger: { trigger: '.geomap', start: 'top 78%', once: true },
    })
      .to(arc, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' })
      .to(arc, { opacity: 0, duration: 0.6 }, '+=0.9')
      .set(arc, { strokeDashoffset: len, opacity: 0.4 });
  });
}

/* transmission wave — roams from hub to hub */
const geowave = document.querySelector('.geowave');
const geopins = gsap.utils.toArray('.geopin');
if (geowave && geopins.length && !reduced) {
  let wi = 0;
  const fireWave = () => {
    const pin = geopins[wi % geopins.length];
    wi += 1;
    geowave.style.left = pin.style.left;
    geowave.style.top = pin.style.top;
    gsap.fromTo(geowave, { scale: 0.12, opacity: 0.6 }, {
      scale: 1, opacity: 0, duration: 1.8, ease: 'power1.out',
      onComplete: () => gsap.delayedCall(2.4, fireWave),
    });
  };
  ScrollTrigger.create({ trigger: '.geomap', start: 'top 78%', once: true, onEnter: fireWave });
}

/* hologram tilt — the map leans toward the cursor (desktop) */
if (cine) {
  const gm = document.querySelector('.geomap');
  if (gm) {
    gsap.set(gm, { transformPerspective: 900 });
    const rx = gsap.quickTo(gm, 'rotationX', { duration: 0.8, ease: 'power3.out' });
    const ry = gsap.quickTo(gm, 'rotationY', { duration: 0.8, ease: 'power3.out' });
    let rect = null;
    gm.addEventListener('mouseenter', () => { rect = gm.getBoundingClientRect(); });
    gm.addEventListener('mousemove', (e) => {
      if (!rect) rect = gm.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      ry(nx * 5);
      rx(ny * -5);
    }, { passive: true });
    gm.addEventListener('mouseleave', () => { rect = null; rx(0); ry(0); });
  }
}

document.querySelectorAll('.geochips span[data-geo]').forEach((chip) => {
  const pin = document.querySelector(`.geopin[data-geo="${chip.dataset.geo}"]`);
  if (!pin) return;
  chip.addEventListener('mouseenter', () => pin.classList.add('is-hot'));
  chip.addEventListener('mouseleave', () => pin.classList.remove('is-hot'));
});

/* Signup form — AJAX submit to Netlify Forms, inline success state */
const signupForm = document.querySelector('.signup');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = signupForm.querySelector('.signup__submit');
    signupForm.querySelector('.signup__error')?.remove();
    btn.disabled = true;
    btn.textContent = t('Sending…');
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(signupForm)).toString(),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      signupForm.innerHTML = `
        <div class="signup__done">
          <h3>${t('Application received')}</h3>
          <p>${t('Your personal manager will reach out within 24 hours.')}<br />
          ${t('Want to move faster? Write to')} <a href="https://t.me/deusaffiliates" target="_blank" rel="noopener">@deusaffiliates</a> ${t('right now.')}</p>
        </div>`;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = t('Send application');
      const p = document.createElement('p');
      p.className = 'signup__error';
      p.setAttribute('role', 'alert');
      p.innerHTML = `${t('Something went wrong. Please try again, or write to')} <a href="https://t.me/deusaffiliates" target="_blank" rel="noopener">@deusaffiliates</a> ${t('on Telegram.')}`;
      signupForm.appendChild(p);
    }
  });
}

/* Floating buttons — back-to-top appears after one viewport of scroll */
const topFab = document.querySelector('.fab--top');
if (topFab) {
  const toggleFab = () => { topFab.hidden = window.scrollY < innerHeight * 0.9; };
  addEventListener('scroll', toggleFab, { passive: true });
  toggleFab();
  topFab.addEventListener('click', () => {
    if (lenis) lenis.scrollTo(0, { duration: 1.1 });
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
}

/* Active nav link tracking */
{
  const links = Array.from(document.querySelectorAll('.nav__links a'));
  const setActive = (hash) => links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === hash));
  ['#advantages', '#products', '#how', '#traffic', '#conferences', '#faq'].forEach((hash) => {
    const sec = document.querySelector(hash);
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 45%',
      end: 'bottom 45%',
      onToggle: (self) => { if (self.isActive) setActive(hash); },
    });
  });
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom 45%',
    onToggle: (self) => { if (self.isActive) setActive('#top'); },
  });
}
