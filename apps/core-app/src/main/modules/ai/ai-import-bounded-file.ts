import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024

export interface BoundedImportFile {
  canonicalPath: string
  content: string
  updatedAt: number
}

function isWithin(rootPath: string, candidatePath: string): boolean {
  const path = relative(rootPath, candidatePath)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/**
 * Resolves the source and candidate once, then reads a bounded regular file from
 * the same opened descriptor. O_NOFOLLOW and descriptor metadata reject unsafe targets.
 */
export async function readBoundedImportFile(
  sourceRoot: string,
  candidatePath: string
): Promise<BoundedImportFile> {
  const [canonicalRoot, canonicalPath] = await Promise.all([
    realpath(sourceRoot),
    realpath(candidatePath)
  ])
  if (!isWithin(canonicalRoot, canonicalPath))
    throw new Error('Import file escapes its canonical source root')

  const handle = await open(canonicalPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error('Import file is not a regular file')
    if (info.size > MAX_IMPORT_FILE_BYTES)
      throw new Error(`Import file exceeds ${MAX_IMPORT_FILE_BYTES} bytes`)

    const buffer = Buffer.allocUnsafe(info.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) throw new Error('Import file changed while reading')
      offset += bytesRead
    }
    return {
      canonicalPath,
      content: buffer.toString('utf8'),
      updatedAt: info.mtimeMs
    }
  } finally {
    await handle.close()
  }
}
