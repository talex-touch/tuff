import { getQuery } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { listImages, listImagesPage, parseImageListPageQuery } from '../../utils/imageStorage'

function toImage(key: string) {
  return {
    key,
    url: `/api/images/${key}`,
  }
}

/**
 * The resource listing for the Asset Library.
 *
 * - `?limit=&cursor=` (either one): one page — `limit` defaults to 60 and is
 *   capped at 200 — answered as `{ images, cursor, truncated }`; pass `cursor`
 *   back for the next page while `truncated` is true.
 * - No parameters: every key at once as `{ images, total }`, exactly as before
 *   paging existed, for callers that still read it whole.
 */
export default defineEventHandler(async (event) => {
  // 只有 admin 可以列出所有图片
  await requireAdmin(event)

  const page = parseImageListPageQuery(getQuery(event))

  if (!page) {
    const keys = await listImages(event)
    return {
      images: keys.map(toImage),
      total: keys.length,
    }
  }

  const result = await listImagesPage(event, page)
  return {
    images: result.keys.map(toImage),
    cursor: result.cursor,
    truncated: result.truncated,
  }
})
