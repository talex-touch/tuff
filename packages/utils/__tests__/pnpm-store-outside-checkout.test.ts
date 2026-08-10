import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The pnpm store must not live inside the checkout (#719).
 *
 * `store-dir=.pnpm-store` put the content-addressable store in the working tree. Every workflow
 * uses `actions/setup-node` with `cache: pnpm`, which caches whatever `pnpm store path` returns —
 * so the store was restored into the tree before install and re-uploaded after, with a cache key
 * covering files the build itself writes. `build-and-release.yml` also runs `rm -rf` sweeps under
 * `GITHUB_WORKSPACE`, any of which can delete the store that `node_modules` hardlinks point into.
 *
 * It was also per-clone rather than per-user, so a second clone re-downloaded every package.
 *
 * Removed rather than repointed: pnpm's default is already outside the repository and shared across
 * clones, which is exactly what a relative `store-dir` was preventing.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

function npmrcFiles(dir: string, depth = 0): string[] {
  if (depth > 3) return []
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...npmrcFiles(full, depth + 1))
    else if (entry === '.npmrc') found.push(full)
  }
  return found
}

const files = npmrcFiles(REPO_ROOT)

describe('pnpm store location', () => {
  it('finds the npmrc files it is meant to check', () => {
    // Positive control: the rule below is vacuous against an empty list, which is what a wrong root
    // or an over-eager skip produces.
    expect(files.length).toBeGreaterThan(1)
    expect(files.some((file) => path.relative(REPO_ROOT, file) === '.npmrc')).toBe(true)
  })

  it('is not pinned to a path inside the repository by any npmrc', () => {
    const offenders = files.flatMap((file) => {
      const setting = /^\s*store-dir\s*=\s*(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim()
      if (!setting) return []
      // Absolute or ~-anchored paths are outside the checkout by construction; a relative one is
      // resolved against the npmrc's own directory, which is inside it.
      const outside = setting.startsWith('~') || path.isAbsolute(setting)
      return outside ? [] : [`${path.relative(REPO_ROOT, file)}: store-dir=${setting}`]
    })

    expect(offenders).toEqual([])
  })

  it('keeps the ignore entry, so a stale in-tree store is never committed', () => {
    // The setting is gone, but a developer who ran an older checkout still has the directory.
    expect(readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8')).toContain('.pnpm-store/')
  })
})
