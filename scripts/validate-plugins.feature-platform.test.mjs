import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

/**
 * `plugins:validate` must pin a manifest feature's `platform` shape (#820).
 *
 * Two shapes exist and they are easy to confuse:
 *
 * - **manifest** — `{ win32, darwin, linux }` booleans. All 20 manifests use it.
 * - **runtime registration** — `{ win|darwin|linux: { enable, arch, os } }`, the `IPlatform` type,
 *   which the host validates with `exactRecord` when a Prelude calls `features.addFeature`.
 *
 * `touch-browser-open` writes both, one per file, so holding them side by side is not enough to
 * keep them apart. Nothing validated the manifest one, and nothing in the main process reads it —
 * so a plugin author who wrote the runtime shape into a manifest got silence either way.
 *
 * This pins the shape only. Whether a manifest `platform` should *gate* feature registration is a
 * behaviour change affecting five shipped features, and is still open on #820.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VALIDATOR = path.join(REPO_ROOT, 'scripts/validate-plugins.mjs')

function runValidator(pluginsDir) {
  try {
    const stdout = execFileSync('node', [VALIDATOR], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, TUFF_PLUGINS_DIR: pluginsDir },
    })
    return { ok: true, stdout }
  }
  catch (error) {
    return { ok: false, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

function makePlugin(root, platform) {
  const dir = path.join(root, 'fixture')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: '@talex-touch/fixture-plugin', version: '1.0.0' }),
  )
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    id: 'com.tuff.fixture',
    name: 'fixture',
    version: '1.0.0',
    features: [{
      id: 'fixture-feature',
      name: 'Fixture',
      commands: [{ type: 'over', value: ['fixture'] }],
      ...(platform === undefined ? {} : { platform }),
    }],
  }))
  return root
}

function withFixture(platform) {
  return runValidator(makePlugin(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-platform-')), platform))
}

describe('plugins:validate feature platform shape', () => {
  it('accepts the manifest shape', () => {
    // Positive control. Every failure assertion below is satisfied by a validator that rejects
    // everything, which would be a worse gate than none.
    assert.equal(withFixture({ win32: true, darwin: true, linux: false }).ok, true)
  })

  it('accepts a feature with no platform at all', () => {
    // 25 of the 30 shipped features declare nothing. Requiring it would fail the whole tree.
    assert.equal(withFixture(undefined).ok, true)
  })

  it('rejects the runtime addFeature shape, which a manifest is not read as', () => {
    const result = withFixture({
      win: { enable: true, arch: [], os: [] },
      darwin: { enable: true, arch: [], os: [] },
      linux: { enable: false, arch: [], os: [] },
    })

    assert.equal(result.ok, false)
    assert.match(result.stdout, /runtime addFeature shape/)
  })

  it('rejects a missing platform key', () => {
    const result = withFixture({ win32: true, darwin: true })

    assert.equal(result.ok, false)
    assert.match(result.stdout, /needs exactly/)
  })

  it('rejects a non-boolean value', () => {
    // The shape that reads as correct at a glance and is not.
    const result = withFixture({ win32: 'yes', darwin: true, linux: false })

    assert.equal(result.ok, false)
    assert.match(result.stdout, /platform\.win32 must be a boolean/)
  })

  it('rejects a platform that is not an object', () => {
    const result = withFixture('win32')

    assert.equal(result.ok, false)
    assert.match(result.stdout, /non-object "platform"/)
  })
})
