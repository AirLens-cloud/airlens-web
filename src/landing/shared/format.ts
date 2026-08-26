// Minimal inline of AirLens-platform apps/landing-lab
// `src/concepts/fieldnotes/format.ts` — only the one function Ch2's Readout
// needs (`fmtSnapshot`); `fmtDate` from the source module has no consumer in
// this repo yet, so it is not carried over (add it here, not as a new parallel
// helper, if a future chapter needs it). Wave L2, 2026-08-26.
//
// Snapshot timestamp (ms) → "2026-07-12 00:00Z", matching the ATMOS/PARTICULATE
// provenance line. Ch1's `Sections.tsx` has its own equivalent `fmtTime` local
// to that file (ported before this shared module existed) — left as-is here
// (surgical scope: this port only touches Ch2's files).
export function fmtSnapshot(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}
