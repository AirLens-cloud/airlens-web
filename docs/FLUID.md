# FLUID.md — fluid interface spec

Reference spec for the Apple-style fluid interface primitives built in this
repo (Wave 1-4 of the fluid design campaign). Written for whoever ports these
patterns into `Today` / `Globe` / `Insights` in a separate porting effort —
every claim below is traced to a source file and line so it can be re-checked
against the code directly rather than trusted at face value.

Scope: this file documents what exists today. It does not propose new APIs.
Where the approved porting matrix calls for something the source doesn't
have yet (Insights' spring list reordering), that is marked as a **spec**,
not a description of running code.

## 1. Principles

### Entry discipline (5 rules)

Codified in `src/styles/motion.css` and consumed via the `.fluid-enter`
class + `--enter-i` custom property per element:

1. **`@starting-style` for the pre-paint state** — `.fluid-enter` inside
   `@starting-style` sets `opacity: 0; transform: translateY(8px) scale(0.96)`
   (`src/styles/motion.css:11-16`). This is the CSS entry-transition
   primitive, not a JS-driven mount animation — the browser animates the
   before/after style pair the first time the rule applies.
2. **300ms duration cap** — `--dur-enter: 300ms` (`src/styles/tokens.css:160`),
   consumed by both the `opacity` and `transform` transitions on
   `.fluid-enter` (`src/styles/motion.css:5-8`).
3. **Scale floor ≥ .96, never 0** — the file's own comment states the reason:
   "scale floor is 0.96, not 0 — a from-nothing scale reads as a pop rather
   than a settle" (`src/styles/motion.css:2-3`).
4. **60ms stagger** — `--stagger: 60ms` (`src/styles/tokens.css:161`);
   `transition-delay: calc(var(--enter-i, 0) * var(--stagger))`
   (`src/styles/motion.css:8`) — each staggered element sets its own
   `--enter-i` index (0-based).
5. **Reduced-motion strips the transition entirely** —
   `@media (prefers-reduced-motion: reduce) { .fluid-enter { transition: none } }`
   (`src/styles/motion.css:18-22`), not a shortened duration.

### Honest absence (Glass-box)

No fluid component fabricates a reading when data is missing — every one
either renders an explicit "no data" state or falls back to a decorative
(non-numeric) idle state:

- `AqiCapsule` — `data.status === 'loading'` renders `···`;
  `'missing'` renders `NO FEED` literal text, never a stale/guessed number
  (`src/components/fluid/capsule/AqiCapsule.tsx:224-241`).
- `CapsulePanel` — when `buildSparkline` returns `null` (empty series), the
  sparkline page renders the literal string `NO FEED` instead of an empty or
  fabricated chart (`src/components/fluid/capsule/CapsulePanel.tsx:160-162`).
- `SkyOrb` — is explicitly documented as "Decorative only (never renders a
  numeric reading)"; a `null`/non-finite `pm25` falls back to a fixed neutral
  ambient RGB (`NEUTRAL_RGB = [139, 134, 120]`) and a fixed density of `0.2`
  rather than any interpolated color (`src/components/fluid/SkyOrb.tsx:92-98,122-126`).

### Fallback ladder: refract → blur → tint

`detectGlassTier()` (`src/components/fluid/glassTier.ts:40-43`, cached for
the module's lifetime) decides which `LiquidGlass` rendering tier to use,
in this precedence:

1. `prefers-reduced-transparency: reduce` **always wins first** and forces
   `tint`, regardless of browser (`glassTier.ts:23-28`).
2. Otherwise: Chromium (UA contains `Chrom` and is not a
   `Version/x Safari` string) **and** `CSS.supports('backdrop-filter', 'blur(2px)')`
   → `refract` (SVG-filter refraction).
3. Otherwise: any browser (Chromium or not) with `backdrop-filter` or
   `-webkit-backdrop-filter` support → `blur` (plain CSS backdrop blur).
4. Otherwise → `tint` (flat, no `backdrop-filter` at all).

(`glassTier.ts:20-37`.) In this repo's default `vitest`/jsdom environment
(no `matchMedia`, no `CSS.supports`), the tier always resolves to `tint`
(`LiquidGlass.test.tsx:23-31`, `glassTier.test.ts:14-19`) — this matters for
whoever writes tests against a ported component, see §7.

### Physical parameters are per-component constants, not a shared preset module

There is **no** exported spring-preset registry (no `presets.ts`, no named
export like `SPRING_JELLY`). Each component that uses `useSpring` declares
its own `SpringConfig` object literal as a local `const`. Five exist today:

| Const | File | `{ damping, response }` | ζ regime | Used for |
|---|---|---|---|---|
| `DEFAULT_CONFIG` | `src/landing/shared/useSmoothedProgress.ts:29` | `{ damping: 1, response: 0.25 }` | critically damped (ζ=1, no overshoot) | scroll-progress smoothing — the code comment explains why: a progress value must stay inside `[0,1]`, so an underdamped config that overshoots is wrong here (`useSmoothedProgress.ts:25-28`) |
| `CAPSULE_SPRING` | `src/components/fluid/capsule/AqiCapsule.tsx:17` | `{ damping: 0.68, response: 0.38 }` | underdamped (ζ<1, overshoots) | the capsule's expand/collapse width+height |
| `DRAG_SPRING` | `src/components/fluid/capsule/CapsulePanel.tsx:13` | `{ damping: 0.72, response: 0.32 }` | underdamped (ζ<1, overshoots) | the drag-to-page snap `translateX` |
| `PANEL_SPRING` | `src/components/chat/ChatFAB.tsx:48` | `{ damping: 0.8, response: 0.3 }` | underdamped (ζ<1, overshoots) | the chat panel's open/close `translateY` + drag-to-dismiss — the gesture-table's exact ζ0.8/r0.30 value (§1a below) |
| `VALUE_SPRING` | `src/components/home/HomeHero.tsx:24` | `{ damping: 1.0, response: 0.5 }` | critically damped (ζ=1, no overshoot) | the Home hero's headline PM2.5 number — deliberately slower than the ζ1.0/r0.35 base default (`HomeHero.tsx:22-23`); a settling number reads better over 500ms than snapping in 350ms |

`damping` is the damping ratio ζ (1 = critically damped, <1 = overshoots,
per the type doc at `src/motion/spring.ts:4-6`); `response` is a response
time in seconds, converted to angular frequency as
`ω = 2π / max(0.05, response)` (`src/motion/spring.ts:29,34`). Treat the
table above as "known-good values already tuned in this codebase," not
formal names — if a porting page needs a new config, derive one the same
way (pick ζ for overshoot-or-not, response for speed) rather than
introducing a shared presets file this repo doesn't have; note whether it
belongs in the base default or the gesture-table registry below.

### Δ5 motion contract — base default, gesture-table registry, press, reduced-motion

Wave 5's interaction/gesture delta (Δ5, B1-B6). Two spring regimes, a
CSS-only press system, and one reduced-motion substitution rule govern every
consumer of `useSpring` and the pressable-control classes added in B5.

**Base default — ζ1.0 / r0.35.** Critically damped, no overshoot. This is
the assumed regime for any new spring-driven surface that isn't in the
gesture-table registry below (`ChatFAB.tsx:47`, `HomeHero.tsx:22`). No
literal `{ damping: 1.0, response: 0.35 }` constant is shared in code — per
the "per-component constants" principle above, a surface adopting the base
default declares its own local const at (or near) those values; `HomeHero`'s
`VALUE_SPRING` is a documented, intentional deviation from it (slower, for a
legible headline number), not a second default.

**Gesture-table registry — ζ0.8 / r0.30, closed list.** A small, explicitly
enumerated set of surfaces is allowed the bouncier (underdamped) regime,
because they are direct-manipulation / drag-driven UI where a little
overshoot reads as physical, not sloppy: **sheet, capsule, chat panel,
flick** (`ChatFAB.tsx:14-16,46-47`). `PANEL_SPRING` (chat panel) hits this
exactly at `{ damping: 0.8, response: 0.3 }`; `CAPSULE_SPRING` and
`DRAG_SPRING` (capsule expand/collapse and its drag-to-page snap) are tuned
close to it (0.68-0.72 / 0.32-0.38) rather than pinned to the identical
numbers — expected, since ζ0.8/r0.30 is the registry's nominal target, not a
shared constant every entry must equal byte-for-byte. **Adding a fifth
category requires adding a row here and in the code comments that cite this
list** (`ChatFAB.tsx:46`, `chrome.css:162-167`) — it is not a default other
surfaces can reach for ad hoc. A "sheet" surface has no component in this
repo yet; the category exists in the registry for a future bottom-sheet
port, not for anything currently rendered.

**Press — CSS-only, not spring-driven.** `--dur-press: 100ms`
(`src/styles/tokens.css:174-175`) pairs with a `:active { transform:
scale(0.96) }` rule — no JS, no `useSpring` involvement, because a press is
a binary pressed/released state, not something that benefits from spring
physics. Applied per-surface (never a blanket `button:active` selector, so a
surface can opt out or use a different scale if a future one needs to):
`.btn` (`wireframe.css:162-182`, which also replaced its previous bare `.2s`
transition with explicit `background-color`/`color`/`border-color`/
`transform` properties), `.fab` (`composites.css:187-205`, which also
**removed** its `:hover { transform: translateY(-2px) }` lift — a Δ5
contract violation — no hover lift or hover shadow is allowed anywhere),
`.chat-send` (`composites.css:287-295`), `.chrome-nav__trigger`
(`chrome.css:107-124`), and `.chrome-nav__mobile-toggle`
(`chrome.css:236-246`).

**Reduced-motion substitution — 200ms crossfade, never an infinite loop.**
`useSpring.set()` calls `spring.jump()` instead of animating when
`useReducedMotion()` is true (`useSpring.ts:56-62`) — every spring-driven
surface snaps to its target instantly under reduced motion, no exception.
Where a surface also needs *some* transition so the state change isn't
silently invisible, the fix is a plain CSS opacity transition running
independently of the spring, not a shortened spring: the chat panel's
`.chat-panel-spring` opacity fades over `--dur-fast` (200ms) on `data-open`
regardless of reduced-motion, "so reduced-motion can keep the 200ms
crossfade even while the spring snaps position instantly"
(`composites.css:220-224`). This is the same shape as the entry-discipline
rule in §1 above (`.fluid-enter` strips its transition entirely rather than
shortening it) applied to gesture-table surfaces specifically. No
Δ5-introduced animation loops indefinitely — every spring settles
(`Spring.isSettled()`, `spring.ts:53-55`) and every CSS transition is
one-shot, state-triggered.

**Property scope — transform + opacity only, plus entry blur.** Every Δ5
spring/press/crossfade above animates only `transform` and/or `opacity`
(never `width`/`height`/`top`/`left`/layout properties) — `AqiCapsule`'s
`width`/`height` spring predates Δ5 and is a known exception, not a
precedent to extend. The one addition beyond transform+opacity is entry
blur, already covered by the fallback-ladder/glass sections above, not a
new Δ5 property.

## 2. Tokens

Three new custom properties, defined once in `src/styles/tokens.css:159-161`:

```css
--ease-fluid: cubic-bezier(0.23, 1, 0.32, 1);
--dur-enter: 300ms;
--stagger: 60ms;
```

Consumed by the `.fluid-enter` class contract (§1) and, independently,
inside component-scoped CSS as the shared easing curve for
`fluid-materialize.css` (`transition-timing-function: var(--ease-fluid)`,
`src/styles/fluid-materialize.css:9`). Note `Materialize`'s own transition
duration is **not** driven by `--dur-enter` — it's a separate `durMs` prop
defaulting to `300ms` (see §3), matching the `--dur-enter` value by the
entry-discipline rule (duration ≤300ms), not by a shared constant — a
change to one does not automatically update the other.

Wave 5 Δ5 (B5) added a fourth: `--dur-press: 100ms`
(`src/styles/tokens.css:174-175`), consumed only by the `:active { transform:
scale(0.96) }` press rule — see the Δ5 motion contract subsection in §1.

### Glass token consumption contract — no new `--glass-*` tokens

`src/styles/fluid-glass.css:4` states this directly in its header comment:
"Consumes only existing tokens — no new `--glass-*` values defined here."
Every fluid glass surface reads tokens already defined pre-Wave-1 in
`src/styles/tokens.css:142-151` (light) and `:194-197`/`:227-230` (dark /
`prefers-color-scheme: dark`):

| Token | Light value | Dark value |
|---|---|---|
| `--glass-fill` | `rgba(255,255,255,0.20)` | `rgba(20,30,54,0.32)` |
| `--glass-fill-lift` | `rgba(255,255,255,0.28)` | `rgba(28,40,68,0.42)` |
| `--glass-opaque` | `#e8f0f9` | `#141e33` |
| `--glass-blur` | `20px` | `20px` (unchanged) |
| `--glass-border` | `rgba(255,255,255,0.40)` | `rgba(255,255,255,0.18)` |
| `--glass-night-fill` | `rgba(10,16,30,0.70)` | (variant is dark by design; no separate dark-mode override) |
| `--glass-night-fill-lift` | `rgba(16,24,42,0.80)` | — |
| `--glass-night-border` | `rgba(255,255,255,0.14)` | — |
| `--glass-night-opaque` | `#0c1422` | — |
| `--shadow-glass` | `0 8px 24px -6px rgba(28,56,104,0.16)` | `0 8px 24px -6px rgba(17,20,24,0.45)` |

`--glass-opaque` / `--glass-night-opaque` are the `prefers-reduced-transparency`
fallback flat fills — comment at `tokens.css:144`. **Porting rule: do not
define a fifth `--glass-*` token for a new surface.** If an existing pairing
(day/night × fill/border/opaque) doesn't fit, that is a signal to raise it
with whoever owns `tokens.css`, not to add a local override.

## 3. Component API reference

### `Spring` / `SpringEngine` (`src/motion/spring.ts`)

Semi-implicit (symplectic) Euler integrator, no React dependency.

```ts
interface SpringConfig { damping: number; response: number }

class Spring {
  constructor(initial: number, config: SpringConfig)
  setConfig(config: SpringConfig): void
  setTarget(target: number, opts?: { velocity?: number }): void
  jump(value: number): void          // snaps to a value with zero velocity
  get(): number
  isSettled(): boolean               // |v| < 0.02 and |p - target| < 0.02
  step(dtSec: number): boolean       // returns true once settled this step
}
```

- `SpringEngine` is a **module-singleton** rAF driver — `add(item)` /
  `remove(item)` manage a `Set<{step(dtSec): boolean}>`; it only runs
  `requestAnimationFrame` while the set is non-empty, and stops itself once
  every added item reports settled (`spring.ts:82-120`). One rAF loop
  services every spring in the page — see §6.
- `step()` clamps `dtSec` to `MAX_DT_SEC = 0.064` first, then integrates that
  clamped step in fixed `MAX_SUBSTEP_SEC = 0.004` (250Hz) substeps rather
  than as one semi-implicit Euler step (`spring.ts:13,16,57-69`) — see §6
  for why a single step at the full clamped duration is not safe for every
  config this system uses.
- `projectMomentum(velocityPxPerSec, decel = 0.998)` — exponential-decay
  fling projection, returns final displacement in px (`spring.ts:125-127`).
- `rubberband(excess, coeff = 0.35)` — resistance scaling for out-of-bounds
  drag (`spring.ts:129-131`).

### `useSpring` (`src/motion/useSpring.ts`)

```ts
interface UseSpringHandle {
  get(): number
  set(target: number, opts?: { velocity?: number }): void
  jump(value: number): void
  subscribe(cb: (value: number) => void): () => void   // returns unsubscribe
}
function useSpring(initial: number, cfg: SpringConfig): UseSpringHandle
```

**Deliberately does not trigger React re-renders** (`useSpring.ts:12-15`).
The documented pattern (used identically by `AqiCapsule` and
`CapsulePanel`): call `.subscribe()` once in a mount-only `useEffect`, and
inside the callback write the value straight to a DOM ref's inline style —
never to `useState`. Example from `AqiCapsule.tsx:85-101`:

```ts
const width = useSpring(COLLAPSED_W, CAPSULE_SPRING)
useEffect(() => {
  const apply = (v: number) => { if (shellRef.current) shellRef.current.style.width = `${v}px` }
  apply(width.get())
  const unsub = width.subscribe(apply)
  return unsub
}, [])
```

Reduced-motion is handled **inside** the hook, not by the caller: when
`useReducedMotion()` is true, `.set()` calls `spring.jump(target)` instead of
animating (`useSpring.ts:56-62`) — every consumer gets reduced-motion
correctness for free.

**Exception (Wave 5 Δ5, B4):** `HomeHero.tsx:24-69` subscribes into
`useState` instead of a style ref — the spring drives rendered *text*
content (the headline PM2.5 number), which has no DOM node to write an
inline style onto the way a `transform`/`width` animation does. This is the
one place in the codebase `useSpring` triggers a React re-render per
animation frame; every other consumer keeps the style-ref pattern above.

### `useSmoothedProgress` (`src/landing/shared/useSmoothedProgress.ts`)

```ts
function useSmoothedProgress(
  progressRef: MutableRefObject<number>,
  config: SpringConfig = { damping: 1, response: 0.25 },
): MutableRefObject<number>
```

Wraps a raw scroll/drag progress ref (expected range `[0,1]`) in a spring
and returns a **different** ref object that lags and settles into the input
value — a per-frame reader (e.g. an R3F `useFrame`) reads the smoothed ref
instead of the raw one. Ref-based by design, not state-based, so it never
forces a re-render on scroll (`useSmoothedProgress.ts:1-19`). Under
`prefers-reduced-motion`, it returns the **same** `progressRef` object
passed in — no spring, no rAF loop at all
(`useSmoothedProgress.ts:59-62`, verified by test:
`useSmoothedProgress.test.ts:64-75`, `rafSpy` asserted never called).

**Idle contract**: with motion enabled, an internal `requestAnimationFrame`
poll loop reads the raw `progressRef` every frame — that poll loop itself
never stops while the hook is mounted (it has to keep watching for the next
scroll). What *does* go idle once scrolling stops is `SpringEngine`'s own
tick loop: the poll loop only calls `spring.set()` — which is what
re-registers the spring with `SpringEngine` — when the raw ref's value has
actually changed since the last call, not unconditionally every frame
(`useSmoothedProgress.ts:63-74`). Calling `spring.set()` on every frame
regardless of change would keep re-adding the spring to `SpringEngine` even
after it settled, permanently defeating `SpringEngine`'s own self-stop
(§6) — this was a real bug in an earlier version of this hook, covered by
the "idles once the target stops changing" case in
`useSmoothedProgress.test.ts`.

### `LiquidGlass` (`src/components/fluid/LiquidGlass.tsx`)

```ts
interface LiquidGlassProps {
  radius?: number       // default 20
  bezel?: number         // default 34 — refraction-tier edge falloff depth
  variant?: 'day' | 'night'   // default 'day'
  as?: 'div' | 'section' | 'article' | 'aside'   // default 'div'
  className?: string
  children?: ReactNode
}
```

- Renders class list `liquid-glass liquid-glass--<tier> liquid-glass--<variant>`
  where `<tier>` comes from `detectGlassTier()` (§1).
- On the `refract` tier only, it also renders an inline SVG `<filter>`
  (`feGaussianBlur` → `feImage` displacement map → `feDisplacementMap`,
  `scale="42"`) and sets `backdropFilter: url(#filterId) saturate(1.25)`
  inline (`LiquidGlass.tsx:63-65,105-124`). The displacement map itself
  comes from `buildDisplacementMap` (`src/components/fluid/displacementMap.ts`,
  §6 for its cache limit) and is rebuilt on resize, **debounced 150ms**
  (`RESIZE_DEBOUNCE_MS = 150`, `LiquidGlass.tsx:15,41-49`) via
  `ResizeObserver`.
- **Note**: the `as` prop only changes the surface's own tag
  (`div`/`section`/`article`/`aside`) — there's no polymorphic ref-forwarding
  beyond that switch (`LiquidGlass.tsx:71-99`).

### `Materialize` (`src/components/fluid/Materialize.tsx`)

```ts
interface MaterializeProps {
  show: boolean
  origin?: string       // CSS transform-origin, default 'center'
  durMs?: number         // default 300
  className?: string
  children?: ReactNode
}
```

Opacity/scale/blur "condense in, dissolve out" wrapper — CSS classes
`fluid-materialize` / `fluid-materialize--entered` (see `fluid-materialize.css`
for the exact property list: `opacity 0→1`, `transform: scale(0.96)→scale(1)`,
`filter: blur(12px)→blur(0)`). Mount/unmount lifecycle
(`Materialize.tsx:17-23`):

1. `show` flips to `true` → mounts immediately (closed/pre-transition state
   paints first), then one `requestAnimationFrame` later adds `--entered`
   so the browser has something to transition *from*.
2. `show` flips to `false` → removes `--entered` immediately (starts the
   close transition), stays mounted until `onTransitionEnd` fires **or** a
   `durMs + 50ms` safety timeout fires first (`UNMOUNT_GRACE_MS = 50`,
   `Materialize.tsx:15,57-63`) — the timeout exists specifically for
   interrupted-transition / no-transition edge cases.

Under reduced motion, only the `opacity` transition survives — `transform`
and `filter` are forced to `none` via the `--reduced` class
(`fluid-materialize.css:18-26`, confirmed in
`Materialize.test.tsx:80-93`).

### `AqiCapsule` (`src/components/fluid/capsule/AqiCapsule.tsx`)

One optional prop — `variant?: 'day' | 'night'` (default `'night'`),
forwarded to its `LiquidGlass` shell. Fetches its own data via
`useCapsuleData()` (below). A porting page on a light surface passes
`<AqiCapsule variant="day" />`; the landing hero keeps the default.

- **Interaction**: hover-to-open (mouse pointer type only, `pointerType !== 'mouse'`
  is ignored — `AqiCapsule.tsx:140-150`), click/keyboard toggle, `Escape` to
  close, and a full focus trap (`Tab`/`Shift+Tab` wraps inside the panel)
  while open (`AqiCapsule.tsx:181-217`).
- **Sizing**: width/height are two independent `useSpring` instances driven
  by `CAPSULE_SPRING` (§1) between `COLLAPSED_W/H = 220/56` and
  `EXPANDED_W/H = 320/300` (`AqiCapsule.tsx:18-22,82-101`).
- **One-shot session alert**: if `data.alert === 'worsening'`, auto-opens
  and pulses once per browser session (`sessionStorage` key
  `airlens-capsule-alert-shown`, `AqiCapsule.tsx:29-45,154-173`), then
  auto-collapses after `ALERT_AUTOCLOSE_MS = 4000` unless the visitor
  interacted deliberately in the meantime.
- **Countdown assumption is explicitly flagged as non-authoritative**: the
  `REFRESH_INTERVAL_MS = 3h` countdown display is commented "Assumed
  forecast cadence ... Purely a countdown display; never asserted as a live
  guarantee" (`AqiCapsule.tsx:24-27`) — do not port this as a guarantee of
  actual data freshness. When the mirror is older than the interval the
  capsule switches from a countdown to data age (`Nh ago`, with a
  `data-stale` attribute on the countdown span) instead of sticking at
  `0:00` — stale data must read as old, never as an imminent refresh.

### `CapsulePanel` (`src/components/fluid/capsule/CapsulePanel.tsx`)

```ts
interface CapsulePanelProps {
  data: CapsuleDataReady          // from useCapsuleData()
  contentWidth: number             // one drag-page's travel distance, px
}
```

2-page swipeable report (current + range → 24h sparkline). Pointer-capture
drag with `rubberband()` resistance past the edges and a
`projectMomentum()`-based snap to whichever page the fling was heading
toward (`CapsulePanel.tsx:78-119`) — see `Spring`'s helpers in §"`Spring`"
above. Sparkline geometry is built by `buildSparkline` from `p10`/`p50`/`p90`
per hour (uncertainty band, not just the median) and returns `null` on an
empty series (§1 honest-absence).

### `useCapsuleData` (`src/components/fluid/capsule/useCapsuleData.ts`)

```ts
type CapsuleAlert = 'worsening' | 'steady' | 'unknown'
type CapsuleDataState =
  | { status: 'loading' }
  | { status: 'ready'; city: string; current: number; tier: AqiTier;
      range: { lo: number; hi: number }; series24h: CapsuleSeriesPoint[];
      updatedAt: string; alert: CapsuleAlert }
  | { status: 'missing' }
function useCapsuleData(): CapsuleDataState
```

Sources from `loadTft()` (`src/landing/shared/data/loaders`, the shared TFT
forecast mirror) and picks the "featured city" as the one with the highest
**current-hour** PM2.5 (`pickFeaturedCity`, `useCapsuleData.ts:64-72`) — an
independent implementation of the "thickest air first" pattern also used by
a landing chapter's `useDawnBriefingData`, explicitly *not* a shared/promoted
helper (`useCapsuleData.ts:60-63`). `tierFromPm25` uses cut points
`15/35/55/75/150` (6-tier AQI, `useCapsuleData.ts:41-48`) — shares the
`15/35/75` convention with `src/api/gridSnapshot.ts`'s 4-tier
`gradeFromPm25`, extended with two more EPA-style breakpoints.
`detectAlert` returns `'unknown'` (not `'steady'`) whenever the forward
window has zero finite PM2.5 readings — never silently defaults to
`'steady'` on missing data (`useCapsuleData.ts:74-85`).

### `SkyOrb` (`src/components/fluid/SkyOrb.tsx`)

```ts
interface SkyOrbProps {
  pm25: number | null            // null/NaN -> neutral idle ambient
  tier?: QualityTier              // 'low' | 'medium' | 'high', default 'high'
  className?: string
}
```

Canvas 2D ambient orb — particle color/density/breathing speed are all
driven by `pm25` through the same `15/35/75/150` breakpoint family as
`useCapsuleData` (`buildColorStops`, `SkyOrb.tsx:39-54`), continuously
interpolated (not stepped) between tier colors read live from CSS custom
properties `--aqi-good` / `--aqi-mod` / `--aqi-unh` / `--aqi-haz`
(`readCssColor`, `SkyOrb.tsx:33-37`). Particle count is capped per
`QualityTier` — `PARTICLE_CAP = { low: 24, medium: 60, high: 120 }`
(`SkyOrb.tsx:21`) — scaled further by a `0.35–0.65×` density factor. See §6
for the `IntersectionObserver` visibility gate and reduced-motion static
fallback.

## 4. Per-surface porting spec

Matrix and priorities as approved; each row maps to the concrete API in §3.

### Today

| Item | Priority | Spec |
|---|---|---|
| Glass hero | P1 | `<LiquidGlass variant="day">` wrapping the hero surface. Pass an explicit `radius`/`bezel` if the hero's corner treatment differs from the `20`/`34` defaults — both are plain props, not tokens. |
| Materialize panel | P1 | Wrap the panel's reveal in `<Materialize show={...} origin="...">`. `origin` should point at whatever visually "spawns" the panel (e.g. the element that triggered it) so the scale-in reads as coming from that point. |
| Forecast band | P1 | `useSmoothedProgress(rawProgressRef)` feeding whatever per-frame reader animates the band — do not read the raw ref directly if the goal is the "descent scrub inertia" feel documented in §1/§3. |
| Capsule anchor | P2 | `<AqiCapsule />` (defaults to `variant="night"`). If Today's hero is a `day` surface, decide explicitly whether the capsule should visually contrast (default) or match — matching is now a prop toggle: `<AqiCapsule variant="day" />` (§3). |
| Orb | P2 | `<SkyOrb pm25={...} tier={...} />` — feed the same PM2.5 reading the hero displays, not a separate fetch, so the orb and the numeric readout can't disagree. |

### Globe

| Item | Priority | Spec |
|---|---|---|
| HUD glass | P2 | `<LiquidGlass variant="night">` for the HUD panel(s), legend, and tooltip surfaces — **`variant` is fixed at `night`** for Globe per the approved matrix (Globe's own design-taxonomy entry already fixes it night-only, independent of day/night elsewhere — `.claude/rules/policy/design-taxonomy.md` §"표면 재질 축" catalog row 4). Multiple HUD surfaces can each get their own `LiquidGlass` instance; there's no multi-surface/shared-filter API — each mounts its own SVG filter on the `refract` tier. |

### Insights

| Item | Priority | Spec |
|---|---|---|
| Band | P1 | Same `.fluid-enter` + `--enter-i`/`--stagger` entry discipline as §1, applied per band/row on mount or on data update — no dedicated "Insights band" component exists yet in this repo to port 1:1; compose from `.fluid-enter` (CSS) and, if the band needs a glass surface rather than a flat one, `LiquidGlass`. |
| Materialize panel | P2 | Same `<Materialize>` contract as Today's panel (§3) — reuse the component directly, no Insights-specific variant exists. |
| Alignment physics (spring list reorder) | P3 — **spec only, not implemented in this repo** | See below. |

**Alignment physics spec (P3)**: this repo has no FLIP-based list-reorder
implementation to port (confirmed absent — no `getBoundingClientRect`-driven
reorder animation exists outside unrelated scroll/anchor hooks like
`src/components/wireframe/useAnchorRect.ts`). The recipe, built from
primitives that do exist:

1. **First** — before the reorder, capture each item's `getBoundingClientRect()`.
2. **Last** — apply the reorder (new DOM order / new sort), then capture
   each item's rect again.
3. **Invert** — for each item, compute `deltaX = firstRect.x - lastRect.x`
   (same for `y`).
4. **Play** — give each item its own `useSpring(delta, config)` pair (x and
   y, or a single 2D spring if one is added), `.jump(delta)` immediately (so
   it renders at the pre-move visual position with zero flash), then
   `.set(0)` so it animates back to its new resting position — subscribing
   and writing `translate3d` to the item's own ref, exactly the pattern
   `AqiCapsule` uses for width/height and `CapsulePanel` uses for drag
   `translateX` (§3).
5. **Config choice**: use a critically-damped config close to
   `useSmoothedProgress`'s `{ damping: 1, response: 0.25 }` (§1) rather than
   the capsule's underdamped ones — list items overshooting past their
   neighbors during a reorder reads as jittery, not springy, in a dense
   list.

This is a design recipe, not a claim that the code exists — implement it as
a new hook (e.g. `useFlipReorder`) when Insights actually needs it.

## 5. Accessibility contract

| Technique | Reduced-motion mapping | Source |
|---|---|---|
| `.fluid-enter` (CSS entry) | `transition: none` — no animation at all, not a shortened one | `motion.css:18-22` |
| `useSpring` | Every `.set()` call becomes `spring.jump(target)` — instant, zero-velocity | `useSpring.ts:56-62` |
| `useSmoothedProgress` | Returns the **same** raw `progressRef` object, no spring/rAF loop created at all | `useSmoothedProgress.ts:59-62` |
| `Materialize` | `--reduced` class: only `opacity` transitions; `transform`/`filter` forced to `none` | `fluid-materialize.css:18-26` |
| `SkyOrb` | Skips the rAF particle loop, draws one static frame (`drawStatic()`) instead | `SkyOrb.tsx:171-175` |
| `LiquidGlass` | Not motion-gated directly — but `prefers-reduced-transparency: reduce` forces the `tint` tier regardless of browser capability (§1) | `glassTier.ts:23-28` |

All of the above read `useReducedMotion()`
(`src/landing/shared/perf/useReducedMotion.ts`) — a `matchMedia('(prefers-reduced-motion: reduce)')`
subscription, SSR-safe (defaults `false` when `window`/`matchMedia` are
unavailable, `useReducedMotion.ts:8-13`).

**Capsule focus trap / `Escape`**: documented under §3 `AqiCapsule` —
`Tab`/`Shift+Tab` wrap within the panel's focusable elements while open,
`Escape` closes and returns focus to the trigger button
(`AqiCapsule.tsx:116-122,181-217`). A pointer-down outside the capsule root
also closes it (`AqiCapsule.tsx:204-208`).

**Glass text contrast**: not owned by this file — the AA-contrast rule for
sky-glass surfaces (phase-aware ink, dark-first with light-phase exceptions)
is governed by `.claude/rules/policy/design-taxonomy.md` §"표면 재질 축" in
the parent monorepo; this repo's `LiquidGlass`/glass tokens (§2) are a
consumer of that contract, not a redefinition of it. Porting pages should
verify contrast against whatever text sits on the glass fill per that rule,
not assume the fill/border tokens alone guarantee AA.

## 6. Performance budget

- **Single rAF engine for all springs**: `SpringEngine`
  (`src/motion/spring.ts:82-120`) is a module singleton — every `useSpring`
  instance across the whole page shares one `requestAnimationFrame` loop,
  which self-stops once every registered spring reports `isSettled()`. This
  is why the pattern in §3 (`subscribe` → write to a ref's inline style,
  never `useState`) matters for a porting page with many springs: it keeps
  React re-renders out of the animation loop entirely.
- **Displacement-map cache cap**: `buildDisplacementMap` caches by
  `${w}x${h}:${radius}:${bezel}` key, capped at `CACHE_LIMIT = 16` entries
  with FIFO eviction (oldest key deleted first) once the cache exceeds that
  size (`src/components/fluid/displacementMap.ts:29-30,93-97`). A porting
  page that renders many differently-sized `LiquidGlass` `refract`-tier
  surfaces should be aware resizes regenerate (and can evict) cache entries.
- **Offscreen stop via `IntersectionObserver`**: `SkyOrb` observes its own
  wrapper element and only runs the particle rAF loop while
  `isIntersecting` is true — off-screen, the loop simply isn't started/kept
  running (`SkyOrb.tsx:106-115,171-175`). `LiquidGlass` has no equivalent
  offscreen gate; its cost when off-screen is whatever the browser's own
  `backdrop-filter`/SVG-filter compositing does, not JS-driven.
- **`ResizeObserver` debounce**: `LiquidGlass`'s displacement-map rebuild is
  debounced `150ms` after the last resize event before recomputing
  (`RESIZE_DEBOUNCE_MS = 150`, `LiquidGlass.tsx:15,41-49`) — not
  immediate-per-frame.
- **`step()` dt clamp + substep integration**: every spring step clamps
  `dtSec` to `MAX_DT_SEC = 0.064` seconds first (`src/motion/spring.ts:13`),
  so a tab-backgrounding stall (huge real elapsed time on the next rAF
  callback) can't inject one arbitrarily large physics step. That clamped
  step is then integrated in fixed `MAX_SUBSTEP_SEC = 0.004` (250Hz)
  substeps rather than as a single semi-implicit Euler step
  (`src/motion/spring.ts:16,57-73`) — a single step at the full clamped
  `0.064s` is **not** unconditionally stable for every config in this
  system (a stiff, lightly-damped spring like `CapsulePanel`'s
  `DRAG_SPRING` — `damping: 0.72, response: 0.32` — diverges under it, an
  amplifying eigenvalue of the discrete update), while the substepped
  integration is stable across the full `response >= 0.05` range this
  system allows.

## 7. Test conventions

- **rAF must be stubbed with a deterministic queue, not real timing.**
  `useSmoothedProgress.test.ts` documents why: "Real rAF timing can't be
  driven deterministically by fake timers" (`useSmoothedProgress.test.ts:1-8`).
  Two patterns are in active use:
  - A **FIFO frame queue** (`makeFrameQueue()`,
    `useSmoothedProgress.test.ts:24-45`) for anything that needs multiple
    ticks with a controlled `dt` — `flush(n, dtMs = 16)` pops whatever's
    queued and invokes it iteratively (not recursively, so a self-rescheduling
    loop like `SpringEngine`'s tick can't blow the call stack).
  - A **single-microtask stub** (`vi.stubGlobal('requestAnimationFrame', (cb) => { queueMicrotask(() => cb(0)); return 1 })`,
    used identically in `Materialize.test.tsx:6-11` and the chapter-scene
    smoke tests) when the test only needs "the one rAF-scheduled effect to
    settle," not multi-frame physics.
- **`jsdom` has no `matchMedia`/`CSS.supports` by default** — this repo's
  vitest environment leaves both unimplemented, so `useReducedMotion()`
  and `detectGlassTier()` need `vi.stubGlobal('matchMedia', ...)` /
  `vi.stubGlobal('CSS', ...)` stubs in any test that renders a component
  calling them, even indirectly (`Materialize.test.tsx:13-20`,
  `glassTier.test.ts` throughout). Absent a stub, `detectGlassTier()`
  always resolves to `tint` (`LiquidGlass.test.tsx:23-31`) — write glass
  tier tests against explicit stubbed environments, not the jsdom default,
  if the `refract`/`blur` code paths need coverage.
- **`SpringEngine` is a module singleton across tests** —
  `useSmoothedProgress.test.ts:79-87` documents a real gotcha: after
  `.remove()`, the engine can leave a stale `rafId` if a fresh fake-rAF
  queue is swapped in per-test; the fix used here is sharing **one**
  `makeFrameQueue()` across an entire `describe` block so a leftover
  scheduled callback can still fire and self-heal. Port this pattern rather
  than instantiating a new frame queue per `it()` when testing anything that
  touches `useSpring`.
- **`glassTier.test.ts` resets module cache state explicitly** —
  `__resetGlassTierForTest()` (test-only export,
  `src/components/fluid/glassTier.ts:46-48`) must be called in `beforeEach`
  *and* `afterEach`, since `detectGlassTier()` caches its result for the
  module's lifetime (§1).
- **Chapter/scene smoke tests wrap in `QualityProvider`** — any component
  that (transitively) reads render-quality tier state is rendered inside
  `<QualityProvider>` in tests (`src/landing/ch1-atmos/Ch1AtmosScene.test.tsx:29-34`
  and the two sibling chapter test files) with the same rAF-microtask stub
  as above, so the provider's own FPS probe settles without depending on
  real frame timing.
- **`afterEach(cleanup)` is explicit everywhere in this repo** — `@testing-library/react`'s
  auto-cleanup is **not** globally registered here; every fluid test file
  calls `cleanup()` (imported from `@testing-library/react`) in an explicit
  `afterEach`, alongside `vi.unstubAllGlobals()`. Skipping this leaves a
  previous test's still-mounted component (and any rAF loop it started)
  alive into the next test (`useSmoothedProgress.test.ts:9-13` explains the
  failure mode this avoids).

## Not documented (absent from source)

- No shared spring-preset module/registry — see §1 "Physical parameters."
- No FLIP list-reorder implementation exists to port for Insights §4 P3 —
  documented there as a spec, not a description of code.
- No dedicated "Insights band" component exists yet — §4's Insights row
  describes composition from existing primitives (`.fluid-enter`,
  `LiquidGlass`), not a 1:1 port target.
- `LiquidGlass` has no built-in offscreen/visibility gate (unlike `SkyOrb`'s
  `IntersectionObserver`) — noted in §6, not something to assume exists.
