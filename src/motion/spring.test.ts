// Deterministic spring tests — real rAF timing is stubbed out; `Spring.step`
// is driven directly with fixed dt so results don't depend on the runner's
// actual frame cadence.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Spring, SpringEngine, projectMomentum, rubberband } from './spring'

const FIXED_DT = 1 / 60
const MAX_STEPS = 3000

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Spring — critically damped (zeta=1)', () => {
  it('converges to target within a bounded number of steps', () => {
    // Arrange
    const spring = new Spring(0, { damping: 1, response: 0.3 })
    spring.setTarget(1)
    // Act
    let done = false
    for (let i = 0; i < MAX_STEPS && !done; i++) {
      done = spring.step(FIXED_DT)
    }
    // Assert
    expect(done).toBe(true)
    expect(spring.get()).toBe(1)
  })
})

describe('Spring — underdamped (zeta=0.55)', () => {
  it('overshoots the target before settling', () => {
    // Arrange
    const spring = new Spring(0, { damping: 0.55, response: 0.3 })
    spring.setTarget(1)
    // Act
    let maxValue = -Infinity
    let done = false
    for (let i = 0; i < MAX_STEPS && !done; i++) {
      done = spring.step(FIXED_DT)
      maxValue = Math.max(maxValue, spring.get())
    }
    // Assert
    expect(done).toBe(true)
    expect(maxValue).toBeGreaterThan(1)
  })
})

describe('Spring — setTarget velocity inheritance', () => {
  it('keeps position continuous when re-targeted mid-flight', () => {
    // Arrange
    const spring = new Spring(0, { damping: 0.8, response: 0.3 })
    spring.setTarget(1)
    for (let i = 0; i < 5; i++) spring.step(FIXED_DT)
    const positionBeforeRetarget = spring.get()
    // Act — re-target with an inherited velocity kick; position must not jump.
    spring.setTarget(2, { velocity: 0.5 })
    // Assert
    expect(spring.get()).toBe(positionBeforeRetarget)
  })
})

describe('Spring — stability at clamped dt (DRAG_SPRING config)', () => {
  it('never diverges and converges to target when driven at the max clamped dt', () => {
    // Arrange — matches CapsulePanel's DRAG_SPRING (damping 0.72, response 0.32),
    // the config that diverged under single-step semi-implicit Euler at dt=0.064.
    const spring = new Spring(0, { damping: 0.72, response: 0.32 })
    spring.setTarget(-280)
    // Act
    let done = false
    for (let i = 0; i < 200 && !done; i++) {
      done = spring.step(0.064)
      // Assert — no divergence at any point along the way.
      expect(Math.abs(spring.get())).toBeLessThanOrEqual(280 * 1.5)
    }
    // Assert — converges to target.
    expect(done).toBe(true)
    expect(spring.get()).toBeCloseTo(-280, 0)
  })
})

describe('projectMomentum / rubberband', () => {
  it('projects a fling distance from velocity', () => {
    expect(projectMomentum(1000)).toBeCloseTo(499, 0)
  })

  it('scales excess drag by the resistance coefficient', () => {
    expect(rubberband(100)).toBe(35)
  })
})

describe('SpringEngine', () => {
  it('does not reschedule rAF once every tracked item has settled', () => {
    // Arrange
    let rafCalls = 0
    let scheduledCb: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCalls++
      scheduledCb = cb
      return rafCalls
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const settlesImmediately = { step: () => true }

    // Act
    SpringEngine.add(settlesImmediately)
    expect(rafCalls).toBe(1)
    scheduledCb!(16)

    // Assert — item settled on its first tick, so no further frame is queued.
    expect(rafCalls).toBe(1)
  })
})
