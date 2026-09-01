// Research Commons has zero published receipts right now (no submission
// pipeline exists yet — spec §14). The thing this suite guards against is
// the temptation to fill the empty grid with an example/demo card
// (EVIDENCE_CONTRACT.md §6-1 "synthetic/demo 대체 절대 금지") — the empty
// state must say honestly that nothing is published, not simulate a receipt.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Research from './Research'

afterEach(() => {
  cleanup()
})

describe('Research page', () => {
  it('renders an honest empty state with no receipt cards', () => {
    // Act
    const { container, getByTestId } = render(<Research />)
    // Assert
    expect(getByTestId('rsc-empty')).toBeTruthy()
    expect(container.querySelectorAll('.rsc-card, [data-testid="rsc-receipt-card"]').length).toBe(0)
  })

  it('states the published count as 0 and explains what a receipt is', () => {
    // Act
    const { getByText } = render(<Research />)
    // Assert
    expect(getByText(/0 PUBLISHED/)).toBeTruthy()
    expect(getByText(/No receipts published yet/)).toBeTruthy()
  })

  it('renders the fixed receipt anatomy chain', () => {
    // Act
    const { getByText } = render(<Research />)
    // Assert
    expect(
      getByText(
        'question → figure → method → supports / does not support → withheld · insufficient n · failed slices → reproduce → citation · immutable',
      ),
    ).toBeTruthy()
  })
})
