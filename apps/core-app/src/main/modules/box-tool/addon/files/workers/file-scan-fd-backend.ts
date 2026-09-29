import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import type {
  ScanDirectoryBatchOptions,
  ScanDirectoryStats,
  ScannedFileInfo
} from '@talex-touch/utils/common/file-scan-utils'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { FILE_SCAN_MAX_DEPTH } from '@talex-touch/utils/common/file-scan-constants'
import { isIndexableFile, normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { getDirectoryLevelExclusionReason } from '../file-traversal-policy'
import { normalizeAsarUnpackedPath } from '../native-binary-path'

const FD_THREADS = 1
const FD_STAT_CONCURRENCY = 2
const FD_TRAVERSAL_CACHE_LIMIT = 4_096
const TEST_FD_BINARY_ENV = 'TUFF_TEST_FD_BINARY_PATH'

export interface FdScanBatchOptions extends ScanDirectoryBatchOptions {
  /** Tests can inject a fixture binary without making PATH part of production resolution. */
  testBinaryPath?: string
}

/**
 * Resolve only the binary shipped through @prebuilt-binary/fd. The user's PATH is never consulted.
 * Unsupported platform packages deliberately return null so the caller can use the legacy walker.
 */
export function resolveBundledFdBinary(testBinaryPath?: string): string | null {
  if (testBinaryPath) return path.resolve(testBinaryPath)
  if (process.env.NODE_ENV === 'test' && process.env[TEST_FD_BINARY_ENV]) {
    return path.resolve(process.env[TEST_FD_BINARY_ENV])
  }

  try {
    const runtimeRequire = createRequire(path.join(__dirname, 'file-scan-worker.js'))
    const wrapperManifest = runtimeRequire.resolve('@prebuilt-binary/fd/package.json')
    const wrapperRequire = createRequire(wrapperManifest)
    const binaryName = process.platform === 'win32' ? 'fd.exe' : 'fd'
    const platformPackage = `@prebuilt-binary/fd-${process.platform}-${process.arch}`
    return normalizeAsarUnpackedPath(wrapperRequire.resolve(`${platformPackage}/bin/${binaryName}`))
  } catch {
    return null
  }
}

/**
 * Enumerate one root with fd, then apply Tuff's existing traversal and file admission rules.
 * Returns null when this runtime has no bundled fd binary. Execution failures reject so the caller
 * can restart the same root with the authoritative legacy walker.
 */
export async function scanDirectoryBatchesWithFd(
  rootPath: string,
  onBatch: (batch: ScannedFileInfo[]) => Promise<void>,
  options: FileScanOptions,
  excludePaths?: Set<string>,
  batchOptions: FdScanBatchOptions = {}
): Promise<ScanDirectoryStats | null> {
  const binaryPath = resolveBundledFdBinary(batchOptions.testBinaryPath)
  if (!binaryPath) return null

  const signal = batchOptions.signal
  signal?.throwIfAborted()
  const batchSize = Math.max(1, Math.floor(batchOptions.batchSize ?? 500))
  const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? FILE_SCAN_MAX_DEPTH))
  const args = [
    '--type',
    'f',
    '--hidden',
    '--no-ignore',
    '--absolute-path',
    '--print0',
    '--color',
    'never',
    '--threads',
    String(FD_THREADS),
    '--max-depth',
    String(maxDepth + 1),
    '.',
    rootPath
  ]

  const child = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const abort = (): void => {
    child.kill()
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, exitSignal) => resolve({ code, signal: exitSignal }))
    }
  )
  void exit.catch(() => undefined)
  let stderrObserved = false
  const stderrDrain = (async () => {
    if (!child.stderr) return
    for await (const chunk of child.stderr) {
      if ((chunk as Buffer).length > 0) stderrObserved = true
    }
  })()
  void stderrDrain.catch(() => undefined)

  const stats: ScanDirectoryStats = { entryCount: 0, errorCount: 0 }
  const outputBatch: ScannedFileInfo[] = []
  const pathBatch: string[] = []
  const traversalCache = new Map<string, Promise<boolean>>()
  const normalizedRoot = path.resolve(rootPath)
  const normalizedExcludeRoots = excludePaths
    ? Array.from(excludePaths, (excludedPath) => path.resolve(excludedPath))
    : []
  const decoder = new StringDecoder('utf8')
  let textRemainder = ''

  const flushOutput = async (): Promise<void> => {
    while (outputBatch.length >= batchSize) {
      signal?.throwIfAborted()
      await onBatch(outputBatch.splice(0, batchSize))
    }
  }

  const inspectPath = async (rawPath: string): Promise<ScannedFileInfo | null> => {
    signal?.throwIfAborted()
    const resolvedPath = path.resolve(rawPath)
    if (isExcludedPath(resolvedPath, normalizedExcludeRoots)) return null
    if (await isTraversalExcluded(resolvedPath, normalizedRoot, options, traversalCache)) {
      return null
    }

    const fileName = path.basename(resolvedPath)
    const extension = path.extname(fileName).toLowerCase()
    if (!isIndexableFile(resolvedPath, extension, fileName, options)) return null

    try {
      const fileStats = await fs.lstat(resolvedPath)
      if (!fileStats.isFile() || fileStats.isSymbolicLink()) return null
      return {
        path: normalizeFsPath(resolvedPath),
        name: normalizeFsPath(fileName),
        extension,
        size: fileStats.size,
        ctime: fileStats.birthtime ?? fileStats.ctime,
        mtime: fileStats.mtime
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      stats.errorCount += 1
      return null
    }
  }

  const flushPaths = async (): Promise<void> => {
    if (pathBatch.length === 0) return
    const currentPaths = pathBatch.splice(0, pathBatch.length)
    const inspected = await Promise.all(currentPaths.map((filePath) => inspectPath(filePath)))
    for (const file of inspected) {
      if (!file) continue
      outputBatch.push(file)
      stats.entryCount += 1
    }
    await flushOutput()
  }

  const acceptDecodedText = async (decoded: string): Promise<void> => {
    textRemainder += decoded
    let separator = textRemainder.indexOf('\0')
    while (separator >= 0) {
      const filePath = textRemainder.slice(0, separator)
      textRemainder = textRemainder.slice(separator + 1)
      if (filePath) pathBatch.push(filePath)
      if (pathBatch.length >= FD_STAT_CONCURRENCY) await flushPaths()
      separator = textRemainder.indexOf('\0')
    }
  }

  try {
    if (!child.stdout) throw new Error('FD_SCAN_STDOUT_UNAVAILABLE')
    for await (const chunk of child.stdout) {
      signal?.throwIfAborted()
      await acceptDecodedText(decoder.write(chunk as Buffer))
    }
    await acceptDecodedText(decoder.end())
    if (textRemainder.length > 0) {
      pathBatch.push(textRemainder)
      textRemainder = ''
    }
    await flushPaths()

    const result = await exit
    await stderrDrain
    signal?.throwIfAborted()
    if (result.code !== 0) {
      throw new Error(`FD_SCAN_FAILED:${result.code ?? result.signal ?? 'unknown'}`)
    }
    if (stderrObserved) stats.errorCount += 1
    if (outputBatch.length > 0) await onBatch(outputBatch.splice(0, outputBatch.length))
    return stats
  } finally {
    signal?.removeEventListener('abort', abort)
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await Promise.allSettled([exit, stderrDrain])
  }
}

function isExcludedPath(filePath: string, excludeRoots: readonly string[]): boolean {
  for (const excludedRoot of excludeRoots) {
    if (filePath === excludedRoot || filePath.startsWith(`${excludedRoot}${path.sep}`)) return true
  }
  return false
}

async function isTraversalExcluded(
  filePath: string,
  rootPath: string,
  options: FileScanOptions,
  cache: Map<string, Promise<boolean>>
): Promise<boolean> {
  let directoryPath = path.dirname(filePath)
  while (isPathInsideRoot(directoryPath, rootPath)) {
    let decision = cache.get(directoryPath)
    if (!decision) {
      decision = Promise.resolve(
        directoryPath === rootPath
          ? fileFilterService.getTraversalExclusionReason(directoryPath, options, {
              siblingNames: undefined
            }) !== null
          : getDirectoryLevelExclusionReason(directoryPath, undefined, options).then(
              (reason) => reason !== null
            )
      )
      if (cache.size >= FD_TRAVERSAL_CACHE_LIMIT) {
        const oldest = cache.keys().next()
        if (!oldest.done) cache.delete(oldest.value)
      }
      cache.set(directoryPath, decision)
    }
    if (await decision) return true
    if (directoryPath === rootPath) return false
    directoryPath = path.dirname(directoryPath)
  }
  return true
}

function isPathInsideRoot(candidate: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
