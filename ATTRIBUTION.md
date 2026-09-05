# Data Sources & Attribution

`NOTICE` promises this file. It covers **data and bundled assets** — the code's
license is AGPL-3.0-or-later, in `LICENSE`.

## The authoritative list is the running site, not this file

Which upstreams actually reach a given surface changes as the pipeline changes,
and a hand-maintained list here would drift out of date without anything
failing. The live catalogue is `/data-sources` on the running site
(`src/pages/DataSources.tsx`), rendered from the published catalogue rather than
from a constant. **Read that for what is in use today.** This file exists to
name licenses and required attribution statements, which do not drift.

## Live measurement and model data

This app does not call upstream providers directly. It reads snapshots
published by the AirLens pipeline to the Hugging Face dataset
[`Robeedau/airlens-live`](https://huggingface.co/datasets/Robeedau/airlens-live)
(`src/lib/config/dataSources.ts`). Attribution therefore passes through to the
providers behind those snapshots:

| Source | License | Required attribution |
|---|---|---|
| [OpenAQ](https://openaq.org) | CC BY 4.0 | Data from OpenAQ. |
| [Sensor.Community](https://sensor.community) | ODbL 1.0 | Data from Sensor.Community contributors. |
| [Open-Meteo](https://open-meteo.com) | CC BY 4.0 | Data from Open-Meteo.com. |
| [CAMS (Copernicus Atmosphere Monitoring Service)](https://atmosphere.copernicus.eu) | CC BY 4.0 | **"Generated using Copernicus Atmosphere Monitoring Service information 2026."** The wording is specified by the licence, not optional — reproduce it verbatim wherever CAMS-derived forecasts are shown. |
| [NOAA GEFS-Aerosols](https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gefs.php) | Public Domain (U.S. Government work) | NOAA/NCEP GEFS-Aerosols. |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | Public Domain (U.S. Government work) | NASA LANCE FIRMS. |

**Open-Meteo's free tier is non-commercial.** A commercial deployment of this
software needs a paid Open-Meteo subscription — that obligation travels with the
code, not just with this deployment.

## Geographic data committed to this repository

| File | Source | License | Required attribution |
|---|---|---|---|
| `public/data/countries-50m.json` | [world-atlas](https://github.com/topojson/world-atlas), derived from [Natural Earth](https://www.naturalearthdata.com) | ISC (world-atlas) over public-domain Natural Earth | Made with Natural Earth. |
| `public/geo/seoul-districts.json` | KOSTAT (Statistics Korea) 2013 census administrative-division geodata, via [southkorea/seoul-maps](https://github.com/southkorea/seoul-maps) | Apache-2.0 per that repo's README (no separate `LICENSE`/`NOTICE` file exists upstream to reproduce) | Confirmed by matching the 25-feature set, `base_year: "2013"`, and `code`/`name`/`name_eng`/`base_year` property schema against the repo's KOSTAT-2013 municipality layer (simplified via MapShaper, per its README). The file already self-documents this as a GeoJSON foreign member — see its top-level `attribution` key — since it was first committed (`apps/landing-lab` history, 2026-07-15). Statistics Korea's own SGIS portal page for this dataset did not surface separate terms-of-use or 공공누리(KOGL) markings on inspection; nothing found narrows the permissive Apache-2.0 terms carried by the intermediate repo. |

**Bundled textures**

| File | Source | License | Required attribution |
|---|---|---|---|
| `public/textures/earth-bump.png` | NASA Earth Observatory, *Blue Marble: Next Generation — Topography* (GEBCO_08 Grid elevation, imagery by Jesse Allen) | Public Domain (U.S. Government work) | Confirmed by pixel-correlating this file (r ≈ 1.0000) against `gebco_08_rev_elev_5400x2700.jpg` in the AirLens pipeline's local texture cache, which matches NASA's published filename and description for this image. NASA imagery credit: Jesse Allen, NASA Earth Observatory, using GEBCO data from the British Oceanographic Data Centre. |
| `public/textures/earth-land-mask.png` | [Solar System Scope](https://www.solarsystemscope.com/textures/) — inverted from their `8k_earth_specular_map` | CC BY 4.0 | Textures by Solar System Scope (solarsystemscope.com), CC BY 4.0. Source and licence were stated in the commit that introduced the mask (`fix(globe): replace incomplete country-mask with Solar System Scope land mask`); confirmed by near-perfect inverse pixel correlation (r ≈ −0.99999996) against the specular map, and independently by fetching Solar System Scope's own licence page. |
| `public/textures/earth-night-2k.jpg` | NASA Black Marble 2016 (city lights) | Public Domain (U.S. Government work) | NASA Black Marble 2016. Already credited in code (`src/lib/config/globe-presets.ts:99`) — listed here so the table matches what ships. |

## Fonts bundled and redistributed

All under the SIL Open Font License 1.1, which permits redistribution as part of
this application. OFL §1 requires the copyright notice **and the full licence**
to ship with every copy, so each directory carries both — a link would have been
enough while this repository was private and is not enough now that publishing it
constitutes redistribution:

| Family | Copyright | Files |
|---|---|---|
| Crimson Pro (variable, Latin subset) | Copyright 2018 The Crimson Pro Project Authors | `public/fonts/crimson-pro/{LICENSE.md,OFL.txt}` |
| Overused Grotesk (subset) | Copyright (c) 2023-2025, Bao Nguyen/RandomMaerks | `public/fonts/observatory/{LICENSE.md,OFL.txt}` |

Both are shipped as **subsets**, i.e. Modified Versions under the OFL. Neither
upstream copyright line carries a Reserved Font Name clause (checked 2026-09-04),
so neither has to be renamed — the answer differs per family, so re-check before
subsetting a new one.

## Assets whose provenance is not yet recorded

Honest gap rather than a silent one. `earth-bump.png`, `earth-land-mask.png`,
`earth-night-2k.jpg`, and `seoul-districts.json` were verified (2026-09-05) and
moved into the tables above. Two remain unresolved:

- **`public/mirror/data/earth-topo.json`** — *Estimated source (unverified):
  Natural Earth (naturalearthdata.com), likely public domain.* No commit
  message or code comment names a source. The estimate rests on a structural
  match: the TopoJSON's four object names — `coastline_50m`, `coastline_110m`,
  `lakes_50m`, `lakes_110m` — are Natural Earth's own theme names at two of its
  three canonical scales, which is a distinctive enough combination that
  coincidence is unlikely, but no direct citation was found to confirm it.
- **`public/icons.svg`** — *Unresolved.* Four of its six symbols
  (`bluesky-icon`, `discord-icon`, `github-icon`, `x-icon`) are recognizable
  official brand marks used in the standard "link to our socials" convention
  — a trademark-usage question, not an attribution-license one, and not
  pursued further here. The other two (`documentation-icon`, `social-icon`,
  generic outline icons in a shared purple-stroke style) have no identifiable
  source: no git commit message, no reference anywhere in `src/` (the file
  appears unused — confirmed by grep — and a same-day design-audit doc already
  flags it for consolidation into a new icon sheet), and it was not carried
  over from the AirLens-platform monorepo this project was ported from. It may
  be originally authored for this repo; that could not be confirmed either.

## What is deliberately *not* claimed here

Satellite aerosol retrieval (NASA MAIAC AOD) exists in the AirLens pipeline but
carries **no weight in the serving grid** this app renders, so it is not listed
above as a source of what you see. See the README's engine caveat. Listing an
input that contributes nothing would be attribution theatre.
