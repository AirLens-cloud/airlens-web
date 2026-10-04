import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import Glossary from './Glossary'

afterEach(() => cleanup())

describe('Glossary category filter', () => {
  it('uses the wrapping segmented group so no chip is pushed out of a narrow container', () => {
    // Arrange / Act
    render(<Glossary />)
    const group = screen.getByRole('group', { name: 'Filter by category' })
    // Assert
    expect(group.classList.contains('seg')).toBe(true)
    expect(group.classList.contains('seg--wrap')).toBe(true)
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'All', 'Nature', 'Quality', 'Method', 'UI',
    ])
  })

  it('still filters when the last (UI) chip is chosen', () => {
    // Arrange
    render(<Glossary />)
    const group = screen.getByRole('group', { name: 'Filter by category' })
    // Act
    fireEvent.click(group.querySelectorAll('button')[4])
    // Assert
    expect(group.querySelectorAll('button')[4].getAttribute('aria-pressed')).toBe('true')
  })
})
