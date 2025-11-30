import type { Buffer } from 'node:buffer'

export interface TpexMetadata {
  readmeMarkdown?: string | null
  manifest?: Record<string, unknown> | null
}

const TAR_BLOCK_SIZE = 512

function isReadmeFile(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith('readme.md') || lower.endsWith('readme')
}

function isManifestFile(name: string) {
  return name.toLowerCase().endsWith('manifest.json')
}

function readHeaderString(block: Buffer, start: number, length: number) {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim()
}

function readHeaderOctal(block: Buffer, start: number, length: number): number {
  const raw = readHeaderString(block, start, length)
  if (!raw.length)
    return 0
  const value = parseInt(raw, 8)
  return Number.isFinite(value) ? value : 0
}

function isEmptyBlock(block: Buffer) {
  for (const byte of block) {
    if (byte !== 0)
      return false
  }
  return true
}

export async function extractTpexMetadata(buffer: Buffer): Promise<TpexMetadata> {
  let readmeMarkdown: string | null = null
  let manifest: Record<string, unknown> | null = null

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header))
      break

    const name = readHeaderString(header, 0, 100)
    const size = readHeaderOctal(header, 124, 12)

    if (!name || size < 0)
      break

    const fileEnd = offset + size
    if (fileEnd > buffer.length)
      break

    const fileBuffer = buffer.subarray(offset, fileEnd)

    if (!readmeMarkdown && isReadmeFile(name)) {
      try {
        readmeMarkdown = fileBuffer.toString('utf8')
      }
      catch {
        readmeMarkdown = null
      }
    }

    if (!manifest && isManifestFile(name)) {
      try {
        manifest = JSON.parse(fileBuffer.toString('utf8')) as Record<string, unknown>
      }
      catch {
        manifest = null
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset = fileEnd + padding

    if (readmeMarkdown && manifest)
      break
  }

  return {
    readmeMarkdown,
    manifest,
  }
}
