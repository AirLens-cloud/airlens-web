import type { GlobeSection } from '../../types/globe'

/** Globe 장면 프리셋 — 1클릭에 레이어 번들 + 오버레이 세팅. store applyScene / GlobeScenesCard / 키보드 1-5 공유 SoT. */
export const GLOBE_SCENES: GlobeSection[] = [
  { key: 'aq', ko: '대기질', en: 'AIR QUALITY', desc_ko: 'PM2.5 격자 예측 — 위성 AOD 보정', desc_en: 'Global PM2.5 grid prediction — satellite AOD calibration', layers: { grid: true, wind: true, fires: false, arcs: false, stations: false, choropleth: false }, overlay: 'pm25' },
  { key: 'wind', ko: '바람', en: 'WIND', desc_ko: 'GFS 1.0° 풍향 · 풍속 파티클', desc_en: 'GFS 1.0° wind direction & speed particles', layers: { grid: false, wind: true, fires: false, arcs: false, stations: false, choropleth: false }, overlay: 'wind' },
  { key: 'fire', ko: '화재', en: 'FIRE', desc_ko: 'NASA FIRMS 위성 열점 감지', desc_en: 'NASA FIRMS satellite hotspot detection', layers: { grid: false, wind: false, fires: true, arcs: false, stations: false, choropleth: false }, overlay: 'none' },
  { key: 'policy', ko: '정책', en: 'POLICY', desc_ko: '국가별 대기질 기준 — WHO 가이드라인 대비', desc_en: 'National air quality standards — vs. WHO guideline', layers: { grid: false, wind: false, fires: false, arcs: true, stations: false, choropleth: true }, overlay: 'none' },
  { key: 'stations', ko: '관측소', en: 'STATIONS', desc_ko: '전 세계 모니터링 네트워크', desc_en: 'Global monitoring station network', layers: { grid: false, wind: false, fires: false, arcs: false, stations: true, choropleth: false }, overlay: 'none' },
]
