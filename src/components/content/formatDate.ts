/** `YYYY-MM-DD` (UTC) for an ISO timestamp, or `null` for an unparseable/absent one — never "Invalid Date" text. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}
