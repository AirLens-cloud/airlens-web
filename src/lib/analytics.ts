/**
 * analytics — no-op sink.
 *
 * The source monorepo's `track()` delegates to PostHog. This repo ships no
 * analytics vendor (see DESIGN.md — the data layer is read-only and the app
 * carries no consented telemetry yet), so the ported Globe modules that call
 * `track()` on a degraded-data path keep compiling and stay silent. Wire a
 * real sink here rather than reintroducing `track()` call sites if telemetry
 * ever lands.
 */
export function track(_event: string, _props?: Record<string, unknown>): void {
  /* no-op — no analytics vendor in this repo */
}
