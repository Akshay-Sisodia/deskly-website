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

## Design system

Light theme, benchmarked against what premium hospitality/design sites actually
ship (measured via computed styles, not trend pieces):

- **Type** — EB Garamond (display) + Manrope (text). Hermès's exact stack; both
  free. Old-style serifs dominate the reference set — Caslon at Norm Architects,
  Cardo at Soho House, Lyon at Aman — not didones.
- **Palette — chalk, ink, pine.** `#f4f3ee` paper, `#1e211d` ink, `#1b3a2f`
  accent. Two things this fixes over the first benchmark-derived set: Aman's
  `#f3eee7` bone is a warm beige, and a near-black accent left the palette with
  no colour identity at all. Pine is the one colour Rosewood allows itself
  (`#013d2d` on their buttons). Still **no metallic** — none of the references
  use one. Every reference page is light; none are dark.
- **Hero pattern, measured off the references.** Rosewood, Singita, Nihi and
  Aethos all run large white type, centred, with *no* text-shadow and no scrim,
  over an atmospheric image, under a light page. So the film stays a warm
  lamp-lit interior with its own `--film-ink`, and the document stays bone.
  Dark ink over a bright render is unwinnable without a scrim — don't retry it.
- **Nav is transparent and inverts** at `body.past-film`: ivory over the film,
  ink over the page. Same as Singita/Nihi.
- **One surface.** No alternating section bands; the hairline rule separates
  them.
- **The hero exits by scroll, not crossfade.** Singita's hero is
  `position:static` and simply scrolls away. Cross-dissolving a dark film into
  bone mixes values and goes muddy, so the film parallaxes up while the page
  rises over it — crisp edge, no wash.
- Relighting for daylight meant: sky-dominant hemisphere bounce, near-neutral
  (not blue) sky so the woods don't read grey, lamps demoted to accents,
  emissive strips and bulbs pulled back near 1.0, bloom to .06 at a .98
  threshold, fog density 0.022 -> 0.005, and no additive haze plane. Every one
  of those was a visible source of milkiness.
- Camera FOV widens in portrait (`fovFor`) — a fixed 50° vertical crops
  horizontally on phones and the door filled the frame.
- The wordmark is text, not an asset — letterspaced caps in the display face,
  as Rosewood and Aman do. `assets/logo.svg` is gone.

## Notes

- Rooms: Executive 12 @ ₹900/hr · Large Conference 16 @ ₹1,200/hr. Two-hour
  minimum; half day −15%, full day −25%.
- Booking opens a prefilled `mailto:info@deskly.in` — no fake availability, no
  backend.
- The hero film owns `#filmRun` (340vh) and nothing else. Past it the canvas
  stops rendering entirely.
- Honours `prefers-reduced-motion`; mobile drops shadows, bloom and dust.
- Slate scrims are stronger on mobile: a portrait frame is filled by its
  subject, so the desktop scrim can't lift geometry behind the type.

## Content still to confirm

The following are not on the page because we don't have them: opening hours,
parking, Wi-Fi speed, catering, and the cancellation policy. `assets/img/` is
AI-generated placeholder photography — replace with real shots of B7 & B8.
