/**
 * Minimal regex-based path matcher. This repo has no react-router-dom
 * dependency (Supply Chain 7-day rule — adding one wasn't part of this PR's
 * brief), so routing is a table of `{ path, render }` entries matched in
 * order. Matching only: no nested routes, no `<Link>`, no history
 * management — App.tsx still owns navigation via `window.location`.
 */

export interface Route<T> {
  /** e.g. `/country/:code` — `:name` segments are captured as params. */
  path: string
  render: (params: Record<string, string>) => T
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const pattern = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      // Escape regex metacharacters in literal segments — otherwise e.g.
      // `/robots.txt` (the `.` is a wildcard) would also match `/robotsXtxt`.
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${pattern}$`), keys }
}

/**
 * Decodes each captured `:param` segment. Returns `null` if any segment is
 * malformed percent-encoding (e.g. a lone `%` — browsers leave an invalid
 * escape as-is in `location.pathname` rather than rejecting it), so the
 * caller can fall through to the next route instead of letting
 * `decodeURIComponent` throw a `URIError` up into the render.
 */
function decodeParams(match: RegExpExecArray, keys: string[]): Record<string, string> | null {
  const params: Record<string, string> = {}
  for (let i = 0; i < keys.length; i++) {
    try {
      params[keys[i]] = decodeURIComponent(match[i + 1] ?? '')
    } catch {
      return null
    }
  }
  return params
}

/**
 * Matches `pathname` against `routes` in order and returns the first hit's
 * render output, or `null` if nothing matches (caller decides the fallback).
 */
export function matchRoute<T>(pathname: string, routes: Array<Route<T>>): T | null {
  for (const route of routes) {
    const { pattern, keys } = compile(route.path)
    const match = pattern.exec(pathname)
    if (!match) continue
    const params = decodeParams(match, keys)
    if (!params) continue // malformed percent-encoding — try the next route
    return route.render(params)
  }
  return null
}
