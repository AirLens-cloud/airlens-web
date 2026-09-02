// NewsCrossLinks — UI Tier-1 P2-B chip row: real-data-only country/evidence
// links, methodology intentionally left out of the "nothing to show" gate
// (see component doc comment) since a bare methodology chip on every card
// would be noise, not a cross-link.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import NewsCrossLinks from './NewsCrossLinks'
import type { NewsArticle } from '../../types/news'

function fixture(overrides: Partial<Pick<NewsArticle, 'countryCode' | 'sourceName'>> = {}) {
  return { countryCode: 'KR', sourceName: 'Reuters', ...overrides }
}

afterEach(() => cleanup())

describe('NewsCrossLinks', () => {
  it('renders a country chip linking to the country profile when countryCode resolves to a real name', () => {
    // Arrange
    const article = fixture({ countryCode: 'KR' })
    // Act
    render(<NewsCrossLinks article={article} />)
    // Assert
    const link = screen.getByRole('link', { name: /south korea/i })
    expect(link.getAttribute('href')).toBe('/country/KR')
  })

  it('renders an evidence chip labeled with the article\'s real source, never a fabricated placeholder', () => {
    // Arrange
    const article = fixture({ sourceName: 'Reuters' })
    // Act
    render(<NewsCrossLinks article={article} />)
    // Assert
    expect(screen.getByText(/evidence: reuters/i)).toBeTruthy()
    expect(screen.queryByText(/openaq feed/i)).toBeNull()
  })

  it('omits the country chip when countryCode is absent', () => {
    // Arrange
    const article = fixture({ countryCode: null })
    // Act
    render(<NewsCrossLinks article={article} />)
    // Assert
    expect(screen.queryByRole('link', { name: /profile/i })).toBeNull()
  })

  it('omits the country chip when the code does not resolve to a real name (never renders a bare ISO code as a name)', () => {
    // Arrange
    const article = fixture({ countryCode: 'ZZ' })
    // Act
    render(<NewsCrossLinks article={article} />)
    // Assert
    expect(screen.queryByRole('link', { name: /profile/i })).toBeNull()
  })

  it('omits the evidence chip when sourceName is absent', () => {
    // Arrange
    const article = fixture({ sourceName: null })
    // Act
    render(<NewsCrossLinks article={article} />)
    // Assert
    expect(screen.queryByText(/evidence:/i)).toBeNull()
  })

  it('renders nothing at all when neither country nor evidence data is available', () => {
    // Arrange
    const article = fixture({ countryCode: null, sourceName: null })
    // Act
    const { container } = render(<NewsCrossLinks article={article} />)
    // Assert
    expect(container.querySelector('.news-chips')).toBeNull()
  })

  it('applies a caller-supplied className alongside the base class', () => {
    // Arrange
    const article = fixture()
    // Act
    const { container } = render(<NewsCrossLinks article={article} className="dispatch-card__cross-links" />)
    // Assert
    const row = container.querySelector('.news-chips')
    expect(row?.classList.contains('dispatch-card__cross-links')).toBe(true)
  })
})
