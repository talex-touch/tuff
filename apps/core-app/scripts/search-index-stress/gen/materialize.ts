import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { CorpusManifest } from '../types'
import { materializePayload } from './payload'
import { pathProblem } from './policy'

const WRITE_CONCURRENCY = 16

/** Absolute location of a corpus-relative path; throws for anything that could leave `root` lexically. */
export function resolveInsideRoot(root: string, relative: string): string {
  const problem = pathProblem(relative)
  if (problem) throw new Error(`refusing corpus path: ${problem}`)
  const absolute = join(root, ...relative.split('/'))
  if (absolute !== root && !absolute.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new Error(`refusing corpus path outside the root: ${relative}`)
  }
  return absolute
}

/** Walks the existing part of the path and refuses a symlink anywhere on it (a planted link could redirect writes). */
async function assertNoSymlink(realRoot: string, relative: string): Promise<void> {
  let current = realRoot
  for (const part of relative.split('/')) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`refusing symlink inside the corpus: ${relative}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

async function unchanged(target: string, data: Buffer): Promise<boolean> {
  try {
    if ((await stat(target)).size !== data.length) return false
    return Buffer.compare(await readFile(target), data) === 0
  } catch {
    return false
  }
}

/** Creates the corpus under `root`; running it again leaves matching files untouched and repairs the rest. */
export async function materializeCorpus(
  root: string,
  corpus: CorpusManifest
): Promise<{ files: number; bytes: number }> {
  for (const path of [...corpus.directories, ...corpus.files.map((file) => file.path)]) {
    const problem = pathProblem(path)
    if (problem) throw new Error(`refusing corpus path: ${problem}`)
  }
  await mkdir(root, { recursive: true })
  const realRoot = await realpath(root)
  for (const dir of corpus.directories) {
    await assertNoSymlink(realRoot, dir)
    await mkdir(resolveInsideRoot(realRoot, dir), { recursive: true })
  }
  let bytes = 0
  for (let start = 0; start < corpus.files.length; start += WRITE_CONCURRENCY) {
    const batch = corpus.files.slice(start, start + WRITE_CONCURRENCY)
    const sizes = await Promise.all(
      batch.map(async (file) => {
        await assertNoSymlink(realRoot, file.path)
        const target = resolveInsideRoot(realRoot, file.path)
        const data = materializePayload(file.payload)
        if (!(await unchanged(target, data))) await writeFile(target, data)
        return data.length
      })
    )
    for (const size of sizes) bytes += size
  }
  return { files: corpus.files.length, bytes }
}
