import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(scriptsDir)
const scriptPath = path.join(scriptsDir, 'update-validate-release-manifest.mjs')
const sampleManifestPath = path.join(
  repoRoot,
  'docs/plan-prd/03-features/download-update/fixtures/tuff-release-manifest.sample.json'
)

function runValidator(manifestPath) {
  return execFileSync('node', [scriptPath, '--manifest', manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function writeManifest(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-release-manifest-'))
  const manifestPath = path.join(dir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2))
  return manifestPath
}

describe('update release manifest validator', () => {
  it('accepts the documented sample manifest', () => {
    const output = runValidator(sampleManifestPath)

    assert.match(output, /Validation passed/)
  })

  it('rejects release metadata drift and duplicated asset names', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'RELEASE',
        tag: 'v2.4.12-beta.7',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'a'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'b'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /release\.tag must match release\.version/)
        assert.match(output, /release\.channel must match release\.version suffix/)
        assert.match(output, /artifacts\[1\]\.name must be unique/)
        return true
      }
    )
  })

  it('rejects duplicated artifact sha256 values', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'a'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
        {
          component: 'renderer',
          name: 'tuff-renderer-2.4.12-beta.8.zip',
          sha256: 'a'.repeat(64).toUpperCase(),
          coreRange: '>=2.4.0',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /artifacts\[1\]\.sha256 must be unique/)
        return true
      }
    )
  })

  it('rejects platform metadata that disagrees with the asset filename', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
          platform: 'linux',
          arch: 'x64',
          sha256: 'c'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /artifacts\[0\]\.platform does not match artifact name/)
        assert.match(output, /artifacts\[0\]\.arch does not match artifact name/)
        return true
      }
    )
  })

  it('rejects duplicated core platform and arch matrix entries', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'a'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
        {
          component: 'core',
          name: 'windows-latest-beta-tuff-2.4.12-beta.8.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'b'.repeat(64),
          signature: 'windows-latest-beta-tuff-2.4.12-beta.8.exe.sig',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /artifacts\[1\]\.platform\/arch must be unique for core artifacts/)
        return true
      }
    )
  })

  it('rejects metadata assets inside the downloadable artifact list', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-release-manifest.json',
          platform: 'win32',
          arch: 'x64',
          sha256: 'd'.repeat(64),
          signature: 'tuff-release-manifest.json.sig',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /must be a downloadable artifact, not release metadata/)
        return true
      }
    )
  })

  it('rejects core artifacts without a matching signature sidecar', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'e'.repeat(64),
        },
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
          platform: 'darwin',
          arch: 'arm64',
          sha256: 'f'.repeat(64),
          signature: 'wrong-file.sig',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /artifacts\[0\]\.signature is required for core artifacts/)
        assert.match(
          output,
          /artifacts\[1\]\.signature must point to the artifact \.sig\/\.asc sidecar/
        )
        return true
      }
    )
  })

  it('rejects signature sidecars listed as downloadable artifacts', () => {
    const manifestPath = writeManifest({
      schemaVersion: 1,
      release: {
        version: '2.4.12-beta.8',
        channel: 'BETA',
        tag: 'v2.4.12-beta.8',
      },
      artifacts: [
        {
          component: 'core',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          platform: 'win32',
          arch: 'x64',
          sha256: 'a'.repeat(64),
          signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
        {
          component: 'renderer',
          name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
          sha256: 'b'.repeat(64),
          coreRange: '>=2.4.0',
        },
      ],
    })

    assert.throws(
      () => runValidator(manifestPath),
      (error) => {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
        assert.match(output, /signature sidecar must not be listed as a downloadable artifact/)
        assert.match(output, /must be a downloadable artifact, not release metadata/)
        return true
      }
    )
  })
})
