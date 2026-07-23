import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { runLocalReleaseGateChecks } from './local-checks.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

describe('check-release-gates local checks', () => {
  it('validates packed publish manifests as part of the local release gate', () => {
    const checks = []

    runLocalReleaseGateChecks({
      repoRoot,
      version: '2.4.12-beta.8',
      stage: 'gate-d',
      pushCheck: (name, status, detail, meta = {}) => {
        checks.push({ name, status, detail, ...meta })
      },
    })

    const sourceCheck = checks.find(
      item => item.name === 'publish-manifests',
    )
    const packCheck = checks.find(
      item => item.name === 'publish-manifests-pack',
    )

    assert.equal(sourceCheck?.status, 'pass')
    assert.equal(packCheck?.status, 'pass')
    assert.match(packCheck?.output ?? '', /Validation passed \(source\+pack\)/)
  })

  it('skips workspace notes at gate-e but keeps them mandatory at gate-d', () => {
    const version = '9.9.9-notes-contract'
    const gateEChecks = []
    const gateDChecks = []

    runLocalReleaseGateChecks({
      repoRoot,
      version,
      stage: 'gate-e',
      pushCheck: (name, status, detail, meta = {}) => {
        gateEChecks.push({ name, status, detail, ...meta })
      },
    })
    runLocalReleaseGateChecks({
      repoRoot,
      version,
      stage: 'gate-d',
      pushCheck: (name, status, detail, meta = {}) => {
        gateDChecks.push({ name, status, detail, ...meta })
      },
    })

    assert.equal(
      gateEChecks.some(item => item.name === 'notes'),
      false,
    )
    assert.equal(
      gateDChecks.find(item => item.name === 'notes')?.status,
      'fail',
    )
  })
})
