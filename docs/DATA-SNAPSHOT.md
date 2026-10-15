# public/mirror + public/geo — data snapshot provenance

2026-08-26 AirLens-platform `apps/landing-lab` mirror 베이크 스냅샷 (baked assets,
already-synced state — `sync-assets.mjs` was not re-run for this copy).
2 files, 0.3MB total (`tft.json`, `geo/seoul-districts.json`). 나머지 8개
(`pm25.bin/.meta.json`, `wind.json`, `fires.json`, `earth-topo.json`,
`earth-points-{low,medium}.bin`, `shap-seoul.json`)는 2026-10 /landing 제거와
함께 삭제했다(git 이력에 남아 있다).
추후 HF(Robeedau/airlens-live)→CDN→static 3단 폴백으로 대체 예정.
