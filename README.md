# Deskly — A Room for What's Next

A continuous scroll-driven cinematic website for **Deskly India** (premium meeting rooms, Royapettah, Chennai). Not a landing page — a short architectural film the visitor controls: darkness → doorway → atelier → through glass → big room → screen sign-off → pricing → booking.

Content (rooms, prices, contact, address) is ported from the live site so this repo is the enhanced replacement.

## Run it

Static files + ES modules — serve over HTTP (module scripts block `file://`):

```bash
npx serve .
# or
node server.cjs   # zero-dependency server on http://localhost:3000
```

Then open the URL and scroll slowly.

## Stack

- **Three.js** (procedural architectural set, PBR + RoomEnvironment IBL, baked shadows)
- **GSAP ScrollTrigger + Lenis** on one shared RAF loop (`scrub: true`, transform/opacity only)
- **EffectComposer**: bloom → warm grade/vignette → output (auto-degrades to direct render on weak GPUs)
- No build step, no framework.

## Structure

| File | What lives here |
|---|---|
| `index.html` | Story slates, booking inquiry, chapters, HUD, SEO |
| `styles.css` | Editorial type system, film grade overlays, single text stage |
| `main.js` | 3D set, camera pacing map, doors, finale screen, quality tiers |
| `server.cjs` | Dev-only static server |
| `assets/` | Generated cinematic plates + posters (Asset 01–07, reserved for a future video-plate cut) |

## Notes

- Booking is a **real inquiry flow** (`mailto:info@deskly.in`) — no fake availability.
- Real offering: Executive 12 @ ₹900/hr · Conference 16 @ ₹1,200/hr · min 2 hrs · half day −15% · full day −25%.
- Honors `prefers-reduced-motion`; mobile gets reduced geometry, no bloom.
