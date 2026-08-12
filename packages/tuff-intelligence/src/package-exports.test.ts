import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  execFileSync('node', ['-e', 'process.stdout.write(JSON.stringify(require("./package.json")))'], {
    cwd: packageRoot,
    encoding: 'utf8',
  }),
) as {
  files?: string[]
  main?: string
  exports?: Record<string, Record<string, string> | string>
  scripts?: Record<string, string>
}

/** Every relative path the exports map and `main` point at. */
function declaredTargets(): string[] {
  const targets = new Set<string>()
  if (typeof manifest.main === 'string')
    targets.add(manifest.main)
  for (const entry of Object.values(manifest.exports ?? {})) {
    if (typeof entry === 'string')
      targets.add(entry)
    else
      for (const value of Object.values(entry)) targets.add(value)
  }
  return [...targets].map(target => target.replace(/^\.\//, ''))
}

/**
 * The files npm would actually publish, asked of npm rather than reimplemented.
 *
 * `files` has its own glob and always-include semantics, so a hand-rolled matcher would answer a
 * slightly different question than the one that matters.
 */
function packedFiles(): string[] {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  return (JSON.parse(output) as Array<{ files: Array<{ path: string }> }>)[0]!.files.map(
    entry => entry.path,
  )
}

/**
 * An exports target that is not in the tarball (#970).
 *
 * `exports['./client'].require` pointed at `./dist/client.cjs` while `files` was `["src"]`, so
 * `require('@talex-touch/tuff-intelligence/client')` resolved to a path the package does not
 * contain. It worked in this repo because `dist/` exists on disk here, and it worked from npm
 * because the published 0.0.2 still lists `dist` in `files` — the two drifted apart in c8977cc44
 * without the version changing.
 *
 * This is the second time in one day that a `files` array omitted something another field pointed
 * at; `scripts/verify-audio-production.js` was the first (#1674). Both are invisible in the repo
 * and only appear to a consumer of the published package.
 */
describe('published surface', () => {
  it('ships every file the exports map and main point at', () => {
    const packed = new Set(packedFiles())
    const missing = declaredTargets().filter(target => !packed.has(target))

    expect(missing, `exports/main target(s) not in the tarball: ${missing.join(', ')}`).toEqual([])
  })

  // Guards the check itself: a manifest with no targets would make the assertion above vacuous.
  it('has targets to check', () => {
    expect(declaredTargets().length).toBeGreaterThan(3)
  })

  it('does not advertise a require condition it cannot serve', () => {
    // The package publishes TypeScript source, so a CJS `require` cannot load any of it. A
    // `require` condition here would either point outside `files` or at a `.ts` file.
    const conditions = Object.values(manifest.exports ?? {}).flatMap(entry =>
      typeof entry === 'string' ? [] : Object.keys(entry),
    )

    expect(conditions).not.toContain('require')
  })

  it('builds nothing it does not publish', () => {
    // `tsup --format cjs` was the only producer of dist/client.cjs, and dist is not shipped.
    expect(manifest.scripts?.build ?? '').not.toContain('format cjs')
    expect(existsSync(path.join(packageRoot, 'package.json'))).toBe(true)
  })
})
