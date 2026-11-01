import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  classifyLogLine,
  DB_MARKERS,
  findQuarantineFiles,
  MARKER_PREFILTER,
  stripAnsi
} from './db-markers'

const CORE_APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('DB_MARKERS', () => {
  it('has unique ids and all three classes', () => {
    const ids = DB_MARKERS.map((marker) => marker.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(DB_MARKERS.map((marker) => marker.cls))).toEqual(
      new Set(['repair', 'suspect', 'expected-on-fresh-profile'])
    )
  })

  it.each(DB_MARKERS.map((marker) => [marker.id, marker] as const))(
    '%s: its sample is classified as itself',
    (_id, marker) => {
      expect(MARKER_PREFILTER.test(marker.sample)).toBe(true)
      expect(classifyLogLine(marker.sample)?.marker.id).toBe(marker.id)
    }
  )

  it.each(DB_MARKERS.map((marker) => [marker.id, marker] as const))(
    '%s: the message is still where the table says it is',
    async (_id, marker) => {
      const source = await readFile(join(CORE_APP_ROOT, marker.source.file), 'utf8')
      expect(source).toContain(marker.source.fragment)
    }
  )

  it('classifies a line the way it appears in the app log, ANSI colour and prefix included', () => {
    const ESC = '\u001b'
    const line =
      `[2026-10-30T10:00:00.000] [ERROR] error - [10:00:00.000] [ERROR] ${ESC}[31m[Database]${ESC}[39m ` +
      'Corrupt primary database detected; quarantining and rebuilding dbPath=/Users/x/tuff/database.db'
    const hit = classifyLogLine(line)
    expect(hit?.marker.id).toBe('corrupt-detected')
    expect(hit?.marker.cls).toBe('repair')
    expect(hit?.text).not.toContain(ESC)
  })

  it('treats a generic engine corruption error as repair-class', () => {
    expect(classifyLogLine('SQLITE_CORRUPT: database disk image is malformed')?.marker.cls).toBe(
      'repair'
    )
    expect(classifyLogLine('LibsqlError: file is not a database (SQLITE_NOTADB)')?.marker.cls).toBe(
      'repair'
    )
  })

  it('does not fire on ordinary lines, including ones that merely mention rebuilding UI', () => {
    for (const line of [
      '[Perf:EventLoop] Event loop lag 910ms lagMs=910',
      'Search index ready entries=10234',
      'Rebuilding the renderer bundle',
      'integrity of the plugin manifest verified',
      ''
    ]) {
      expect(classifyLogLine(line)).toBeNull()
    }
  })

  it('knows the first-boot reindex is expected on a fresh profile and says so', () => {
    const hit = classifyLogLine(
      "Search index bootstrap reindex scheduled: search_index empty for 'file-provider' with 2 watch root(s)"
    )
    expect(hit?.marker.cls).toBe('expected-on-fresh-profile')
  })
})

describe('stripAnsi', () => {
  it('removes colour sequences and nothing else', () => {
    expect(stripAnsi('\u001b[41m\u001b[37m3.2s\u001b[39m\u001b[49m [x]')).toBe('3.2s [x]')
  })
})

describe('findQuarantineFiles', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stress-quarantine-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds *.corrupt files at depth and ignores look-alikes', async () => {
    await mkdir(join(dir, 'modules', 'database'), { recursive: true })
    await writeFile(join(dir, 'modules', 'database', 'database.db.corrupt'), '')
    await writeFile(join(dir, 'modules', 'database', 'database.db'), '')
    await writeFile(join(dir, 'search-index.db.corrupt-2026'), '')
    await writeFile(join(dir, 'notes-corrupt.txt'), '')
    const found = await findQuarantineFiles(dir)
    expect(found.map((file) => file.slice(dir.length + 1))).toEqual([
      join('modules', 'database', 'database.db.corrupt'),
      'search-index.db.corrupt-2026'
    ])
  })

  it('returns nothing for a missing directory and does not descend into node_modules', async () => {
    expect(await findQuarantineFiles(join(dir, 'missing'))).toEqual([])
    await mkdir(join(dir, 'node_modules', 'x'), { recursive: true })
    await writeFile(join(dir, 'node_modules', 'x', 'a.corrupt'), '')
    expect(await findQuarantineFiles(dir)).toEqual([])
  })
})
