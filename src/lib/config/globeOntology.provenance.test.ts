/**
 * Air-quality feed provenance (AAA).
 *
 * These labels reach readers on /data-sources, /datasets and the Globe HUD,
 * so they have to match what the artifacts themselves declare rather than
 * what a shared default happened to say. Values below were read off the live
 * files on 2026-09-04:
 *
 *   current-pm25-grid.json  source "NOAA GEFS-Aerosols"  nLat 181 × nLon 360  1°
 *   current-pm10-grid.json  source "NOAA GEFS-Aerosols"  nLat 181 × nLon 360  1°
 *   current-o3-grid.json    source "Open-Meteo (CAMS)"   nLat  33 × nLon  72  5°
 *   current-no2-grid.json   source "Open-Meteo (CAMS)"                        5°
 *   current-co-grid.json    source "Open-Meteo (CAMS)"                        5°
 *
 * Before this pass all five were labelled "Open-Meteo Air Quality" at 5° —
 * wrong provider and a five-times-coarser grid for the particulates. That is
 * the drift these cases exist to catch, so a failure here means the labels
 * and the artifacts have parted ways again; re-read the files before
 * "fixing" the test.
 */
import { describe, it, expect } from 'vitest';
import { PHENOMENA } from './globeOntology';

describe('AQ feed provenance', () => {
  it.each([
    ['pm25' as const],
    ['pm10' as const],
  ])('labels %s as the aerosol model at its real 1° resolution', (id) => {
    // Arrange / Act
    const pipeline = PHENOMENA[id].pipeline;
    // Assert
    expect(pipeline?.source).toBe('NOAA GEFS-Aerosols');
    expect(pipeline?.resolution).toBe('1°');
  });

  it.each([
    ['o3' as const],
    ['no2' as const],
    ['co' as const],
  ])('labels %s as the CAMS reanalysis feed at 5°', (id) => {
    // Arrange / Act
    const pipeline = PHENOMENA[id].pipeline;
    // Assert
    expect(pipeline?.source).toBe('Open-Meteo (CAMS)');
    expect(pipeline?.resolution).toBe('5°');
  });

  it('does not give the gases and the particulates one shared provenance', () => {
    // Arrange — the regression itself: a single default applied to all five.
    const particulate = PHENOMENA.pm25.pipeline;
    const gas = PHENOMENA.o3.pipeline;
    // Assert
    expect(particulate?.source).not.toBe(gas?.source);
    expect(particulate?.resolution).not.toBe(gas?.resolution);
  });
});
