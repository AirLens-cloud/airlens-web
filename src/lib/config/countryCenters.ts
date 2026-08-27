/**
 * Map anchor per country, for placing one marker on the dotted map.
 *
 * Ported from AirLens-platform `apps/web/src/hooks/usePolicyPageState.ts`.
 * These are capital-city coordinates, not area centroids — for a country-sized
 * dot on a world map the distinction is below the mark's own radius, but it is
 * why the map is an anchor for a national figure and never a claim about where
 * inside the country the measurement was taken.
 *
 * Coverage is narrower than the SDID set (about 70 of the 119 estimated
 * countries). A country with no anchor is dropped from the map and counted in
 * the map's own footnote, never silently placed at [0, 0].
 */
export const COUNTRY_CENTERS: Record<string, [number, number]> = {
  AE: [24.5, 54.7], AR: [-34.6, -58.4], AT: [48.2, 16.4], AU: [-33.9, 151.2], BD: [23.8, 90.4],
  BE: [50.8, 4.4], BG: [42.7, 23.3], BH: [26.2, 50.6], BR: [-15.8, -47.9], CA: [45.4, -75.7],
  CH: [46.9, 7.4], CL: [-33.4, -70.7], CN: [39.9, 116.4], CO: [4.7, -74.1], CZ: [50.1, 14.4],
  DE: [52.5, 13.4], DK: [55.7, 12.6], EC: [-0.2, -78.5], EG: [30.0, 31.2], ES: [40.4, -3.7],
  ET: [9.0, 38.7], FI: [60.2, 24.9], FR: [48.9, 2.3], GB: [51.5, -0.1], GH: [5.6, -0.2],
  GR: [37.9, 23.7], HR: [45.8, 16.0], HU: [47.5, 19.0], ID: [-6.2, 106.8], IE: [53.3, -6.3],
  IL: [31.8, 35.2], IN: [28.6, 77.2], IQ: [33.3, 44.4], IR: [35.7, 51.4], IT: [41.9, 12.5],
  JM: [18.0, -76.8], JP: [35.7, 139.7], KE: [-1.3, 36.8], KR: [37.6, 127.0], KW: [29.4, 47.9],
  KZ: [51.2, 71.4], LA: [17.9, 102.6], LK: [6.9, 79.9], MM: [16.9, 96.2], MN: [47.9, 106.9],
  MX: [19.4, -99.1], MY: [3.1, 101.7], NG: [9.1, 7.5], NL: [52.4, 4.9], NO: [59.9, 10.8],
  NP: [27.7, 85.3], NZ: [-41.3, 174.8], PE: [-12.0, -77.0], PK: [33.7, 73.1], PL: [52.2, 21.0],
  PT: [38.7, -9.1], RO: [44.4, 26.1], RU: [55.8, 37.6], SA: [24.7, 46.7], SE: [59.3, 18.1],
  SG: [1.3, 103.8], SK: [48.1, 17.1], TH: [13.8, 100.5], TR: [39.9, 32.9], TT: [10.7, -61.5],
  TW: [25.0, 121.6], US: [38.9, -77.0], UY: [-34.9, -56.2], UZ: [41.3, 69.3], VN: [21.0, 105.9],
}

/** WHO 2021 annual PM2.5 air quality guideline (µg/m³) — the honest benchmark. */
export const WHO_PM25_ANNUAL_GUIDELINE = 5
