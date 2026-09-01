import { describe, it, expect } from 'vitest'
import { matchRoute } from './router'

describe('matchRoute', () => {
  it('matches a static path with no params', () => {
    // Arrange
    const routes = [{ path: '/dispatch', render: () => 'dispatch' }]
    // Act
    const result = matchRoute('/dispatch', routes)
    // Assert
    expect(result).toBe('dispatch')
  })

  it('extracts a single :param segment', () => {
    // Arrange
    const routes = [{ path: '/news/:slug', render: (p: Record<string, string>) => p.slug }]
    // Act
    const result = matchRoute('/news/pm25-spike-seoul', routes)
    // Assert
    expect(result).toBe('pm25-spike-seoul')
  })

  it('decodes percent-encoded param segments', () => {
    // Arrange
    const routes = [{ path: '/blog/:slug', render: (p: Record<string, string>) => p.slug }]
    // Act
    const result = matchRoute('/blog/hello%20world', routes)
    // Assert
    expect(result).toBe('hello world')
  })

  it('extracts multiple :param segments in one path', () => {
    // Arrange
    const routes = [
      { path: '/:a/:b', render: (p: Record<string, string>) => `${p.a}-${p.b}` },
    ]
    // Act
    const result = matchRoute('/foo/bar', routes)
    // Assert
    expect(result).toBe('foo-bar')
  })

  it('does not normalize case — that is the page component\'s job', () => {
    // Arrange — CountryProfile itself upper-cases via normalizeCode(); the
    // matcher only extracts the raw decoded segment.
    const routes = [{ path: '/country/:code', render: (p: Record<string, string>) => p.code }]
    // Act
    const result = matchRoute('/country/kr', routes)
    // Assert
    expect(result).toBe('kr')
  })

  it('returns null when no route matches (catch-all is the caller\'s responsibility)', () => {
    // Arrange
    const routes = [{ path: '/dispatch', render: () => 'dispatch' }]
    // Act
    const result = matchRoute('/some-unknown-path', routes)
    // Assert
    expect(result).toBeNull()
  })

  it('matches the first route in table order when paths could overlap', () => {
    // Arrange
    const routes = [
      { path: '/blog', render: () => 'blog-index' },
      { path: '/:slug', render: (p: Record<string, string>) => `catch-${p.slug}` },
    ]
    // Act
    const result = matchRoute('/blog', routes)
    // Assert
    expect(result).toBe('blog-index')
  })

  it('does not match a path with extra trailing segments', () => {
    // Arrange
    const routes = [{ path: '/faq', render: () => 'faq' }]
    // Act
    const result = matchRoute('/faq/extra', routes)
    // Assert
    expect(result).toBeNull()
  })
})
