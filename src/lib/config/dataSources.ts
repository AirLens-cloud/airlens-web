/**
 * External data source base URLs — single hardcoding-avoidance point.
 * Ported verbatim from AirLens-platform apps/web `src/lib/config/dataSources.ts`.
 *
 * `SNAPSHOT_CDN_BASE` points at the mac free-tier GitHub Pages publish
 * (AirLens-platform `.github/workflows/mac-data-publish.yml`), converted to
 * the web Globe's `AQGridResponse` contract by `scripts/etl/build_web_aq_grid.py`
 * and landed at `data/web/v1/current-{pm25,pm10}-grid.json` on that same site.
 * It is the pm25/pm10-only CDN fallback in the fetch cascade — kept alive
 * separately from the HF dataset repo below.
 *
 * `HF_LIVE_BASE` points at the public HF dataset repo (`Robeedau/airlens-live`)
 * that is this repo's data primary (the AirLens-platform monorepo now owns the
 * data pipeline only; this repo is a read-only consumer). Repo paths mirror
 * the former Supabase Storage bucket layout (`aq-data/...`, `wind-data/...`)
 * — the resolve URL is that path appended verbatim, no auth needed (public
 * repo, CDN-served).
 */
export const SNAPSHOT_CDN_BASE: string =
  import.meta.env.VITE_SNAPSHOT_CDN_BASE ?? 'https://joymin5655.github.io/AirLens/data/web/v1';

export const HF_LIVE_BASE: string =
  import.meta.env.VITE_HF_LIVE_BASE ?? 'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main';
