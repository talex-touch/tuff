import { mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CorpusManifest } from '../types'
import { RunRefused } from './errors'
import type { RunLayout } from './layout'
import { CORPUS_MARKER, DEFAULT_CORPUS_BASE } from './layout'

export interface CorpusMarker {
  tool: 'search-index-stress'
  runId: string
  createdAt: number
  /** False while the seed corpus is still being written; a resumed run writes it again. */
  complete: boolean
  files?: number
  bytes?: number
}

export interface CorpusDeps {
  materialize: (root: string, corpus: CorpusManifest) => Promise<{ files: number; bytes: number }>
  now: () => number
}

type CorpusPaths = Pick<RunLayout, 'runId' | 'corpusRoot'>

export async function readMarker(root: string): Promise<CorpusMarker | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(root, CORPUS_MARKER), 'utf8')
    ) as Partial<CorpusMarker>
    return parsed.tool === 'search-index-stress' && typeof parsed.runId === 'string'
      ? (parsed as CorpusMarker)
      : null
  } catch {
    return null
  }
}

async function writeMarker(root: string, marker: CorpusMarker): Promise<void> {
  const file = path.join(root, CORPUS_MARKER)
  await writeFile(`${file}.tmp`, `${JSON.stringify(marker)}\n`)
  await rename(`${file}.tmp`, file)
}

/**
 * Creates the seed corpus under the run's corpus root. The marker file goes in first: cleanup and
 * resume only trust a directory that carries it, so a non-empty directory of the user's is refused.
 */
export async function prepareCorpus(
  layout: CorpusPaths,
  corpus: CorpusManifest,
  deps: CorpusDeps
): Promise<{ files: number; bytes: number; reused: boolean }> {
  const root = layout.corpusRoot
  const existing = await readMarker(root)
  if (existing && existing.runId !== layout.runId) {
    throw new RunRefused(
      `corpus root ${root} belongs to run ${existing.runId}; use a fresh --corpus-root or remove it first`
    )
  }
  if (!existing) {
    const entries = await readdir(root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    if (entries.length > 0) {
      throw new RunRefused(
        `corpus root ${root} is not empty and was not created by a stress run (no ${CORPUS_MARKER}); refusing to write into it`
      )
    }
  }
  if (existing?.complete)
    return { files: existing.files ?? 0, bytes: existing.bytes ?? 0, reused: true }

  await mkdir(root, { recursive: true })
  const marker: CorpusMarker = {
    tool: 'search-index-stress',
    runId: layout.runId,
    createdAt: existing?.createdAt ?? deps.now(),
    complete: false
  }
  await writeMarker(root, marker)
  const written = await deps.materialize(root, corpus)
  await writeMarker(root, { ...marker, complete: true, files: written.files, bytes: written.bytes })
  return { ...written, reused: false }
}

export type CleanupResult =
  | { removed: true; dir: string }
  | { removed: false; dir: string | null; reason: string }

/**
 * Deletes the directory the runner created for this run under the shared corpus base, and nothing
 * else: a custom corpus root, a directory without this run's marker or one reached through a
 * symlink is left alone.
 */
export async function removeOwnedCorpus(
  layout: Pick<RunLayout, 'runId' | 'corpusRoot' | 'corpusOwnedDir'>,
  options: { base?: string } = {}
): Promise<CleanupResult> {
  const base = path.resolve(options.base ?? DEFAULT_CORPUS_BASE)
  const owned = layout.corpusOwnedDir
  if (owned === null)
    return {
      removed: false,
      dir: null,
      reason: 'the corpus root was given with --corpus-root; it is never deleted'
    }
  const refuse = (reason: string): CleanupResult => ({ removed: false, dir: owned, reason })
  if (path.dirname(owned) !== base || path.basename(owned) !== layout.runId) {
    return refuse(`${owned} is not ${path.join(base, layout.runId)}`)
  }
  if (layout.corpusRoot !== path.join(owned, 'corpus'))
    return refuse(`${layout.corpusRoot} is not the corpus directory of this run`)
  const marker = await readMarker(layout.corpusRoot)
  if (!marker) return refuse(`${layout.corpusRoot} has no ${CORPUS_MARKER}`)
  if (marker.runId !== layout.runId)
    return refuse(`the marker in ${layout.corpusRoot} belongs to run ${marker.runId}`)
  try {
    const [realOwned, realBase] = await Promise.all([realpath(owned), realpath(base)])
    if (realOwned !== path.join(realBase, layout.runId))
      return refuse(`${owned} resolves to ${realOwned}, outside ${realBase}`)
  } catch (error) {
    return refuse(`could not resolve ${owned}: ${(error as Error).message}`)
  }
  await rm(owned, { recursive: true, force: true })
  return { removed: true, dir: owned }
}
