import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import PublicPageContainer from './PublicPageContainer'

describe('PublicPageContainer', () => {
  it('renders tier="text" with data-tier attr', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="text">
        <p>article body</p>
      </PublicPageContainer>,
    )
    // Assert
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('data-tier')).toBe('text')
    expect(root.classList.contains('public-page-container')).toBe(true)
  })

  it('renders tier="hub" with data-tier attr', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="hub">
        <div>hub</div>
      </PublicPageContainer>,
    )
    // Assert
    expect((container.firstChild as HTMLElement).getAttribute('data-tier')).toBe('hub')
  })

  it('renders tier="wide" with data-tier attr', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="wide">
        <canvas />
      </PublicPageContainer>,
    )
    // Assert
    expect((container.firstChild as HTMLElement).getAttribute('data-tier')).toBe('wide')
  })

  it('defaults to <main> element', () => {
    // Act
    const { container } = render(<PublicPageContainer tier="text">x</PublicPageContainer>)
    // Assert
    expect((container.firstChild as HTMLElement).tagName).toBe('MAIN')
  })

  it('respects polymorphic `as` prop', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="hub" as="section">
        x
      </PublicPageContainer>,
    )
    // Assert
    expect((container.firstChild as HTMLElement).tagName).toBe('SECTION')
  })

  it('renders children', () => {
    // Act
    const { getByText } = render(
      <PublicPageContainer tier="text">
        <span>hello</span>
      </PublicPageContainer>,
    )
    // Assert
    expect(getByText('hello')).not.toBeNull()
  })

  it('forwards data-page attr', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="text" data-page="article">
        x
      </PublicPageContainer>,
    )
    // Assert
    expect((container.firstChild as HTMLElement).getAttribute('data-page')).toBe('article')
  })

  it('merges custom className with base class', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="text" className="custom-extra">
        x
      </PublicPageContainer>,
    )
    // Assert
    const root = container.firstChild as HTMLElement
    expect(root.classList.contains('public-page-container')).toBe(true)
    expect(root.classList.contains('custom-extra')).toBe(true)
  })

  it('forwards arbitrary data-* attrs (Globe platform/touch case)', () => {
    // Act
    const { container } = render(
      <PublicPageContainer tier="wide" data-page="globe" data-platform="ios" data-touch="on">
        <canvas />
      </PublicPageContainer>,
    )
    // Assert
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('data-page')).toBe('globe')
    expect(root.getAttribute('data-platform')).toBe('ios')
    expect(root.getAttribute('data-touch')).toBe('on')
  })
})
