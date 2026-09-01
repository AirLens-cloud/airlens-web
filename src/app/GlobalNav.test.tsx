// GlobalNav — disclosure navigation behavior (AAA). Covers open/close,
// Escape + focus return, aria-current, and the mobile toggle. Route content
// itself is covered by nav.test.ts's drift check, not here.
//
// `@testing-library/jest-dom` isn't set up in this repo (see
// Ch1AtmosScene.test.tsx), so attribute checks read `getAttribute()`
// directly rather than using `toHaveAttribute()`.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import GlobalNav from './GlobalNav'

function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

afterEach(() => {
  cleanup()
  setPath('/')
})

describe('GlobalNav — desktop disclosure', () => {
  it('is closed by default and opens the dropdown on trigger click', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const trigger = screen.getByRole('button', { name: 'Today' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull()
    // Act
    fireEvent.click(trigger)
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toBeNull()
  })

  it('closes the dropdown on a second trigger click', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const trigger = screen.getByRole('button', { name: 'Today' })
    fireEvent.click(trigger)
    // Act
    fireEvent.click(trigger)
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull()
  })

  it('opening one group closes any other open group', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const today = screen.getByRole('button', { name: 'Today' })
    const map = screen.getByRole('button', { name: 'Map' })
    fireEvent.click(today)
    // Act
    fireEvent.click(map)
    // Assert
    expect(today.getAttribute('aria-expanded')).toBe('false')
    expect(map.getAttribute('aria-expanded')).toBe('true')
  })

  it('Escape closes the open group and returns focus to its trigger', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const trigger = screen.getByRole('button', { name: 'Today' })
    fireEvent.click(trigger)
    const dropdownLink = screen.getByRole('link', { name: 'Overview' })
    // Act
    fireEvent.keyDown(dropdownLink, { key: 'Escape' })
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes an open group on an outside click', () => {
    // Arrange
    render(
      <div>
        <GlobalNav variant="site" />
        <button type="button">outside</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Today' })
    fireEvent.click(trigger)
    // Act
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('does not use an ARIA menubar role (APG disclosure pattern, not a menu)', () => {
    // Arrange / Act
    render(<GlobalNav variant="site" />)
    // Assert
    expect(screen.queryByRole('menubar')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('GlobalNav — aria-current', () => {
  it('marks the active group trigger with aria-current="true"', () => {
    // Arrange
    setPath('/globe')
    // Act
    render(<GlobalNav variant="site" />)
    // Assert
    expect(screen.getByRole('button', { name: 'Map' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBeNull()
  })

  it('marks the exact-match dropdown item with aria-current="page"', () => {
    // Arrange
    setPath('/today')
    render(<GlobalNav variant="site" />)
    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    // Assert
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })

  it('marks a country-detail path as inside the Map group', () => {
    // Arrange
    setPath('/country/US')
    // Act
    render(<GlobalNav variant="site" />)
    // Assert
    expect(screen.getByRole('button', { name: 'Map' }).getAttribute('aria-current')).toBe('true')
  })
})

describe('GlobalNav — mobile toggle', () => {
  it('opens the nav panel and flips aria-expanded on the hamburger button', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' })
    expect(primaryNav.getAttribute('data-mobile-open')).toBe('false')
    // Act
    fireEvent.click(toggle)
    // Assert
    expect(screen.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded')).toBe('true')
    expect(primaryNav.getAttribute('data-mobile-open')).toBe('true')
  })

  it('Escape closes the mobile panel and returns focus to the toggle', () => {
    // Arrange
    render(<GlobalNav variant="site" />)
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(toggle)
    const closeToggle = screen.getByRole('button', { name: 'Close menu' })
    // Act
    fireEvent.keyDown(document, { key: 'Escape' })
    // Assert
    expect(screen.getByRole('navigation', { name: 'Primary' }).getAttribute('data-mobile-open')).toBe('false')
    expect(document.activeElement).toBe(closeToggle)
  })
})
