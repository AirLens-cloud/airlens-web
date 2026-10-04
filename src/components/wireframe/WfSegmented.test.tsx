import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import WfSegmented from './WfSegmented'

afterEach(() => cleanup())

const ITEMS = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
]

describe('WfSegmented layout prop', () => {
  it('keeps the plain `seg` class when no layout is given (existing callers unaffected)', () => {
    // Arrange / Act
    const { getByRole } = render(<WfSegmented items={ITEMS} activeKey="a" onChange={() => {}} ariaLabel="Pick" />)
    // Assert
    expect(getByRole('group').className).toBe('seg')
  })

  it.each([
    ['wrap', 'seg seg--wrap'],
    ['scroll', 'seg seg--scroll'],
  ] as const)('maps layout="%s" to the %s modifier class', (layout, expected) => {
    // Arrange / Act
    const { getByRole } = render(
      <WfSegmented items={ITEMS} activeKey="a" onChange={() => {}} ariaLabel="Pick" layout={layout} />,
    )
    // Assert
    expect(getByRole('group').className).toBe(expected)
  })

  it('composes the modifier with a caller className', () => {
    // Arrange / Act
    const { getByRole } = render(
      <WfSegmented items={ITEMS} activeKey="a" onChange={() => {}} ariaLabel="Pick" layout="scroll" className="extra" />,
    )
    // Assert
    expect(getByRole('group').className).toBe('seg seg--scroll extra')
  })

  it('still reports the clicked key and marks the active item', () => {
    // Arrange
    const onChange = vi.fn()
    const { getByText } = render(
      <WfSegmented items={ITEMS} activeKey="a" onChange={onChange} ariaLabel="Pick" layout="wrap" />,
    )
    // Act
    fireEvent.click(getByText('Beta'))
    // Assert
    expect(onChange).toHaveBeenCalledWith('b')
    expect(getByText('Alpha').getAttribute('aria-pressed')).toBe('true')
  })
})
