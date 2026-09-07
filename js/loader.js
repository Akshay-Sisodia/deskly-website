const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function outroLoader(el) {
  await new Promise((resolve) => {
    if (!window.gsap || !el) {
      if (el) el.style.display = 'none';
      resolve();
      return;
    }
    gsap.to(el, {
      autoAlpha: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => {
        el.style.display = 'none';
        resolve();
      },
    });
  });
}

/** Quiet cover until fonts + scene textures are ready. No percent / ceremony. */
export function createCinematicLoader() {
  const el = document.getElementById('loader');

  return {
    async fonts() {
      if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
      await frame();
    },
    async mark() {
      await frame();
    },
    async finish() {
      await outroLoader(el);
    },
  };
}

export const nextFrame = frame;
