import { describe, it, expect } from 'vitest'
import { easeOutCubic, computeBlend, isBlendMidpoint, resolveDisplayedFrame } from './crossfade'

describe('crossfade — pure timing helpers (V-W3)', () => {
  describe('easeOutCubic', () => {
    it('starts at 0 and ends at 1', () => {
      // Arrange / Act / Assert
      expect(easeOutCubic(0)).toBe(0)
      expect(easeOutCubic(1)).toBe(1)
    })

    it('clamps outside [0,1] instead of overshooting', () => {
      expect(easeOutCubic(-0.5)).toBe(0)
      expect(easeOutCubic(1.5)).toBe(1)
    })

    it('is monotonically increasing', () => {
      const samples = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]
      for (let i = 1; i < samples.length; i++) {
        expect(easeOutCubic(samples[i])).toBeGreaterThanOrEqual(easeOutCubic(samples[i - 1]))
      }
    })
  })

  describe('computeBlend', () => {
    it('is 0 at elapsed=0 and 1 at elapsed>=duration', () => {
      expect(computeBlend(0, 280)).toBe(0)
      expect(computeBlend(280, 280)).toBe(1)
      expect(computeBlend(1000, 280)).toBe(1)
    })

    it('is strictly between 0 and 1 mid-tween', () => {
      const blend = computeBlend(140, 280)
      expect(blend).toBeGreaterThan(0)
      expect(blend).toBeLessThan(1)
    })

    it('treats a non-positive duration as an instant snap', () => {
      expect(computeBlend(0, 0)).toBe(1)
      expect(computeBlend(50, -10)).toBe(1)
    })
  })

  describe('isBlendMidpoint', () => {
    it('is false below 0.5 and true at/above 0.5', () => {
      expect(isBlendMidpoint(0.49)).toBe(false)
      expect(isBlendMidpoint(0.5)).toBe(true)
      expect(isBlendMidpoint(0.99)).toBe(true)
    })
  })

  describe('resolveDisplayedFrame — single-timestamp guarantee', () => {
    // Iron Law of the HUD: no timestamp is ever displayed "40% A / 60% B" — the
    // reader always gets one honest answer, snapping exactly at the fade midpoint.
    it('reports the previous frame below the midpoint', () => {
      expect(resolveDisplayedFrame(0, 'prev', 'next')).toBe('prev')
      expect(resolveDisplayedFrame(0.49, 'prev', 'next')).toBe('prev')
    })

    it('reports the next frame at and above the midpoint', () => {
      expect(resolveDisplayedFrame(0.5, 'prev', 'next')).toBe('next')
      expect(resolveDisplayedFrame(1, 'prev', 'next')).toBe('next')
    })
  })
})
