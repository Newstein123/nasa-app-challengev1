# Cosmic Time Machine

NASA Space Apps Challenge 2026. Pick a point in the sky, see real survey imagery, and explore what NASA's SPHEREx telescope recorded there. You can compare two visits, follow brightness over time, and see the near-infrared spectrum, all from real SPHEREx pixels with honest labels.

## Run

Requires **Node ≥ 22.12** (see `.nvmrc`).

```bash
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build, served on :3000
npm test                     # unit tests (offline; real saved archive data)
LIVE=1 npm test              # + network tests that check our pixel reader against IRSA's own cutouts
npm run typecheck
CTM_OFFLINE=1 npm run dev    # fallback: region search serves the cached Orion response (analysis still needs network)
```

## What it does

| Step | What you see | Data status |
| --- | --- | --- |
| 1. Choose a region | Aladin Lite atlas (2MASS / DSS2 / AllWISE), search by name, coordinates, click, or preset | Real survey imagery, not SPHEREx |
| SPHEREx observations | Every archive product covering the region; details, footprints, FITS and cutout links | Real archive metadata (IRSA SIA2) |
| 2. Compare observations | Two visits on a common north-up grid: side by side, blink, difference | Real SPHEREx pixels, resampled (derived) |
| Brightness over time | Visits in the same colour channel, across seasons and releases | Derived quick-look measurements |
| Spectrum | Every visit's brightness at its own wavelength, 0.75–5 µm | Derived quick-look measurements |
| Share | Link, Markdown summary, JSON with every source URL | Provenance |

### How the analysis works

- **Measuring a point**: for each SPHEREx Level-2 image that contains the point (QR2 + QR3), the server reads only the needed rows of the 65 MB file with HTTP Range requests (about 2–3 requests and about 150 KB per image). It subtracts the pipeline's zodiacal-light model, drops pixels with bad quality flags (transients, saturation, ghosts, persistence, …), and averages a 3×3 box. The wavelength at that pixel comes from the file's `WAVE-TAB` lookup table.
- **Same colour only**: SPHEREx's filter changes wavelength across the detector, so each visit sees a point in a different colour. Visits are compared only when their wavelengths differ by less than half a channel. The difference view masks every pixel that fails this test.
- **Auto-pick**: the starting pair is the wavelength-matched pair with the point well inside both images, on the same detector, with the longest time between visits. A quick first pass (48 images) shows results in about 15–25 s, and a background pass (up to 192) refines them.
- **Cross-release caveat**: QR2 and QR3 were processed with different pipeline versions. The UI warns whenever a comparison or light curve mixes them.
- **What it does not do**: no automatic change detection, no object classification, no claims. Brightness differences can be noise, artifacts, asteroids or real change.

### Verified against the archive

`src/server/spherexFile.live.test.ts` reads pixels through our Range reader and compares them value by value with IRSA's own cutout service for the same files. One QR3 file has RICE_1-compressed flags and one QR2 file has plain flags; an 81×81 window matches exactly, flags included.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/observations?ra=&dec=&radius=[&collection=]` | SPHEREx products intersecting a circle (degrees, radius ≤ 0.5) |
| `GET /api/observations/:id` | One product by URL-encoded publisher DID |
| `GET /api/surveys` | Background survey layers and attribution |
| `GET /api/resolve?name=` | Object name → position via CDS Sesame, with the CfA mirror as fallback |
| `POST /api/measure` `{ra, dec, urls[≤6]}` | Quick-look brightness and wavelength at a point, per image |
| `GET /api/visit?url=&ra=&dec=[&n=72&scale=6.15]` | One image resampled onto a north-up grid around the point |

## Demo script (2–3 min)

1. **Choose a region**: click **Orion Nebula**. 2MASS imagery and the search circle appear, and the SPHEREx product list fills in.
2. **Compare observations**: after about 20 s, two visits a year apart appear in the same colour. Switch between **Side by side**, **Blink** and **Difference**. Point out the "same colour" check and the cross-release warning.
3. **Investigate**: drag the **wavelength slider**. The light curve and the chosen pair follow it. The spectrum shows Orion's 3.3 µm PAH emission.
4. **Learn and share**: open the "Understand" panel, then **Copy summary**. Every number links back to an archive file.

The Orion preset sits just south of the Trapezium. The core itself saturates SPHEREx, and the app says so if you click it. All presets were checked live on 2026-10-27.
