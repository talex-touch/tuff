import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'

import { brokenShims, shimTarget } from './check-bin-shims.mjs'

/**
 * The detector for a `.bin` whose shims resolve outside the checkout (#1564).
 *
 * The failure it names cost a whole commit gate and read as a corrupt install: every tool
 * failing at once with `Cannot find module` pointing at a directory that does not exist.
 * Nothing in the repository was wrong, which is why it was expensive — a clean clone cannot
 * reproduce it, and the same commit succeeds from a checkout at a different depth.
 */

function shim(target) {
  return [
    '#!/bin/sh',
    'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
    'if [ -x "$basedir/node" ]; then',
    `  exec "$basedir/node"  "$basedir/${target}" "$@"`,
    'else',
    `  exec node  "$basedir/${target}" "$@"`,
    'fi',
  ].join('\n')
}

function withBinDir(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bin-shims-'))
  try {
    return run(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('check-bin-shims', () => {
  it('resolves a shim target lexically, the way sh does', () => {
    // The whole defect lives here: `sh` does not follow symlinks when collapsing `../..`, so
    // the same relative path means different files from checkouts at different depths.
    const target = shimTarget(
      '/repo/node_modules/.bin/lint-staged',
      shim('../../../../other/node_modules/lint-staged/bin/lint-staged.js'),
    )

    assert.equal(target, '/other/node_modules/lint-staged/bin/lint-staged.js')
  })

  it('reports a shim whose target does not exist', () => {
    withBinDir((root) => {
      const bin = path.join(root, '.bin')
      const real = path.join(root, 'real.js')
      writeFileSync(real, '')
      mkdirSync(bin, { recursive: true })

      writeFileSync(path.join(bin, 'eslint'), shim('../real.js'))
      writeFileSync(path.join(bin, 'prettier'), shim('../../gone/nope.js'))

      const broken = brokenShims(bin, ['eslint', 'prettier'])

      assert.deepEqual(
        broken.map(entry => entry.name),
        ['prettier'],
      )
      assert.match(broken[0].target, /gone\/nope\.js$/)
    })
  })

  it('says nothing when every required shim resolves', () => {
    // Positive control for the case that has to stay silent: this runs on every commit, so a
    // detector that cries wolf is worse than none.
    withBinDir((root) => {
      const bin = path.join(root, '.bin')
      writeFileSync(path.join(root, 'real.js'), '')
      mkdirSync(bin, { recursive: true })
      writeFileSync(path.join(bin, 'eslint'), shim('../real.js'))

      assert.deepEqual(brokenShims(bin, ['eslint']), [])
    })
  })

  it('ignores a name that has no shim at all', () => {
    // A tool that is simply not installed is a different problem, and not this one's to guess
    // at — reporting it here would point at the wrong remedy.
    withBinDir((root) => {
      const bin = path.join(root, '.bin')
      mkdirSync(bin, { recursive: true })

      assert.deepEqual(brokenShims(bin, ['never-installed']), [])
    })
  })
})
