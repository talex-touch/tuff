/**
 * The message an administrator page may show for a failed request.
 *
 * Only text the server wrote for people is presentable: `data.message` /
 * `data.statusMessage` from the H3 error body, then the response status text.
 * `error.message` is never read — ofetch fills it with its own transport string,
 * `[GET] "/api/admin/audits?page=1": 500 Internal Server Error`, which leaked API
 * paths into the console and kept the localized fallback from ever showing.
 */
export function resolveAdminErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as {
    data?: { message?: unknown, statusMessage?: unknown } | null
    statusMessage?: unknown
  } | null | undefined

  for (const value of [candidate?.data?.message, candidate?.data?.statusMessage, candidate?.statusMessage]) {
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }
  return fallback
}
