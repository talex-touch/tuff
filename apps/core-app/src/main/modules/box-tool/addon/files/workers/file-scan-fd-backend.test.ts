import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type * as NodeModule from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import {
  scanDirectoryBatches,
  type ScannedFileInfo,
  type ScanDirectoryStats
} from '@talex-touch/utils/common/file-scan-utils'
import { resolveBundledFdBinary, scanDirectoryBatchesWithFd } from './file-scan-fd-backend'

/**
 * The packaged resolver is the only place that walks the module graph, so its `createRequire`
 * seam is mocked: the resolution requests and the resulting spawn path can then be asserted
 * without a packaged app on disk.
 */
const moduleSeam = vi.hoisted(() => {
  const resolveCalls: Array<{ from: string; specifier: string }> = []
  const resolutions = new Map<string, string>()
  const createRequire = (from: string) => ({
    resolve: (specifier: string): string => {
      resolveCalls.push({ from, specifier })
      const resolved = resolutions.get(specifier)
      if (resolved === undefined) throw new Error(`MODULE_NOT_FOUND: ${specifier}`)
      return resolved
    }
  })
  return { createRequire, resolveCalls, resolutions }
})

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeModule>()
  return { ...actual, createRequire: moduleSeam.createRequire }
})

/**
 * A stand-in for the packaged `fd` binary, living in the OS temp dir (never the repo).
 *
 * It honours the flags the backend is required to pass, so a regression in the invocation
 * shows up as a wrong admitted set instead of only as an argv diff:
 *  - `--max-depth N` bounds enumeration exactly as fd does (direct entries are depth 1),
 *  - `--print0` selects the NUL separator (without it the backend's NUL parser sees one blob),
 *  - `--absolute-path` selects absolute output (relative output resolves against the repo cwd
 *    and then fails the root-containment check, so the naive walker silently loses every file),
 *  - `--hidden` includes dot entries.
 * Symlinked files are reported as files: dropping them is the backend's own job, not fd's.
 */
const FIXTURE_PRELUDE = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

let maxDepth = Infinity
let hidden = false
let printNull = false
let absolute = false
const roots = []
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index]
  if (arg === '--max-depth') {
    maxDepth = Number(argv[index + 1])
    index += 1
    continue
  }
  if (arg === '--threads' || arg === '--type' || arg === '--color') {
    index += 1
    continue
  }
  if (arg === '--hidden' || arg === '-H') {
    hidden = true
    continue
  }
  if (arg === '--print0') {
    printNull = true
    continue
  }
  if (arg === '--absolute-path' || arg === '--abs') {
    absolute = true
    continue
  }
  if (arg.startsWith('-')) continue
  if (arg === '.') continue
  roots.push(arg)
}

const found = []
function walk(directory, depth) {
  let entries
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : 1))
  for (const entry of entries) {
    if (!hidden && entry.name.startsWith('.')) continue
    const full = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      let target
      try {
        target = fs.statSync(full)
      } catch {
        continue
      }
      if (!target.isFile()) continue
      if (depth + 1 <= maxDepth) found.push(full)
      continue
    }
    if (entry.isDirectory()) {
      if (depth + 1 < maxDepth) walk(full, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    if (depth + 1 <= maxDepth) found.push(full)
  }
}
for (const root of roots) walk(root, 0)

const separator = printNull ? '\\0' : '\\n'
function render(file) {
  return absolute ? path.resolve(file) : path.relative(process.cwd(), file)
}
function emit(file) {
  process.stdout.write(render(file) + separator)
}
function emitAll() {
  for (const file of found) emit(file)
}
`

const describePosix = process.platform === 'win32' ? describe.skip : describe

/**
 * Root-level files beyond the named samples. They keep the flattened stdout stream comfortably
 * wider than the backend's bounded stat-pool window, which is what lets a scan publish a batch
 * while the child is still running (the cancellation case depends on it).
 */
const ROOT_SAMPLE_FILES = ['sample-1.txt', 'sample-2.txt', 'sample-3.txt', 'sample-4.txt']

let fixtureDir = ''
let root = ''

function writeFixture(name: string, body: string): string {
  const fixturePath = path.join(fixtureDir, name)
  writeFileSync(fixturePath, `${FIXTURE_PRELUDE}\n${body}\n`, { mode: 0o755 })
  return fixturePath
}

function fixturePath(relativePath: string): string {
  return path.join(root, relativePath)
}

function writeFile(relativePath: string, contents = 'x'): string {
  const fullPath = fixturePath(relativePath)
  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, contents)
  return fullPath
}

/** Directory names the shared filter rejects are used on purpose: fd enumerates them, Tuff must not admit them. */
function buildFixtureTree(): void {
  // realpath: fd canonicalises the root it is handed, and /var is a symlink of /private/var on
  // macOS. Scanning the non-canonical spelling would make every child fail root containment.
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tuff-fd-tree-')))
  writeFile('root.txt')
  writeFile('space name.txt')
  writeFile('line\nbreak.txt')
  writeFile('café-notes.md')
  writeFile('.hidden-file.txt')
  writeFile('desktop.ini')
  writeFile('LICENSE')
  for (const sampleFile of ROOT_SAMPLE_FILES) writeFile(sampleFile)
  writeFile(path.join('nested', 'nested.txt'))
  writeFile(path.join('nested', 'deeper', 'deeper.txt'))
  writeFile(path.join('node_modules', 'package.json'))
  writeFile(path.join('.hidden-dir', 'inner.txt'))
  writeFile(path.join('excluded-dir', 'skipped.txt'))
  writeFile(path.join('excluded-dir-sibling', 'kept.txt'))
  symlinkSync(fixturePath(path.join('nested', 'nested.txt')), fixturePath('link-to-nested.txt'))
}

/** Traversal and admission filters off: the fixture tree lives under a system temp path. */
function fixtureOptions(maxDepth: number): FileScanOptions {
  return {
    maxDepth,
    enableSystemPathFilter: false,
    enableCachePathFilter: false,
    enableDevPathFilter: false,
    enablePhotosLibraryFilter: false
  }
}

interface ScanOutcome {
  files: ScannedFileInfo[]
  batches: ScannedFileInfo[][]
  stats: ScanDirectoryStats | null
}

async function runFdScan(input: {
  testBinaryPath: string
  options: FileScanOptions
  excludePaths?: Set<string>
  batchSize?: number
  signal?: AbortSignal
  onBatch?: (batch: ScannedFileInfo[]) => void
}): Promise<ScanOutcome> {
  const batches: ScannedFileInfo[][] = []
  const stats = await scanDirectoryBatchesWithFd(
    root,
    async (batch) => {
      batches.push(batch)
      input.onBatch?.(batch)
    },
    input.options,
    input.excludePaths,
    {
      batchSize: input.batchSize ?? 500,
      signal: input.signal,
      testBinaryPath: input.testBinaryPath
    }
  )
  return { files: batches.flat(), batches, stats }
}

async function runLegacyScan(input: {
  options: FileScanOptions
  excludePaths?: Set<string>
  batchSize?: number
}): Promise<ScanOutcome> {
  const batches: ScannedFileInfo[][] = []
  const stats = await scanDirectoryBatches(
    root,
    async (batch) => {
      batches.push(batch)
    },
    input.options,
    input.excludePaths,
    { batchSize: input.batchSize ?? 500 }
  )
  return { files: batches.flat(), batches, stats }
}

/** Both walkers normalise to NFC, so the comparison is on the index's own path identity. */
function sortedPaths(files: ScannedFileInfo[]): string[] {
  return files.map((file) => file.path.normalize('NFC')).sort()
}

/**
 * What the packaged app resolves and spawns. `@prebuilt-binary/fd` is a wrapper manifest whose
 * platform package sits beside it inside the archive; the archive itself is not a directory on
 * disk, so a spawn from `app.asar/...` fails with ENOTDIR.
 */
describe('resolveBundledFdBinary packaged resolution', () => {
  const resources = '/Applications/Tuff.app/Contents/Resources'
  const wrapperManifest = `${resources}/app.asar/node_modules/@prebuilt-binary/fd/package.json`
  const platformPackage = `@prebuilt-binary/fd-${process.platform}-${process.arch}`
  const binaryName = process.platform === 'win32' ? 'fd.exe' : 'fd'
  const binarySpecifier = `${platformPackage}/bin/${binaryName}`
  const packedBinary = `${resources}/app.asar/node_modules/${binarySpecifier}`
  const unpackedBinary = `${resources}/app.asar.unpacked/node_modules/${binarySpecifier}`

  afterEach(() => {
    moduleSeam.resolveCalls.length = 0
    moduleSeam.resolutions.clear()
    vi.unstubAllEnvs()
  })

  it('spawns the unpacked twin of the path the wrapper resolves to', () => {
    moduleSeam.resolutions.set('@prebuilt-binary/fd/package.json', wrapperManifest)
    moduleSeam.resolutions.set(binarySpecifier, packedBinary)

    expect(resolveBundledFdBinary()).toBe(unpackedBinary)

    // The wrapper manifest is the resolution root: the platform package lives beside it, and a
    // resolution anchored anywhere else cannot see it once the app is packaged.
    expect(moduleSeam.resolveCalls).toEqual([
      {
        from: expect.stringMatching(/file-scan-worker\.js$/),
        specifier: '@prebuilt-binary/fd/package.json'
      },
      { from: wrapperManifest, specifier: binarySpecifier }
    ])
  })

  it('returns null rather than throwing when this platform has no bundled fd package', () => {
    moduleSeam.resolutions.set('@prebuilt-binary/fd/package.json', wrapperManifest)

    // An unsupported platform must let the caller restart the root with the legacy walker.
    expect(resolveBundledFdBinary()).toBeNull()
    expect(moduleSeam.resolveCalls).toHaveLength(2)
  })

  it('prefers an explicit test binary without walking the module graph', () => {
    moduleSeam.resolutions.set(binarySpecifier, packedBinary)

    expect(resolveBundledFdBinary('./fixtures/fd')).toBe(path.resolve('./fixtures/fd'))
    expect(moduleSeam.resolveCalls).toEqual([])
  })

  it('prefers the environment override over the bundled binary', () => {
    moduleSeam.resolutions.set(binarySpecifier, packedBinary)
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('TUFF_TEST_FD_BINARY_PATH', '/tmp/override-fd')

    expect(resolveBundledFdBinary()).toBe('/tmp/override-fd')
    expect(moduleSeam.resolveCalls).toEqual([])
  })
})

describePosix('file-scan-fd-backend', () => {
  let walkerBinary = ''

  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'tuff-fd-fixture-'))
    buildFixtureTree()
    walkerBinary = writeFixture('walker.cjs', 'emitAll()')
  })

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  it('admits exactly the legacy walker set for the same root, filters and depth, over NUL paths', async () => {
    const options = fixtureOptions(3)
    const { files, stats } = await runFdScan({ testBinaryPath: walkerBinary, options })
    const legacy = await runLegacyScan({ options })

    expect(sortedPaths(files)).toEqual(sortedPaths(legacy.files))
    // Non-vacuous: the two walkers really did agree on an admitted tree, not on an empty one.
    expect(files.length).toBeGreaterThan(0)
    expect(stats).toEqual({ entryCount: files.length, errorCount: 0 })

    const admitted = sortedPaths(files)
    const expected = [
      'root.txt',
      'space name.txt',
      'line\nbreak.txt',
      'café-notes.md',
      ...ROOT_SAMPLE_FILES,
      path.join('nested', 'nested.txt'),
      path.join('nested', 'deeper', 'deeper.txt'),
      path.join('excluded-dir', 'skipped.txt'),
      path.join('excluded-dir-sibling', 'kept.txt')
    ]
      .map((relativePath) => fixturePath(relativePath).normalize('NFC'))
      .sort()
    expect(admitted).toEqual(expected)

    // Newlines, spaces and non-ASCII survive the NUL protocol byte for byte. A reader that
    // split on newlines would lose `line\nbreak.txt` and merge its tail into a bogus path.
    const newlineFile = files.find((file) => file.name === 'line\nbreak.txt')
    expect(newlineFile?.extension).toBe('.txt')
    expect(files.some((file) => file.name === 'space name.txt')).toBe(true)
    expect(files.some((file) => file.name === 'café-notes.md')).toBe(true)
  })

  it('never admits the exclusions fd itself enumerated: filter-rejected names, hidden dirs and symlinks', async () => {
    const options = fixtureOptions(3)
    const { files } = await runFdScan({ testBinaryPath: walkerBinary, options })
    const admitted = sortedPaths(files)
    const excluded = [
      fixturePath(path.join('node_modules', 'package.json')),
      fixturePath(path.join('.hidden-dir', 'inner.txt')),
      fixturePath('.hidden-file.txt'),
      fixturePath('desktop.ini'),
      fixturePath('LICENSE'),
      fixturePath('link-to-nested.txt')
    ].map((filePath) => filePath.normalize('NFC'))

    for (const excludedPath of excluded) {
      expect(admitted).not.toContain(excludedPath)
    }
  })

  it('bounds every published batch to the requested size and still publishes each admitted file once', async () => {
    const options = fixtureOptions(3)
    const { files, batches } = await runFdScan({
      testBinaryPath: walkerBinary,
      options,
      batchSize: 2
    })

    expect(batches.length).toBe(Math.ceil(files.length / 2))
    for (const batch of batches) {
      expect(batch.length).toBeGreaterThan(0)
      expect(batch.length).toBeLessThanOrEqual(2)
    }
    expect(new Set(sortedPaths(files)).size).toBe(files.length)
  })

  it('bounds enumeration at the requested root depth', async () => {
    const rootOnly = await runFdScan({
      testBinaryPath: walkerBinary,
      options: fixtureOptions(0)
    })
    expect(sortedPaths(rootOnly.files)).toEqual(
      ['root.txt', 'space name.txt', 'line\nbreak.txt', 'café-notes.md', ...ROOT_SAMPLE_FILES]
        .map((name) => fixturePath(name).normalize('NFC'))
        .sort()
    )

    const oneLevel = await runFdScan({
      testBinaryPath: walkerBinary,
      options: fixtureOptions(1)
    })
    expect(sortedPaths(oneLevel.files)).toContain(fixturePath(path.join('nested', 'nested.txt')))
    expect(sortedPaths(oneLevel.files)).not.toContain(
      fixturePath(path.join('nested', 'deeper', 'deeper.txt'))
    )
    // The depth boundary is the same one the legacy walker draws for this option.
    const legacyOneLevel = await runLegacyScan({ options: fixtureOptions(1) })
    expect(sortedPaths(oneLevel.files)).toEqual(sortedPaths(legacyOneLevel.files))
  })

  it('invokes fd with the fixed enumeration contract and a single search thread', async () => {
    const argvFile = path.join(fixtureDir, 'argv-probe.json')
    // Dumps the argv it was spawned with, so the invocation contract is observable instead of
    // being the fixture's own guess.
    const probeBinary = writeFixture(
      'argv-probe.cjs',
      `fs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(argv))\nemitAll()`
    )

    await runFdScan({ testBinaryPath: probeBinary, options: fixtureOptions(3) })

    const argv = JSON.parse(readFileSync(argvFile, 'utf8')) as string[]
    // One enumeration thread is the resource budget as a hard cap, not a preference.
    expect(argv[argv.indexOf('--threads') + 1]).toBe('1')
    expect(argv[argv.indexOf('--type') + 1]).toBe('f')
    expect(argv[argv.indexOf('--color') + 1]).toBe('never')
    // fd counts an entry's depth from the root; Tuff counts the directories below it.
    expect(argv[argv.indexOf('--max-depth') + 1]).toBe('4')
    for (const flag of ['--hidden', '--no-ignore', '--absolute-path', '--print0']) {
      expect(argv).toContain(flag)
    }
  })

  it('excludes a path by segment, never by string prefix', async () => {
    const options = fixtureOptions(3)
    const excludePaths = new Set([fixturePath('excluded-dir')])
    const { files } = await runFdScan({ testBinaryPath: walkerBinary, options, excludePaths })
    const admitted = sortedPaths(files)

    expect(admitted).not.toContain(fixturePath(path.join('excluded-dir', 'skipped.txt')))
    // `excluded-dir-sibling` merely starts with the excluded string; it is a different directory.
    expect(admitted).toContain(fixturePath(path.join('excluded-dir-sibling', 'kept.txt')))

    const legacy = await runLegacyScan({ options, excludePaths })
    expect(admitted).toEqual(sortedPaths(legacy.files))
  })

  it('rejects a non-zero fd exit even after publishing batches, so the caller restarts the root', async () => {
    // Exits with a non-zero code on its own (letting stdout flush), the way fd dies on a
    // permission error halfway through a tree.
    const failingBinary = writeFixture('failing.cjs', 'emitAll()\nprocess.exitCode = 3')
    const batches: ScannedFileInfo[][] = []

    await expect(
      runFdScan({
        testBinaryPath: failingBinary,
        options: fixtureOptions(3),
        batchSize: 1,
        onBatch: (batch) => batches.push(batch)
      })
    ).rejects.toThrow('FD_SCAN_FAILED:3')
    // Publication already happened; the contract that matters is that the scan still refuses to
    // report the root complete, which is what sends the caller back to the legacy walker.
    expect(batches.length).toBeGreaterThan(0)
  })

  it('rejects when the fd binary cannot be spawned and leaks no unhandled rejection', async () => {
    const missingBinary = path.join(fixtureDir, 'no-such-fd-binary')
    const batches: ScannedFileInfo[][] = []
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      await expect(
        runFdScan({
          testBinaryPath: missingBinary,
          options: fixtureOptions(3),
          onBatch: (batch) => batches.push(batch)
        })
      ).rejects.toThrow(/ENOENT/)
      // Let the spawn error finish propagating before judging what escaped: a rejection that
      // nobody owns aborts the main process under node's default policy instead of returning
      // the root to the legacy walker.
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(unhandled).toEqual([])
      expect(batches).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('kills the child, stops publishing, and rejects with the abort reason when the scan is cancelled', async () => {
    const pidFile = path.join(fixtureDir, 'cancelled.pid')
    // The full root is emitted before the child parks, so the backend's bounded stat pool
    // publishes a batch while the scan is still in flight and the abort has something to stop.
    const hangingBinary = writeFixture(
      'hanging.cjs',
      [
        `fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
        'emitAll()',
        'setInterval(() => {}, 1000)'
      ].join('\n')
    )
    const controller = new AbortController()
    const cancelReason = new Error('scan cancelled by test')
    const batches: ScannedFileInfo[][] = []

    const scan = runFdScan({
      testBinaryPath: hangingBinary,
      options: fixtureOptions(3),
      batchSize: 1,
      signal: controller.signal,
      onBatch: (batch) => {
        batches.push(batch)
        controller.abort(cancelReason)
      }
    })

    await expect(scan).rejects.toBe(cancelReason)
    // Exactly the batch handed over before the abort; the pending stdout tail is dropped.
    expect(batches.length).toBe(1)
    const childPid = Number(readFileSync(pidFile, 'utf8'))
    expect(Number.isInteger(childPid)).toBe(true)
    // The scan only settles after its `finally` awaited the child exit, so the process is gone.
    expect(() => process.kill(childPid, 0)).toThrow()
  })
})
