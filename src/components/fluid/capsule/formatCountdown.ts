/**
 * formatCountdown — AqiCapsule's "Next forecast refresh in ..." countdown.
 *
 * F51 (2026-09-28): REFRESH_INTERVAL_MS (AqiCapsule.tsx) is 6h, so `remaining`
 * can be up to 360 minutes — rendering it as a raw `m:ss` (no 60-minute
 * carry) produced nonsense like "228:15" that reads as a broken timer, and
 * disagreed with the sibling `formatElapsed` (../../../lib/home/whyNow.ts)
 * which does carry to "Xh". Pulled out of AqiCapsule.tsx (rather than just
 * exported from there) because that file's default export is a component —
 * a second named export trips `react-refresh/only-export-components` —
 * mirroring whyNow.ts's existing non-component util-file pattern.
 */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${h}h ${m}m`
  }
  const s = totalSec % 60
  return `${totalMin}:${s.toString().padStart(2, '0')}`
}
