import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The userland `original-fs` package must stay uninstalled (#595).
 *
 * `attestation.ts` reads build artifacts through `require('original-fs')` inside a try/catch,
 * falling back to `node:fs`. That is deliberate: inside Electron the builtin `original-fs` reads
 * the raw bytes on disk, bypassing the ASAR layer, which is the whole point of hashing them.
 *
 * The npm package of that name is one line — `module.exports = require('fs')`. With it installed
 * the require can never throw, so outside Electron the catch never fires and the attestation
 * hashes bytes read *through* ASAR while reporting success. The integrity check compares the wrong
 * bytes and nothing surfaces it.
 *
 * The fix is the absence of a package, which is exactly the kind of thing a later `pnpm add` or a
 * transitive dependency undoes silently — hence a check rather than a comment. It lives here
 * rather than in core-app because the lockfile is repo-wide and `ci / CI - utils` blocks merges,
 * while the core-app suite runs under `continue-on-error`.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const LOCKFILE = path.join(REPO_ROOT, 'pnpm-lock.yaml')

describe('original-fs shim', () => {
  it('reads the lockfile', () => {
    // Positive control: both assertions below are absence checks, which an unread file passes.
    const contents = readFileSync(LOCKFILE, 'utf8')

    expect(contents).toContain('lockfileVersion')
    // A package that IS installed, proving the match would find one if present.
    expect(contents).toMatch(/^ {2}fs-extra@/m)
  })

  it('is not installed anywhere in the workspace', () => {
    const contents = readFileSync(LOCKFILE, 'utf8')

    expect(contents).not.toMatch(/^ {2}original-fs@/m)
    expect(contents).not.toMatch(/^\s+original-fs:\s/m)
  })

  it('is not declared by any workspace manifest', () => {
    // The lockfile check above would catch this too, but only after an install. This catches a
    // manifest edit on its own.
    const manifests = ['apps/core-app/package.json', 'package.json']
    for (const manifest of manifests) {
      const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, manifest), 'utf8'))
      const declared = { ...pkg.dependencies, ...pkg.devDependencies }
      expect(Object.keys(declared), manifest).not.toContain('original-fs')
    }
  })
})
