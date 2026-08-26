import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import GlobeTimeline from './GlobeTimeline'
import { useGlobeStore } from '../../../store/globeStore'
import type { TimelineFrameMeta } from '../../../api/timeline'

const INITIAL = useGlobeStore.getState()

const FRAMES: TimelineFrameMeta[] = [
  { validTime: '2026-08-26T12:00:00Z', leadHours: 0, cycle: '2026-08-26T12:00:00Z', file: 'a.json', offsetHours: -3 },
  { validTime: '2026-08-26T18:00:00Z', leadHours: 6, cycle: '2026-08-26T12:00:00Z', file: 'b.json', offsetHours: 3 },
]

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

afterEach(cleanup)

describe('GlobeTimeline', () => {
  it('states why the strip is unusable instead of rendering an empty track', () => {
    // Arrange
    useGlobeStore.setState({ timelineFrames: null, timelineStale: false })
    // Act
    render(<GlobeTimeline />)
    // Assert
    expect(screen.getByText(/Forecast frames unavailable/i)).toBeTruthy()
  })

  it('distinguishes a stale manifest from an absent one', () => {
    // Arrange
    useGlobeStore.setState({ timelineFrames: FRAMES, timelineStale: true })
    // Act
    render(<GlobeTimeline />)
    // Assert
    expect(screen.getByText(/frames are stale/i)).toBeTruthy()
  })

  it('renders one button per published frame plus the live grid', () => {
    // Arrange
    useGlobeStore.setState({ timelineFrames: FRAMES, timelineStale: false })
    // Act
    render(<GlobeTimeline />)
    const frames = screen.getByRole('radiogroup', { name: /forecast frame/i })
    // Assert
    expect(frames.querySelectorAll('button')).toHaveLength(FRAMES.length + 1)
    expect(screen.getByText('NOW')).toBeTruthy()
  })

  it('scrubs to the offset of the frame that was picked', () => {
    // Arrange
    useGlobeStore.setState({ timelineFrames: FRAMES, timelineStale: false })
    render(<GlobeTimeline />)
    // Act
    fireEvent.click(screen.getByText('+3h'))
    // Assert
    expect(useGlobeStore.getState().timeOffsetHours).toBe(3)
  })
})
