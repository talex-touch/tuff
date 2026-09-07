import type { TuffItem, TuffRender } from '@talex-touch/utils'
import { eq } from 'drizzle-orm'
import type { DbUtils } from '../../../../db/utils'
import { clipboardHistory } from '../../../../db/schema'
import {
  normalizeRenderableIcon,
  normalizeRenderablePreviewImage
} from '../../../../utils/local-renderable-assets'
import { createLogger } from '../../../../utils/logger'

const clipboardSourceLog = createLogger('RecommendationEngine').child('ClipboardSource')

export const CLIPBOARD_RECOMMENDATION_SOURCE_ID = 'clipboard-history'
export const CLIPBOARD_RECOMMENDATION_ALIASES = ['clipboard'] as const

const TITLE_MAX_LENGTH = 100

type ClipboardRecord = typeof clipboardHistory.$inferSelect

function buildTextRender(record: ClipboardRecord, render: TuffRender): void {
  if (!render.basic) return
  render.basic.title =
    record.content.length > TITLE_MAX_LENGTH
      ? `${record.content.substring(0, TITLE_MAX_LENGTH - 3)}...`
      : record.content
  render.basic.subtitle = `Text from ${record.sourceApp || 'Unknown'}`
  render.basic.icon = { type: 'emoji', value: '📄' }
  render.preview = { type: 'panel', content: record.content }
}

function buildImageRender(record: ClipboardRecord, render: TuffRender): void {
  if (render.basic) {
    render.basic.title = `Image from ${record.sourceApp || 'Unknown'}`
    const thumbnailIcon = record.thumbnail
      ? normalizeRenderableIcon({ type: 'url', value: record.thumbnail }, 'image').icon
      : null
    render.basic.icon = thumbnailIcon ?? { type: 'emoji', value: '🖼️' }
  }
  render.preview = {
    type: 'panel',
    image: normalizeRenderablePreviewImage(record.content).image
  }
}

function buildFilesRender(record: ClipboardRecord, render: TuffRender): void {
  if (!render.basic) return
  try {
    const files = JSON.parse(record.content)
    if (files.length === 1) {
      const filePath = files[0]
      render.basic.title =
        typeof filePath === 'string' ? filePath.split(/[\\/]/).pop() || 'File' : 'File'
    } else {
      render.basic.title = `${files.length} files`
    }
  } catch {
    render.basic.title = 'Files from clipboard'
  }
  render.basic.icon = { type: 'emoji', value: '📁' }
}

/** OCR excerpts ride in the record's JSON metadata and are appended to whatever subtitle exists. */
function appendOcrExcerpt(record: ClipboardRecord, render: TuffRender): void {
  if (!record.metadata || !render.basic) return

  let metadata: Record<string, unknown> | null = null
  try {
    metadata = JSON.parse(record.metadata)
  } catch {
    return
  }

  const excerpt = metadata?.ocr_excerpt
  if (typeof excerpt !== 'string' || !excerpt.trim()) return

  const snippet = excerpt.trim()
  render.basic.subtitle = render.basic.subtitle ? `${render.basic.subtitle} · ${snippet}` : snippet
}

function toTuffItem(record: ClipboardRecord): TuffItem {
  const render: TuffRender = { mode: 'default', basic: { title: '' } }
  let kind: TuffItem['kind'] = 'document'

  if (record.type === 'text') {
    kind = 'document'
    buildTextRender(record, render)
  } else if (record.type === 'image') {
    kind = 'image'
    buildImageRender(record, render)
  } else if (record.type === 'files') {
    kind = 'file'
    buildFilesRender(record, render)
  }

  appendOcrExcerpt(record, render)

  return {
    id: `clipboard-${record.id}`,
    source: { id: CLIPBOARD_RECOMMENDATION_SOURCE_ID, type: 'history', name: 'Clipboard History' },
    kind,
    render,
    actions: [
      { id: 'paste', type: 'execute', label: 'Paste', shortcut: 'Enter' },
      { id: 'copy', type: 'copy', label: 'Copy', shortcut: 'CmdOrCtrl+C' }
    ],
    meta: { raw: record }
  }
}

/**
 * Clipboard history as a standalone recommendation source.
 *
 * It has no search provider to hang the capability off — clipboard *search* lives in a plugin
 * while clipboard *recommendation* is the host's — which is why the registry needs a registration
 * path that does not go through `ISearchProvider`.
 */
export function createClipboardRecommendationSource(dbUtils: DbUtils): {
  sourceId: string
  aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
} {
  return {
    sourceId: CLIPBOARD_RECOMMENDATION_SOURCE_ID,
    aliases: CLIPBOARD_RECOMMENDATION_ALIASES,
    async rebuild(itemIds) {
      if (itemIds.length === 0) return []

      try {
        const auxDb = dbUtils.getAuxDb()
        const coreDb = dbUtils.getDb()
        const items: TuffItem[] = []

        for (const itemId of itemIds) {
          const clipboardId = Number.parseInt(itemId, 10)
          if (Number.isNaN(clipboardId)) continue

          // Rows written before the aux split still live on the core db, so a miss on aux is not
          // conclusive while the two handles differ.
          let record = await auxDb
            .select()
            .from(clipboardHistory)
            .where(eq(clipboardHistory.id, clipboardId))
            .get()
          if (!record && auxDb !== coreDb) {
            record = await coreDb
              .select()
              .from(clipboardHistory)
              .where(eq(clipboardHistory.id, clipboardId))
              .get()
          }

          if (record) items.push(toTuffItem(record))
        }

        return items
      } catch (error) {
        clipboardSourceLog.error('Failed to rebuild clipboard items', {
          error,
          meta: { itemCount: itemIds.length }
        })
        return []
      }
    }
  }
}
