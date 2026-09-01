// videoEmbed — pins the id-capture-group trust boundary: a real watch URL
// maps to the expected nocookie/player embed src, and every malicious shape
// (wrong scheme, wrong host, embed-parameter injection) returns null rather
// than echoing attacker input into an iframe src.
import { describe, it, expect } from 'vitest'
import { parseVideoEmbed } from './videoEmbed'

describe('parseVideoEmbed — YouTube', () => {
  it('parses a standard watch URL', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses a watch URL with a leading param before v=', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=10s')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses a youtu.be short link', () => {
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses a youtube.com/shorts link', () => {
    expect(parseVideoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses an already-embed URL (nocookie or not)', () => {
    expect(parseVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses without the www. subdomain', () => {
    expect(parseVideoEmbed('https://youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })
})

describe('parseVideoEmbed — Vimeo', () => {
  it('parses a standard vimeo.com URL', () => {
    expect(parseVideoEmbed('https://vimeo.com/76979871')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    })
  })

  it('parses a player.vimeo.com URL', () => {
    expect(parseVideoEmbed('https://player.vimeo.com/video/76979871')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    })
  })
})

describe('parseVideoEmbed — malicious / malformed input', () => {
  it('rejects a javascript: URL', () => {
    expect(parseVideoEmbed('javascript:alert(1)')).toBeNull()
  })

  it('rejects a non-https scheme (http)', () => {
    expect(parseVideoEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects an unrelated domain', () => {
    expect(parseVideoEmbed('https://evil.example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects a lookalike host built by suffixing the real one', () => {
    expect(parseVideoEmbed('https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('strips an embed-parameter injection attempt appended after a valid id, keeping only the id', () => {
    expect(
      parseVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0&onlyValidUpToHere=x'),
    ).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    })
  })

  it('rejects an id embedded inside a longer, non-matching id-like string', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQEXTRA')).toBeNull()
  })

  it('rejects a vimeo id that is not purely numeric', () => {
    expect(parseVideoEmbed('https://vimeo.com/abc123')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseVideoEmbed('')).toBeNull()
  })

  it('rejects a data: URI', () => {
    expect(parseVideoEmbed('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})
