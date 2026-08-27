import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useGlobeStore } from '../store/globeStore'
import { getWindDataTexture, getWindMeta } from '../components/globe/three/systems/windTexture'
import { WIND_FRESHNESS_SLA_H } from '../lib/config/globeOntology'
import type { WindFieldMeta, WindFieldStatus } from '../types/globe';

/** Older than the collection SLA → say so rather than presenting it as current. */
function statusFor(meta: WindFieldMeta | null): WindFieldStatus {
  if (!meta) return 'ready'
  const generated = Date.parse(meta.generatedAt)
  if (Number.isNaN(generated)) return 'ready'
  const ageH = (Date.now() - generated) / 3_600_000
  return ageH > WIND_FRESHNESS_SLA_H ? 'stale' : 'ready'
}

export function useWindTexture(): THREE.DataTexture | null {
  const windLevel = useGlobeStore((s) => s.windLevel)
  const setWindFieldState = useGlobeStore((s) => s.setWindFieldState)
  const [tex, setTex] = useState<THREE.DataTexture | null>(null)

  useEffect(() => {
    let cancelled = false
    setWindFieldState('loading', null)
    getWindDataTexture(windLevel).then((t) => {
      if (cancelled) return
      setTex(t)
      if (!t) {
        // No data at this level. The UI must show that, not the previous level's air.
        setWindFieldState('unavailable', null)
        return
      }
      const meta = getWindMeta(windLevel)
      setWindFieldState(statusFor(meta), meta)
    })
    return () => { cancelled = true }
  }, [windLevel, setWindFieldState])

  return tex
}
