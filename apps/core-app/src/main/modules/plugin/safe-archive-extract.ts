import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import compressing from 'compressing'

export type BoundedArchiveFormat = 'tar' | 'tgz' | 'zip'

export interface BoundedArchiveExtractOptions {
  maxEntries?: number
  maxTotalBytes?: number
  maxFileBytes?: number
  skipNodeModules?: boolean
}

export const DEFAULT_MAX_ARCHIVE_ENTRIES = 5_000
export const DEFAULT_MAX_ARCHIVE_TOTAL_BYTES = 256 * 1024 * 1024
export const DEFAULT_MAX_ARCHIVE_FILE_BYTES = 64 * 1024 * 1024
export const DEFAULT_MAX_MANIFEST_BYTES = 2 * 1024 * 1024

const SYMLINK_MODE_MASK = 0o170000
const SYMLINK_MODE_BITS = 0o120000

interface ArchiveEntryHeader {
  name?: string
  type?: string
  size?: number
  mode?: number
}

function normalizeArchiveEntryPath(rawName: string): string | null {
  if (!rawName || rawName.includes('\0')) return null
  const unified = rawName.replace(/\\/g, '/')
  if (unified.startsWith('/') || /^[a-z]:/i.test(unified)) return null
  const segments = unified.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0) return ''
  if (segments.some((segment) => segment === '..')) return null
  return segments.join('/')
}

function isWithinCanonicalRoot(rootReal: string, candidateReal: string): boolean {
  const relative = path.relative(rootReal, candidateReal)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isDisallowedEntryType(header: ArchiveEntryHeader): boolean {
  if (header.type !== 'file' && header.type !== 'directory') {
    return true
  }
  if (typeof header.mode === 'number' && (header.mode & SYMLINK_MODE_MASK) === SYMLINK_MODE_BITS) {
    return true
  }
  return false
}

function createUncompressStream(format: BoundedArchiveFormat, sourcePath: string) {
  if (format === 'zip') {
    return new compressing.zip.UncompressStream({ source: sourcePath })
  }
  if (format === 'tgz') {
    return new compressing.tgz.UncompressStream({ source: sourcePath })
  }
  return new compressing.tar.UncompressStream({ source: sourcePath })
}

/**
 * Extracts a `.tar`, `.tpex`, `.tgz`, or `.zip` archive into `targetDir` while enforcing
 * strict decompression-bomb ceilings (entry count, single-file size, total uncompressed size),
 * rejecting symlinks/hardlinks/special entries, and verifying canonical path containment.
 */
export async function extractArchiveSafely(
  sourcePath: string,
  targetDir: string,
  format: BoundedArchiveFormat,
  options: BoundedArchiveExtractOptions = {}
): Promise<{ entries: number; totalBytes: number }> {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ARCHIVE_ENTRIES
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_ARCHIVE_TOTAL_BYTES
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_ARCHIVE_FILE_BYTES

  await fs.mkdir(targetDir, { recursive: true })
  const targetReal = await fs.realpath(targetDir)

  const uncompressStream = createUncompressStream(format, sourcePath)
  let entryCount = 0
  let totalBytes = 0

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      try {
        uncompressStream.destroy()
      } catch {
        // Ignore stream destroy errors
      }
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const succeed = () => {
      if (settled) return
      settled = true
      resolve()
    }

    uncompressStream.on('error', fail)
    uncompressStream.on('finish', succeed)

    uncompressStream.on(
      'entry',
      (header: ArchiveEntryHeader, stream: Readable, next: () => void) => {
        const handleEntry = async () => {
          if (settled) {
            stream.resume()
            return
          }

          entryCount += 1
          if (entryCount > maxEntries) {
            stream.destroy()
            throw new Error('ARCHIVE_ENTRY_LIMIT_EXCEEDED')
          }

          if (isDisallowedEntryType(header)) {
            stream.destroy()
            throw new Error(`ARCHIVE_UNSUPPORTED_ENTRY_TYPE:${String(header.type ?? 'unknown')}`)
          }

          const rawName = typeof header.name === 'string' ? header.name : ''
          const normalizedRelative = normalizeArchiveEntryPath(rawName)
          if (normalizedRelative === null) {
            stream.destroy()
            throw new Error('ARCHIVE_PATH_TRAVERSAL_DENIED')
          }

          if (normalizedRelative === '') {
            stream.resume()
            next()
            return
          }

          if (options.skipNodeModules && normalizedRelative.split('/').includes('node_modules')) {
            stream.resume()
            next()
            return
          }

          const destPath = path.resolve(targetReal, normalizedRelative)
          if (!isWithinCanonicalRoot(targetReal, destPath)) {
            stream.destroy()
            throw new Error('ARCHIVE_PATH_TRAVERSAL_DENIED')
          }

          if (header.type === 'directory') {
            await fs.mkdir(destPath, { recursive: true })
            const destReal = await fs.realpath(destPath)
            if (!isWithinCanonicalRoot(targetReal, destReal)) {
              throw new Error('ARCHIVE_SYMLINK_ESCAPE_DENIED')
            }
            stream.resume()
            next()
            return
          }

          if (typeof header.size === 'number' && header.size > maxFileBytes) {
            stream.destroy()
            throw new Error('ARCHIVE_FILE_TOO_LARGE')
          }
          if (typeof header.size === 'number' && totalBytes + header.size > maxTotalBytes) {
            stream.destroy()
            throw new Error('ARCHIVE_SIZE_LIMIT_EXCEEDED')
          }

          const parentDir = path.dirname(destPath)
          await fs.mkdir(parentDir, { recursive: true })
          const parentReal = await fs.realpath(parentDir)
          if (!isWithinCanonicalRoot(targetReal, parentReal)) {
            stream.destroy()
            throw new Error('ARCHIVE_SYMLINK_ESCAPE_DENIED')
          }

          let fileBytes = 0
          await new Promise<void>((resolveWrite, rejectWrite) => {
            const out = createWriteStream(destPath, { flags: 'w', mode: 0o644 })
            let writeSettled = false
            const finishWrite = (err?: unknown) => {
              if (writeSettled) return
              writeSettled = true
              if (err) {
                stream.destroy()
                out.destroy()
                rejectWrite(err instanceof Error ? err : new Error(String(err)))
              } else {
                resolveWrite()
              }
            }

            stream.on('data', (chunk: Buffer) => {
              if (writeSettled) return
              fileBytes += chunk.byteLength
              totalBytes += chunk.byteLength
              if (fileBytes > maxFileBytes) {
                finishWrite(new Error('ARCHIVE_FILE_TOO_LARGE'))
                return
              }
              if (totalBytes > maxTotalBytes) {
                finishWrite(new Error('ARCHIVE_SIZE_LIMIT_EXCEEDED'))
                return
              }
              if (!out.write(chunk)) {
                stream.pause()
                out.once('drain', () => {
                  if (!writeSettled) stream.resume()
                })
              }
            })
            stream.on('error', finishWrite)
            stream.on('end', () => {
              if (!writeSettled) out.end()
            })
            out.on('error', finishWrite)
            out.on('finish', () => finishWrite())
          })

          next()
        }

        handleEntry().catch(fail)
      }
    )
  })

  return { entries: entryCount, totalBytes }
}

/**
 * Reads only the root `manifest.json` from a `.tar`/`.tpex` archive in memory without
 * extracting any files to disk, enforcing strict entry-count and byte ceilings.
 */
export async function peekTarManifestBounded(
  tarPath: string,
  options: { maxEntries?: number; maxManifestBytes?: number } = {}
): Promise<unknown | undefined> {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ARCHIVE_ENTRIES
  const maxManifestBytes = options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES

  const uncompressStream = new compressing.tar.UncompressStream({ source: tarPath })
  let entryCount = 0
  let manifestJson: unknown | undefined

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      try {
        uncompressStream.destroy()
      } catch {
        // Ignore stream destroy errors
      }
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const succeed = () => {
      if (settled) return
      settled = true
      try {
        uncompressStream.destroy()
      } catch {
        // Ignore stream destroy errors
      }
      resolve()
    }

    uncompressStream.on('error', fail)
    uncompressStream.on('finish', succeed)

    uncompressStream.on(
      'entry',
      (header: ArchiveEntryHeader, stream: Readable, next: () => void) => {
        if (settled) {
          stream.resume()
          return
        }
        entryCount += 1
        if (entryCount > maxEntries) {
          stream.destroy()
          fail(new Error('ARCHIVE_ENTRY_LIMIT_EXCEEDED'))
          return
        }

        const rawName = typeof header.name === 'string' ? header.name : ''
        const normalized = normalizeArchiveEntryPath(rawName)
        if (normalized === null) {
          stream.destroy()
          fail(new Error('ARCHIVE_PATH_TRAVERSAL_DENIED'))
          return
        }

        if (header.type !== 'file' || normalized !== 'manifest.json') {
          stream.resume()
          next()
          return
        }

        if (typeof header.size === 'number' && header.size > maxManifestBytes) {
          stream.destroy()
          fail(new Error('ARCHIVE_MANIFEST_TOO_LARGE'))
          return
        }

        const chunks: Buffer[] = []
        let bytes = 0
        stream.on('data', (chunk: Buffer) => {
          if (settled) return
          bytes += chunk.byteLength
          if (bytes > maxManifestBytes) {
            stream.destroy()
            fail(new Error('ARCHIVE_MANIFEST_TOO_LARGE'))
            return
          }
          chunks.push(chunk)
        })
        stream.on('error', fail)
        stream.on('end', () => {
          if (settled) return
          try {
            manifestJson = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'))
            succeed()
          } catch (error) {
            fail(error)
          }
        })
      }
    )
  })

  return manifestJson
}
