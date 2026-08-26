/**
 * GlobePlaceholder — the honest landing spot for Chapter 5's CTA link.
 *
 * The real Globe surface (AirLens-platform `apps/web`'s WebGL 3D globe) is not
 * ported into this repo yet — a dead `/globe` href behind "EXPLORE THE GLOBE ↗"
 * would be worse than no CTA at all, so this page exists purely so the link
 * lands somewhere real: `GlobeFallback` (already ported, a static 2D SVG) plus
 * one plain sentence naming what this snapshot is, and a way back to the
 * flight. Replace this page once the actual Globe chapter is ported.
 */
import GlobeFallback from '../components/globe/GlobeFallback'

export default function GlobePlaceholder() {
  return (
    <div
      className="obs-surface"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--obs-void)',
      }}
    >
      <GlobeFallback message="This surface is under construction — the landing flight runs on this repo's latest mirror snapshot in the meantime." />
      <p
        style={{
          margin: '0 auto',
          padding: '24px 0 40px',
          fontFamily: 'var(--obs-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
        }}
      >
        <a href="/landing" style={{ color: 'var(--obs-hud)' }}>
          ← Back to the flight
        </a>
      </p>
    </div>
  )
}
