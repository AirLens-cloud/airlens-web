<p align="center">
  <img src=".github/assets/readme/hero.svg" alt="AirLens — The Story of Our Atmosphere. A sky window cycling dawn, noon, dusk and night above a HUD showing a p10–p90 uncertainty band, a DQSS data-quality grade, and AQI tiers." width="1200" />
</p>

<p align="center">
  Glass-box air quality intelligence — observation-conditioned PM2.5 nowcasts, causal policy
  analysis, and uncertainty you can <em>see</em>, across 120+ countries.
</p>

<p align="center">
  <a href="https://airlens.cloud">
    <img src="https://img.shields.io/badge/Live-airlens.cloud-blue?style=flat-square" alt="Live Demo" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="AGPL-3.0 License" />
  </a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
</p>

<p align="center">
  <strong>▶ <a href="https://airlens.cloud">Live demo → airlens.cloud</a></strong>
</p>

---

> **Repository scope (2026-08-26 →).** This repo is the **data + ML pipeline**: sidecar
> collection, ETL, Hugging Face publishing, model training, and the deployed Cloudflare
> Workers. New web product development moved to a separate repo (`airlens-web`), which is
> what serves [airlens.cloud](https://airlens.cloud). `apps/web` here is frozen — kept for
> its data-surface maintenance and CI, not for new features.
>
> **Supabase has been retired from the live path.** Every Supabase-touching workflow in this
> repo is `disabled_manually`; the data plane is now Hugging Face datasets
> (`Robeedau/airlens-live`) read directly by Cloudflare Workers and the clients. Sections
> below describe the current pipeline, not the 2026-08 Supabase architecture.
