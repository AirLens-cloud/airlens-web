/**
 * Video embed URL builder — Wave 4 blog media. Parses a blog post's raw
 * `video.source_url` (the writer's original YouTube/Vimeo *watch* URL) into
 * a safe `youtube-nocookie.com`/`player.vimeo.com` embed src.
 *
 * Trust boundary: the Hermes writer only ever supplies a watch URL, never
 * an embed src (`types/blog.ts` `BlogVideo` doc comment). This module is
 * the one place that builds an `<iframe src>`, and it does so from a REGEX
 * CAPTURE GROUP alone — the matched id is re-validated against a strict
 * character whitelist, then interpolated into a fresh, hardcoded embed
 * template. The original URL string is never echoed into the output, so
 * neither a `javascript:`/non-https scheme, an unrelated host, nor extra
 * query/fragment content appended after a valid id (an "embed parameter
 * injection" attempt) can reach the iframe. A URL that doesn't match one of
 * the two providers' patterns returns `null`, and the caller renders
 * nothing rather than guessing at intent.
 */

export type VideoEmbedProvider = 'youtube' | 'vimeo'

export interface VideoEmbed {
  provider: VideoEmbedProvider
  embedUrl: string
}

const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/
const VIMEO_ID = /^\d+$/

// Each pattern is fully anchored (`^...$`) so a lookalike host
// (`youtube.com.evil.com`, `notvimeo.com`) can never match — the literal
// host segment must be followed immediately by the expected path, not by
// arbitrary characters.
const YOUTUBE_PATTERNS: RegExp[] = [
  /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})(?:&[^#]*)?$/i,
  /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[/?][^#]*)?$/i,
  /^https:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[/?][^#]*)?$/i,
  /^https:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:[/?][^#]*)?$/i,
]

const VIMEO_PATTERNS: RegExp[] = [
  /^https:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:[/?][^#]*)?$/i,
  /^https:\/\/player\.vimeo\.com\/video\/(\d+)(?:[/?][^#]*)?$/i,
]

function matchFirst(url: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = url.match(pattern)
    if (m?.[1]) return m[1]
  }
  return null
}

export function parseVideoEmbed(sourceUrl: string): VideoEmbed | null {
  const url = sourceUrl.trim()

  const youtubeId = matchFirst(url, YOUTUBE_PATTERNS)
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` }
  }

  const vimeoId = matchFirst(url, VIMEO_PATTERNS)
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoId}` }
  }

  return null
}
