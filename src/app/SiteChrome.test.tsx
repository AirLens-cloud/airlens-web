// SiteChrome — mobile nav focus trap (review round 1, WCAG 2.4.3/2.1.1).
// GlobalNav owns the mobile-open boolean; SiteChrome applies `inert` to the
// page content underneath while the panel is open so Tab can't escape into
// hidden content. Chrome-variant routing itself is covered by App.test.tsx.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import SiteChrome from './SiteChrome'

afterEach(cleanup)

describe('SiteChrome — mobile nav focus trap', () => {
  it('is not inert by default', () => {
    // Arrange / Act
    const { container } = render(
      <SiteChrome variant="site">
        <p>page content</p>
      </SiteChrome>,
    )
    // Assert
    const main = container.querySelector('#main') as HTMLElement
    expect(main.hasAttribute('inert')).toBe(false)
  })

  it('makes the page content inert while the mobile panel is open, and removes it again on close', () => {
    // Arrange
    const { container } = render(
      <SiteChrome variant="site">
        <p>page content</p>
      </SiteChrome>,
    )
    const main = container.querySelector('#main') as HTMLElement
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    // Act — open
    fireEvent.click(toggle)
    // Assert — open
    expect(main.hasAttribute('inert')).toBe(true)
    // Act — close
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    // Assert — closed
    expect(main.hasAttribute('inert')).toBe(false)
  })

  it('does not wrap bare-chrome pages, so there is no inert target to toggle', () => {
    // Arrange / Act
    const { container } = render(
      <SiteChrome variant="bare">
        <p>page content</p>
      </SiteChrome>,
    )
    // Assert
    expect(container.querySelector('#main')).toBeNull()
    expect(container.querySelector('.chrome-shell')).toBeNull()
  })
})
