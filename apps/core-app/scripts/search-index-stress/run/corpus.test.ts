import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CorpusManifest } from '../types'
import type { CorpusDeps } from './corpus'
import { prepareCorpus, readMarker, removeOwnedCorpus } from './corpus'
import { RunRefused } from './errors'
import { CORPUS_MARKER } from './layout'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'stress-corpus-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const corpus: CorpusManifest = { directories: ['docs'], files: [] }

function deps(): CorpusDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    now: () => 1234,
    materialize: async (root) => {
      calls.push(root)
      await mkdir(path.join(root, 'docs'), { recursive: true })
      await writeFile(path.join(root, 'docs', 'seed.txt'), 'x')
      return { files: 1, bytes: 1 }
    }
  }
}

describe('prepareCorpus', () => {
  it('creates the root, writes the marker first and finishes it after the files', async () => {
    const root = path.join(dir, 'new', 'corpus')
    const fake = deps()
    const seen: Array<boolean | undefined> = []
    const result = await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, {
      ...fake,
      materialize: async (target, manifest) => {
        seen.push((await readMarker(target))?.complete)
        return fake.materialize(target, manifest)
      }
    })

    expect(result).toEqual({ files: 1, bytes: 1, reused: false })
    expect(seen).toEqual([false])
    expect(await readMarker(root)).toMatchObject({
      runId: 'run-a',
      complete: true,
      files: 1,
      createdAt: 1234
    })
    expect(await readFile(path.join(root, 'docs', 'seed.txt'), 'utf8')).toBe('x')
  })

  it('accepts an existing empty directory', async () => {
    const root = path.join(dir, 'empty')
    await mkdir(root)
    await expect(
      prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, deps())
    ).resolves.toMatchObject({ reused: false })
  })

  it('refuses a non-empty directory that has no marker and touches nothing in it', async () => {
    const root = path.join(dir, 'documents')
    await mkdir(root)
    await writeFile(path.join(root, 'mine.txt'), 'precious')
    const fake = deps()

    await expect(
      prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, fake)
    ).rejects.toBeInstanceOf(RunRefused)
    expect(fake.calls).toEqual([])
    expect(await readdir(root)).toEqual(['mine.txt'])
  })

  it('refuses a corpus that belongs to another run', async () => {
    const root = path.join(dir, 'corpus')
    await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, deps())
    await expect(
      prepareCorpus({ runId: 'run-b', corpusRoot: root }, corpus, deps())
    ).rejects.toThrow(/belongs to run run-a/)
  })

  it('does not write a finished corpus again on resume, because scenarios have changed it since', async () => {
    const root = path.join(dir, 'corpus')
    await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, deps())
    await rm(path.join(root, 'docs', 'seed.txt'))
    const fake = deps()
    const again = await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, fake)

    expect(again).toMatchObject({ reused: true, files: 1 })
    expect(fake.calls).toEqual([])
    await expect(stat(path.join(root, 'docs', 'seed.txt'))).rejects.toThrow()
  })

  it('writes again when the first attempt stopped half way', async () => {
    const root = path.join(dir, 'corpus')
    await mkdir(root)
    await writeFile(
      path.join(root, CORPUS_MARKER),
      JSON.stringify({ tool: 'search-index-stress', runId: 'run-a', createdAt: 1, complete: false })
    )
    const fake = deps()

    expect(await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, fake)).toMatchObject({
      reused: false
    })
    expect(fake.calls).toEqual([root])
    expect((await readMarker(root))?.createdAt).toBe(1)
  })
})

describe('removeOwnedCorpus', () => {
  async function ownedRun(runId = 'run-a') {
    const base = path.join(dir, 'shared')
    const owned = path.join(base, runId)
    const corpusRoot = path.join(owned, 'corpus')
    await prepareCorpus({ runId, corpusRoot }, corpus, deps())
    return { base, layout: { runId, corpusRoot, corpusOwnedDir: owned } }
  }

  it('removes the directory the runner created', async () => {
    const { base, layout } = await ownedRun()
    expect(await removeOwnedCorpus(layout, { base })).toEqual({
      removed: true,
      dir: layout.corpusOwnedDir
    })
    await expect(stat(layout.corpusOwnedDir)).rejects.toThrow()
    expect((await stat(base)).isDirectory()).toBe(true)
  })

  it('refuses a directory without the marker', async () => {
    const { base, layout } = await ownedRun()
    await rm(path.join(layout.corpusRoot, CORPUS_MARKER))
    const result = await removeOwnedCorpus(layout, { base })

    expect(result).toMatchObject({ removed: false })
    expect((result as { reason: string }).reason).toContain(CORPUS_MARKER)
    expect((await stat(layout.corpusRoot)).isDirectory()).toBe(true)
  })

  it('refuses a marker from another run', async () => {
    const { base, layout } = await ownedRun()
    await writeFile(
      path.join(layout.corpusRoot, CORPUS_MARKER),
      JSON.stringify({
        tool: 'search-index-stress',
        runId: 'someone-else',
        createdAt: 1,
        complete: true
      })
    )
    expect(await removeOwnedCorpus(layout, { base })).toMatchObject({
      removed: false,
      reason: expect.stringContaining('someone-else')
    })
  })

  it('refuses anything outside the shared base, however well it is marked', async () => {
    const { layout } = await ownedRun()
    const result = await removeOwnedCorpus(layout, { base: path.join(dir, 'elsewhere') })
    expect(result).toMatchObject({ removed: false })
    expect((await stat(layout.corpusRoot)).isDirectory()).toBe(true)
  })

  it('never deletes a corpus root the user chose', async () => {
    const root = path.join(dir, 'custom')
    await prepareCorpus({ runId: 'run-a', corpusRoot: root }, corpus, deps())
    const result = await removeOwnedCorpus({
      runId: 'run-a',
      corpusRoot: root,
      corpusOwnedDir: null
    })

    expect(result).toMatchObject({ removed: false, dir: null })
    expect((await stat(root)).isDirectory()).toBe(true)
  })

  it('refuses a run directory that is really a symlink to somewhere else', async () => {
    const { base, layout } = await ownedRun()
    const elsewhere = path.join(dir, 'outside')
    await mkdir(path.join(elsewhere, 'corpus'), { recursive: true })
    await writeFile(
      path.join(elsewhere, 'corpus', CORPUS_MARKER),
      JSON.stringify({ tool: 'search-index-stress', runId: 'run-a', createdAt: 1, complete: true })
    )
    await writeFile(path.join(elsewhere, 'keep.txt'), 'keep')
    await rm(layout.corpusOwnedDir, { recursive: true })
    await symlink(elsewhere, layout.corpusOwnedDir)

    expect(await removeOwnedCorpus(layout, { base })).toMatchObject({
      removed: false,
      reason: expect.stringContaining('outside')
    })
    expect(await readFile(path.join(elsewhere, 'keep.txt'), 'utf8')).toBe('keep')
  })

  it("refuses a corpus directory that is not the run's own", async () => {
    const { base, layout } = await ownedRun()
    expect(
      await removeOwnedCorpus(
        { ...layout, corpusRoot: path.join(layout.corpusOwnedDir, 'other') },
        { base }
      )
    ).toMatchObject({ removed: false })
  })
})
