/**
 * WindField — Bilinear-interpolated wind vector field.
 * Ported verbatim from AirLens-platform apps/web `src/lib/windField.ts`.
 *
 * Stores global wind data as a regular lat/lon grid of u/v vectors.
 * Provides fast bilinear interpolation for any (lat, lon) query,
 * matching the approach used by earth.nullschool.net.
 */
import type { WindFieldData, WindFieldMeta, WindGridPoint } from '../types/data'

export class WindField {
  private readonly u: Float32Array
  private readonly v: Float32Array
  private readonly nLat: number
  private readonly nLon: number
  private readonly latMin: number
  private readonly lonMin: number
  private readonly dLat: number
  private readonly dLon: number
  /** Where this field came from — level, cycle, freshness, resolution. */
  readonly meta?: WindFieldMeta

  constructor(data: WindFieldData) {
    this.u = data.u
    this.v = data.v
    this.nLat = data.nLat
    this.nLon = data.nLon
    this.latMin = data.latMin
    this.lonMin = data.lonMin
    this.dLat = data.dLat
    this.dLon = data.dLon
    this.meta = data.meta
  }

  /** Expose underlying data for external engines (e.g., earth.js adapter). */
  toData(): WindFieldData {
    return {
      u: this.u, v: this.v,
      nLat: this.nLat, nLon: this.nLon,
      latMin: this.latMin, lonMin: this.lonMin,
      dLat: this.dLat, dLon: this.dLon,
    }
  }

  /**
   * Bilinear interpolation of wind vector at (lat, lon).
   * Returns { u, v } in m/s. u = eastward, v = northward.
   */
  interpolate(lat: number, lon: number): { u: number; v: number } {
    let normLon = ((lon - this.lonMin) % 360 + 360) % 360
    if (normLon >= this.nLon * this.dLon) normLon -= 360

    const fi = (lat - this.latMin) / this.dLat
    const fj = normLon / this.dLon

    let i0 = Math.floor(fi)
    const j0 = Math.floor(fj)

    if (i0 < 0 || i0 > this.nLat - 1 || j0 < 0) {
      return { u: 0, v: 0 }
    }
    // lat exactly at the north edge lands on the last row, which has no row
    // above it to interpolate against. Step back one row instead of bailing.
    i0 = Math.min(i0, this.nLat - 2)

    const i1 = Math.min(i0 + 1, this.nLat - 1)
    const j1 = (j0 + 1) % this.nLon // wrap longitude

    const di = fi - i0
    const dj = fj - j0

    const idx00 = i0 * this.nLon + j0
    const idx10 = i1 * this.nLon + j0
    const idx01 = i0 * this.nLon + j1
    const idx11 = i1 * this.nLon + j1

    const u00 = this.u[idx00], u10 = this.u[idx10]
    const u01 = this.u[idx01], u11 = this.u[idx11]
    const uInterp = (1 - di) * ((1 - dj) * u00 + dj * u01)
                   + di * ((1 - dj) * u10 + dj * u11)

    const v00 = this.v[idx00], v10 = this.v[idx10]
    const v01 = this.v[idx01], v11 = this.v[idx11]
    const vInterp = (1 - di) * ((1 - dj) * v00 + dj * v01)
                   + di * ((1 - dj) * v10 + dj * v11)

    return { u: uInterp, v: vInterp }
  }

  /**
   * Build WindField from GFS GRIB-like records (u/v component arrays).
   * Used as static JSON fallback when external APIs are unavailable.
   */
  static fromGFSRecords(uRecord: { header: { nx: number; ny: number; lo1: number; la1: number; dx: number; dy: number }; data: number[] }, vRecord: typeof uRecord, meta?: WindFieldMeta): WindField {
    const { nx, ny, lo1, la1, dx, dy } = uRecord.header
    const u = new Float32Array(ny * nx)
    const v = new Float32Array(ny * nx)

    // GFS data is stored north-to-south; we need south-to-north for our grid
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const srcIdx = j * nx + i
        const dstIdx = (ny - 1 - j) * nx + i
        u[dstIdx] = uRecord.data[srcIdx] ?? 0
        v[dstIdx] = vRecord.data[srcIdx] ?? 0
      }
    }

    return new WindField({
      u, v,
      nLat: ny, nLon: nx,
      latMin: la1 - (ny - 1) * dy, lonMin: lo1,
      dLat: dy, dLon: dx,
      meta,
    })
  }

  static fromGridPoints(points: WindGridPoint[], stepDeg: number): WindField {
    const latMin = -90
    const latMax = 90
    const lonMin = -180

    const nLat = Math.floor((latMax - latMin) / stepDeg) + 1
    const nLon = Math.floor(360 / stepDeg)

    const u = new Float32Array(nLat * nLon)
    const v = new Float32Array(nLat * nLon)

    for (const p of points) {
      const i = Math.round((p.lat - latMin) / stepDeg)
      const lonNorm = ((p.lon - lonMin) % 360 + 360) % 360
      const j = Math.round(lonNorm / stepDeg) % nLon

      if (i >= 0 && i < nLat && j >= 0 && j < nLon) {
        const idx = i * nLon + j
        // Meteorological convention: direction = where wind comes FROM
        const dirRad = (p.direction * Math.PI) / 180
        u[idx] = -p.speed * Math.sin(dirRad) // eastward component
        v[idx] = -p.speed * Math.cos(dirRad) // northward component
      }
    }

    return new WindField({
      u, v, nLat, nLon,
      latMin, lonMin,
      dLat: stepDeg, dLon: stepDeg,
    })
  }
}
