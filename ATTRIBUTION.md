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

Honest gap rather than a silent one. These are committed and therefore
redistributed, and their upstreams have not been verified: `public/textures/
earth-bump.png`, `earth-land-mask.png`, `public/mirror/data/earth-topo.json`,
`public/geo/seoul-districts.json`, `public/icons.svg`. (`public/textures/
earth-night-2k.jpg` is credited in code — `src/lib/config/globe-presets.ts:99`,
NASA Black Marble 2016, public domain — but belongs in this table too.)
`seoul-districts.json` is the one to check first: Korean administrative
boundaries can carry usage conditions that the others almost certainly do not.

## What is deliberately *not* claimed here

Satellite aerosol retrieval (NASA MAIAC AOD) exists in the AirLens pipeline but
carries **no weight in the serving grid** this app renders, so it is not listed
above as a source of what you see. See the README's engine caveat. Listing an
input that contributes nothing would be attribution theatre.
