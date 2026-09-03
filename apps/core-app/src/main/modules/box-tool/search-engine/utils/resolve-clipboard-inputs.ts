import type { TuffQueryInput } from '@talex-touch/utils'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { TuffInputType } from '@talex-touch/utils'
import { resolveLocalFilePath } from '@talex-touch/utils/network'

export const MAX_RESOLVED_CLIPBOARD_IMAGE_BYTES = 32 * 1024 * 1024
const READ_CHUNK_BYTES = 1024 * 1024
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

async function readBoundedImageFile(filePath: string): Promise<Buffer | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    handle = await open(filePath, constants.O_RDONLY | noFollow)
    const before = await handle.stat()
    if (!before.isFile() || before.size < 1 || before.size > MAX_RESOLVED_CLIPBOARD_IMAGE_BYTES) {
      return null
    }

    const buffer = Buffer.allocUnsafe(before.size)
    let offset = 0
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        Math.min(READ_CHUNK_BYTES, buffer.byteLength - offset),
        offset
      )
      if (bytesRead < 1) return null
      offset += bytesRead
    }

    const after = await handle.stat()
    if (
      String(after.dev) !== String(before.dev) ||
      String(after.ino) !== String(before.ino) ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    ) {
      return null
    }
    return buffer
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function resolveImageContent(source: string): Promise<string> {
  if (!source) return ''
  if (source.startsWith('data:image/')) return source

  const filePath = resolveLocalFilePath(source)
  if (!filePath) return ''

  const buffer = await readBoundedImageFile(filePath)
  if (!buffer) return ''
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
