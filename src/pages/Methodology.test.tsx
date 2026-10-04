// Methodology — the one-column "On this page" TOC toggle (F34). The list stays
// in the DOM when collapsed (anchors / SEO); CSS decides visibility.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import Methodology from './Methodology'
import { METHODOLOGY_SECTIONS } from '../content/methodologySections'

afterEach(cleanup)

describe('Methodology — TOC toggle', () => {
  it('starts collapsed with the toggle wired to the list', () => {
    // Arrange
    render(<Methodology />)
    // Act
    const toggle = screen.getByRole('button', { name: /on this page/i })
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    // Assert
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('type')).toBe('button')
    expect(list).not.toBeNull()
    expect(list?.getAttribute('data-state')).toBe('collapsed')
  })

  it('toggles aria-expanded and the list state on click', () => {
    // Arrange
    render(<Methodology />)
    const toggle = screen.getByRole('button', { name: /on this page/i })
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    // Act
    fireEvent.click(toggle)
    // Assert
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(list?.getAttribute('data-state')).toBe('expanded')
    // Act
    fireEvent.click(toggle)
    // Assert
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(list?.getAttribute('data-state')).toBe('collapsed')
  })

  it('keeps every section link in the DOM while collapsed', () => {
    // Arrange / Act
    render(<Methodology />)
    const nav = screen.getByRole('navigation', { name: /methodology sections/i })
    // Assert
    for (const s of METHODOLOGY_SECTIONS) {
      expect(nav.querySelector(`a[href="#${s.sectionId}"]`)).not.toBeNull()
    }
  })
})
