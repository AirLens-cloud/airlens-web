// BoundedImage — QA finding 2026-09-01: some Dispatch card images failed to
// load (hotlink block) and rendered the browser's default broken-image
// icon, violating the "bounded media, no broken-image icon" contract. Pins:
// a load failure falls back to the gradient placeholder, and the two
// no-`src` behaviors (card vs. hero) stay distinct via `placeholderWhenAbsent`.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import BoundedImage from './BoundedImage'

afterEach(() => {
  cleanup()
})

describe('BoundedImage', () => {
  it('renders an <img> with an onError handler when a src is given', () => {
    const { container } = render(<BoundedImage src="https://example.com/a.jpg" alt="" index={0} />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('https://example.com/a.jpg')
  })

  it('falls back to the gradient placeholder (not a broken-image icon) when the image fails to load', () => {
    const { container } = render(<BoundedImage src="https://example.com/dead.jpg" alt="" index={0} />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.content-thumb--placeholder')).toBeTruthy()
  })

  it('shows the placeholder for a missing src by default (card behavior)', () => {
    const { container } = render(<BoundedImage src={null} alt="" index={0} />)
    expect(container.querySelector('.content-thumb--placeholder')).toBeTruthy()
  })

  it('renders nothing for a missing src when placeholderWhenAbsent is false (hero behavior — no image is not a failure)', () => {
    const { container } = render(<BoundedImage src={null} alt="" index={0} placeholderWhenAbsent={false} />)
    expect(container.firstChild).toBeNull()
  })
})
