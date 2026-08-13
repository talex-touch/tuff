import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

/**
 * `plugins:validate` must fail a plugin that ships with its dev loader on (#812).
 *
 * AGENTS.md cites this script as the manifest gate, and it never looked at the `dev` block — three
 * manifests shipped `dev.enable: true` while it reported *24/24 plugins passed*. The gate could not
 * catch the exact class of defect it is cited for.
 *
 * The check has to cover both places the block lives: `manifest.json` for most plugins, and
 * `package.json` under `talex-touch.plugin.dev` for package-backed ones. The second is where it was
 * still hiding when this was written — in `touch-image`, a directory the manifest check skips
 * entirely as "Surface-only", so a manifest-only check would have reported green.
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

/** A minimal plugin directory the validator accepts, plus whatever the caller wants to break. */
function makePlugin(root, name, { manifest, packageJson }) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `@talex-touch/${name}-plugin`, version: '1.0.0', ...packageJson }),
  )
  if (manifest)
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  return dir
}

const baseManifest = { id: 'com.tuff.fixture', name: 'fixture', version: '1.0.0' }

describe('plugins:validate dev leakage', () => {
  it('passes a plugin with no dev block', () => {
    // Positive control. Every failure assertion below is satisfied by a validator that rejects
    // everything, which would be a worse gate than none.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugins-clean-'))
    makePlugin(root, 'fixture', { manifest: baseManifest })

    assert.equal(runValidator(root).ok, true)
  })

  it('fails a manifest that ships dev.enable: true', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugins-manifest-'))
    makePlugin(root, 'fixture', {
      manifest: { ...baseManifest, dev: { enable: true, address: 'http://127.0.0.1:6001' } },
    })

    const result = runValidator(root)
    assert.equal(result.ok, false)
    assert.match(result.stdout, /manifest\.json ships dev\.enable: true/)
  })

  it('fails a package.json that ships dev.enable: true, with no manifest at all', () => {
    // The case the real tree was in. `touch-image` has no manifest.json, so the manifest checks
    // skip it as "Surface-only" — a check that only read manifests would have reported green while
    // the dev block sat in package.json.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugins-package-'))
    makePlugin(root, 'fixture', {
      packageJson: {
        'talex-touch': { plugin: { dev: { enable: true, address: 'http://127.0.0.1:6001' } } },
      },
    })

    const result = runValidator(root)
    assert.equal(result.ok, false)
    assert.match(result.stdout, /package\.json ships dev\.enable: true/)
  })

  it('tolerates a dev block that is present but switched off', () => {
    // `dev.enable: false` with an address is how a developer keeps their local address on hand.
    // Failing that would push people to delete the block and retype it, which is worse.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugins-off-'))
    makePlugin(root, 'fixture', {
      manifest: { ...baseManifest, dev: { enable: false, address: 'http://127.0.0.1:6001' } },
    })

    assert.equal(runValidator(root).ok, true)
  })
})
