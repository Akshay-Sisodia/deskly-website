# Deskly — A Room for What's Next

A continuous scroll-driven cinematic website for **Deskly India** (premium meeting rooms, Royapettah, Chennai). Darkness → doorway → atelier → through glass → big room → screen sign-off → pricing → booking.

## Run it

```bash
npm start
# or
node server.cjs
```

Then open http://localhost:3000 and scroll slowly. Serve over HTTP — ES modules block `file://`.

## Stack

- **Three.js** (architectural set, PBR + RoomEnvironment IBL, baked shadows)
- **GSAP ScrollTrigger + Lenis** on one shared RAF loop
- **EffectComposer**: bloom → warm grade/vignette → output (auto-degrades on weak GPUs)
- Vector brand, plates, and icons in `assets/` — no build step

## Structure

| Path | What lives here |
|---|---|
| `index.html` | Story slates, booking inquiry, chapters, HUD |
| `styles.css` | Editorial type, film grade, loader |
| `main.js` | 3D set, camera pacing, doors, finale screen |
| `js/loader.js` | Real load progress (fonts → textures → first frame) |
| `js/textures.js` | Procedural materials + SVG cinematic plates |
| `assets/` | Logo, mark, favicon, icons, screen/art/sky plates |
| `server.cjs` | Dev static server with asset caching |

## Notes

- Booking is a real inquiry (`mailto:info@deskly.in`) — no fake availability.
- Executive 12 @ ₹900/hr · Conference 16 @ ₹1,200/hr · min 2 hrs · half day −15% · full day −25%.
- Honors `prefers-reduced-motion`; mobile gets reduced geometry and no bloom.
- The loader tracks actual work and only holds long enough for a clean fade-in.
