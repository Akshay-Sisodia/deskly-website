const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function paintLoader(count, fill, sub, value, label, shownRef) {
  shownRef.n = Math.max(shownRef.n, Math.min(100, value));
  if (count) count.textContent = String(Math.round(shownRef.n)).padStart(2, '0');
  if (fill) fill.style.transform = `scaleX(${shownRef.n / 100})`;
  if (label && sub) sub.textContent = label;
}

async function outroLoader(el, iris) {
  await new Promise((resolve) => {
    if (!window.gsap || !el) {
      if (el) el.style.display = 'none';
      if (iris) iris.style.opacity = '0';
      resolve();
      return;
    }
    gsap.to(el, {
      autoAlpha: 0,
      duration: 0.8,
      ease: 'power2.inOut',
      onComplete: () => {
        el.style.display = 'none';
        resolve();
      },
    });
    if (iris) gsap.to(iris, { autoAlpha: 0, duration: 1.2, delay: 0.12, ease: 'power2.inOut' });
  });
}

export function createCinematicLoader() {
  const count = document.getElementById('ldCount');
  const fill = document.getElementById('ldBar');
  const sub = document.getElementById('ldSub');
  const el = document.getElementById('loader');
  const iris = document.getElementById('iris');
  const started = performance.now();
  const shown = { n: 0 };
  const paint = (value, label) => paintLoader(count, fill, sub, value, label, shown);

  return {
    async fonts() {
      paint(8, 'Loading type');
      if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
      paint(14, 'Loading type');
      await frame();
    },
    async mark(value, label) {
      paint(value, label);
      await frame();
    },
    async finish() {
      paint(100, 'Welcome in');
      const hold = Math.max(0, 820 - (performance.now() - started));
      await new Promise((resolve) => setTimeout(resolve, hold + 160));
      await outroLoader(el, iris);
    },
  };
}

export const nextFrame = frame;
