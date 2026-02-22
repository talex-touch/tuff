import type { TuffQueryInput } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'

export interface ResolveClipboardInputsResult {
  resolvedCount: number
  clipboardIds: number[]
}

function getClipboardId(input: TuffQueryInput): number | null {
  const meta = input.metadata as { clipboardId?: unknown } | undefined
  return typeof meta?.clipboardId === 'number' ? meta.clipboardId : null
}

export async function resolveClipboardInputs(
  inputs?: TuffQueryInput[]
): Promise<ResolveClipboardInputsResult> {
  if (!inputs || inputs.length === 0) {
    return { resolvedCount: 0, clipboardIds: [] }
  }

  const clipboardIds = new Set<number>()
  for (const input of inputs) {
    if (input.type !== TuffInputType.Files || input.content) {
      continue
    }
    const clipboardId = getClipboardId(input)
    if (clipboardId !== null) {
      clipboardIds.add(clipboardId)
    }
  }

  if (clipboardIds.size === 0) {
    return { resolvedCount: 0, clipboardIds: [] }
  }

  const { clipboardModule } = await import('../../../clipboard')
  const itemCache = new Map<number, Awaited<ReturnType<typeof clipboardModule.getItemById>>>()

  for (const id of clipboardIds) {
    itemCache.set(id, await clipboardModule.getItemById(id))
  }

  let resolvedCount = 0
  for (const input of inputs) {
    const clipboardId = getClipboardId(input)
    if (clipboardId === null) continue

    const item = itemCache.get(clipboardId)
    if (!item) continue

    if (input.type === TuffInputType.Files && item?.type === 'files') {
      input.content = item.content ?? ''
      resolvedCount += 1
    }
  }

  return { resolvedCount, clipboardIds: Array.from(clipboardIds) }
}
