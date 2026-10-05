/**
 * A fingerprint of a directory tree, for tests that have to prove nothing was written into a
 * directory Tuff only reads — an agent's skills or its configuration.
 *
 * Entries, link targets, sizes, modification times and content hashes: creating, deleting,
 * rewriting or re-linking anything changes it, and reading does not. Links are recorded, never
 * followed, so a test sees the tree exactly as the agent laid it out.
 */

import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, readlink } from 'node:fs/promises'
import { join, relative } from 'node:path'

export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  const visit = async (path: string): Promise<void> => {
    const info = await lstat(path)
    const key = relative(root, path) || '.'
    if (info.isSymbolicLink()) {
      entries[key] = `link -> ${await readlink(path)}`
      return
    }
    if (info.isDirectory()) {
      entries[key] = `dir mtime=${info.mtimeMs}`
      for (const name of (await readdir(path)).sort()) await visit(join(path, name))
      return
    }
    const content = await readFile(path)
    entries[key] =
      `file size=${info.size} mtime=${info.mtimeMs} sha256=${createHash('sha256').update(content).digest('hex')}`
  }
  await visit(root)
  return entries
}
