# Deskly — meeting rooms in Royapettah, Chennai

Single-page site for **Deskly India**. A short scroll-driven arrival film over a
Three.js set, then a normal document: the two rooms, what's included, rates,
location, and a booking inquiry.

## Run it

```bash
npm start   # or: node server.cjs
```

http://localhost:3000 — serve over HTTP, ES modules block `file://`.

## Stack

- **Three.js** for the hero film only (PBR + RoomEnvironment IBL, baked shadows)
- **EffectComposer**: bloom → split-tone grade → output, on a multisampled
  target; auto-degrades through three quality tiers on weak GPUs
- **GSAP ScrollTrigger + Lenis** on one shared RAF loop
- Native `<select>` / `<input type="date">` / `<input type="time">` — no picker
  libraries
- No build step

## Structure

| Path | What lives here |
|---|---|
| `index.html` | Hero slates, content sections, booking form, LocalBusiness JSON-LD |
| `styles.css` | Type system, layout, film grade |
| `main.js` | 3D set, camera path, slate timing, page behaviour, booking |
| `js/textures.js` | Procedural materials + image/SVG plates |
| `js/loader.js` | Quiet cover until fonts and textures are ready |
| `assets/img/` | Room and city photography |
| `assets/plates/` | Textures painted into the 3D set |
| `server.cjs` | Dev static server with asset caching |

## Notes

- Rooms: Executive 12 @ ₹900/hr · Large Conference 16 @ ₹1,200/hr. Two-hour
  minimum; half day −15%, full day −25%.
- Booking opens a prefilled `mailto:info@deskly.in` — no fake availability, no
  backend.
- The hero film owns `#filmRun` (340vh) and nothing else. Past it the canvas
  stops rendering entirely.
- Honours `prefers-reduced-motion`; mobile drops shadows, bloom and dust.

## Content still to confirm

The following are not on the page because we don't have them: opening hours,
parking, Wi-Fi speed, catering, and the cancellation policy. `assets/img/` is
AI-generated placeholder photography — replace with real shots of B7 & B8.
