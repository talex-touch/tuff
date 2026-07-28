import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { checkNotes, runLocalReleaseGateChecks } from './local-checks.mjs'

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

  it('enforces bilingual files only after the configured channel baseline', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-release-notes-gate-'))
    try {
      writeContractConfig(tempRoot)
      const checks = []
      const pushCheck = (name, status, detail, meta = {}) => {
        checks.push({ name, status, detail, ...meta })
      }

      checkNotes({ repoRoot: tempRoot, version: '2.4.13-beta.23', pushCheck })
      checkNotes({ repoRoot: tempRoot, version: '2.4.13-snapshot.1', pushCheck })
      checkNotes({ repoRoot: tempRoot, version: '2.4.13-beta.24', pushCheck })

      assert.deepEqual(checks.map(check => [check.status, check.enforced]), [
        ['pass', false],
        ['pass', false],
        ['fail', true],
      ])
    }
    finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects a shared fallback and accepts a valid bilingual pair', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-release-notes-pair-'))
    try {
      writeContractConfig(tempRoot)
      const notesDir = path.join(tempRoot, 'notes')
      const version = '2.4.13-beta.24'
      const sharedPath = path.join(notesDir, `update_${version}.md`)
      fs.writeFileSync(sharedPath, '# Shared fallback\n', 'utf8')

      const failedChecks = []
      checkNotes({
        repoRoot: tempRoot,
        version,
        pushCheck: (name, status, detail, meta = {}) => {
          failedChecks.push({ name, status, detail, ...meta })
        },
      })
      assert.equal(failedChecks[0]?.status, 'fail')

      fs.writeFileSync(path.join(notesDir, `update_${version}.zh.md`), validZh(version), 'utf8')
      fs.writeFileSync(path.join(notesDir, `update_${version}.en.md`), validEn(version), 'utf8')

      const passedChecks = []
      checkNotes({
        repoRoot: tempRoot,
        version,
        pushCheck: (name, status, detail, meta = {}) => {
          passedChecks.push({ name, status, detail, ...meta })
        },
      })
      assert.equal(passedChecks[0]?.status, 'pass')
      assert.equal(passedChecks[0]?.enforced, true)
    }
    finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

function writeContractConfig(repo) {
  const notesDir = path.join(repo, 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(
    path.join(notesDir, 'release-notes.config.json'),
    JSON.stringify({
      schemaVersion: 1,
      legacyThrough: {
        RELEASE: '2.4.13',
        BETA: '2.4.13-beta.23',
      },
    }),
    'utf8',
  )
}

function validZh(version) {
  return `# Tuff v${version} 更新说明\n\n## 摘要\n\n- 摘要一\n- 摘要二\n- 摘要三\n\n## 变更内容\n\n- 修复更新说明门禁。\n`
}

function validEn(version) {
  return `# Tuff v${version} Release Notes\n\n## Summary Notes\n\n- Summary one\n- Summary two\n- Summary three\n\n## What's Changed\n\n- Fix the release notes gateway.\n`
}
