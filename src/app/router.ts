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
      return segment
    })
    .join('/')
  return { pattern: new RegExp(`^${pattern}$`), keys }
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
    const params: Record<string, string> = {}
    keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1] ?? '')
    })
    return route.render(params)
  }
  return null
}
