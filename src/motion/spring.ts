// Semi-implicit (symplectic) Euler spring integrator + a shared rAF driver.
// No React dependency — src/motion/useSpring.ts wires this into components.

export interface SpringConfig {
  /** Damping ratio ζ. 1 = critically damped, <1 = overshoots. */
  damping: number
  /** Response time r, in seconds — roughly the time to first reach target. */
  response: number
}

const SETTLE_VELOCITY_EPS = 0.02
const SETTLE_POSITION_EPS = 0.02
const MAX_DT_SEC = 0.064
// 250Hz — unconditionally stable for semi-implicit Euler across the full
// response range (>=0.05s per the clamp in setConfig/constructor).
const MAX_SUBSTEP_SEC = 0.004

export class Spring {
  private p: number
  private v = 0
  private target: number
  private damping: number
  private omega: number

  constructor(initial: number, config: SpringConfig) {
    this.p = initial
    this.target = initial
    this.damping = config.damping
    this.omega = (2 * Math.PI) / Math.max(0.05, config.response)
  }

  setConfig(config: SpringConfig): void {
    this.damping = config.damping
    this.omega = (2 * Math.PI) / Math.max(0.05, config.response)
  }

  setTarget(target: number, opts?: { velocity?: number }): void {
    this.target = target
    if (opts?.velocity !== undefined) this.v += opts.velocity
  }

  /** Snaps to a value with zero velocity — used for reduced-motion. */
  jump(value: number): void {
    this.p = value
    this.target = value
    this.v = 0
  }

  get(): number {
    return this.p
  }

  isSettled(): boolean {
    return Math.abs(this.v) < SETTLE_VELOCITY_EPS && Math.abs(this.p - this.target) < SETTLE_POSITION_EPS
  }

  step(dtSec: number): boolean {
    // Substep the integration — at the clamped MAX_DT_SEC, a single
    // semi-implicit Euler step can diverge for stiff configs (high omega /
    // low damping), overshooting to amplitudes orders of magnitude past the
    // target. Fixed 250Hz substeps keep every config in this system stable.
    let remaining = Math.min(dtSec, MAX_DT_SEC)
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_SUBSTEP_SEC)
      remaining -= dt
      const a = -(this.omega * this.omega) * (this.p - this.target) - 2 * this.damping * this.omega * this.v
      this.v += a * dt
      this.p += this.v * dt
    }

    if (this.isSettled()) {
      this.p = this.target
      this.v = 0
      return true
    }
    return false
  }
}

type Tickable = { step(dtSec: number): boolean }

/** Module-singleton rAF driver — runs only while >=1 spring is unsettled. */
class SpringEngineImpl {
  private items = new Set<Tickable>()
  private rafId: number | null = null
  private lastTs: number | null = null

  add(item: Tickable): void {
    this.items.add(item)
    this.ensureRunning()
  }

  remove(item: Tickable): void {
    this.items.delete(item)
  }

  private ensureRunning(): void {
    if (this.rafId !== null) return
    if (typeof requestAnimationFrame !== 'function') return
    this.lastTs = null
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (ts: number): void => {
    const dtSec = this.lastTs === null ? 0 : (ts - this.lastTs) / 1000
    this.lastTs = ts

    for (const item of this.items) {
      const settled = item.step(dtSec)
      if (settled) this.items.delete(item)
    }

    if (this.items.size > 0) {
      this.rafId = requestAnimationFrame(this.tick)
    } else {
      this.rafId = null
      this.lastTs = null
    }
  }
}

export const SpringEngine = new SpringEngineImpl()

/** Momentum projection for a fling — final displacement in px, exponential decay model. */
export function projectMomentum(velocityPxPerSec: number, decel = 0.998): number {
  return ((velocityPxPerSec / 1000) * decel) / (1 - decel)
}

/** Rubberband resistance for out-of-bounds drag — excess in px scaled down by coeff. */
export function rubberband(excess: number, coeff = 0.35): number {
  return excess * coeff
}
