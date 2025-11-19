import type { ISortMiddleware, TuffItem, TuffQuery } from '@talex-touch/utils'

const PREVIEW_SOURCE_ID = 'preview-provider'

export const previewPrioritySorter: ISortMiddleware = {
  name: 'preview-priority',
  sort(items: TuffItem[], _query: TuffQuery): TuffItem[] {
    if (items.length === 0)
      return items

    const previewItems: TuffItem[] = []
    const nonPreviewItems: TuffItem[] = []

    for (const item of items) {
      if (item.source?.id === PREVIEW_SOURCE_ID) {
        previewItems.push(item)
      }
      else {
        nonPreviewItems.push(item)
      }
    }

    if (previewItems.length === 0)
      return items
    return [...previewItems, ...nonPreviewItems]
  },
}
