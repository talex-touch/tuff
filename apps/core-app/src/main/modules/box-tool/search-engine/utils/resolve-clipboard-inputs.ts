import type { TuffQueryInput } from '@talex-touch/utils'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { TuffInputType } from '@talex-touch/utils'
import { resolveLocalFilePath } from '@talex-touch/utils/network'

export interface ResolveClipboardInputsResult {
  resolvedCount: number
  clipboardIds: number[]
}

function getClipboardId(input: TuffQueryInput): number | null {
  const meta = input.metadata as { clipboardId?: unknown } | undefined
  return typeof meta?.clipboardId === 'number' ? meta.clipboardId : null
}

function isResolvableImageInput(input: TuffQueryInput): boolean {
  if (input.type !== TuffInputType.Image) return false
  const meta = input.metadata as { canResolveOriginal?: unknown; contentKind?: unknown } | undefined
  if (
    typeof input.content === 'string' &&
    input.content.startsWith('data:image/') &&
    meta?.contentKind !== 'preview'
  ) {
    return false
  }
  return meta?.canResolveOriginal === true
}

function resolveImageMimeType(source: string): string {
  switch (extname(resolveLocalFilePath(source) ?? source).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}

async function resolveImageContent(source: string): Promise<string> {
  if (!source) return ''
  if (source.startsWith('data:image/')) return source

  const filePath = resolveLocalFilePath(source)
  if (!filePath) return ''

  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    return ''
  }
  return `data:${resolveImageMimeType(source)};base64,${buffer.toString('base64')}`
}

export async function resolveClipboardInputs(
  inputs?: TuffQueryInput[]
): Promise<ResolveClipboardInputsResult> {
  if (!inputs || inputs.length === 0) {
    return { resolvedCount: 0, clipboardIds: [] }
  }

  const clipboardIds = new Set<number>()
  for (const input of inputs) {
    if (!(input.type === TuffInputType.Files && !input.content) && !isResolvableImageInput(input)) {
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
      continue
    }

    if (isResolvableImageInput(input) && item?.type === 'image') {
      const resolvedImage = await resolveImageContent(item.content ?? '')
      if (!resolvedImage) continue
      input.content = resolvedImage
      input.metadata = {
        ...(input.metadata ?? {}),
        contentKind: 'original',
        resolvedFromClipboardId: clipboardId
      }
      resolvedCount += 1
    }
  }

  return { resolvedCount, clipboardIds: Array.from(clipboardIds) }
}
