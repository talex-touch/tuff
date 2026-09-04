import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

import {
  compareRollbackVersions,
  validateRollbackContract,
} from './lib/update-rollback-contract.mjs'
import {
  FIRST_RELEASE_ROLLBACK_VERSION,
  resolveSameChannelRollbackVersion,
} from './resolve-update-rollback-version.mjs'

const scriptPath = fileURLToPath(new URL('./resolve-update-rollback-version.mjs', import.meta.url))

function withTempDir(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'resolve-update-rollback-version-'))
  try {
    return run(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function runResolver(args, env = process.env) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env,
  })
}

describe('resolveSameChannelRollbackVersion', () => {
  it('selects the highest lower same-channel version from unsorted tags when the current tag is absent', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.13',
      tags: ['v2.4.11', 'v2.4.12-beta.9', 'v2.4.10', 'v2.4.12'],
    })

    assert.deepEqual(result, {
      channel: 'RELEASE',
      rollbackFromVersion: '2.4.12',
      rollbackTag: 'v2.4.12',
      targetVersion: '2.4.13',
      isFirstInChannel: false,
    })
  })

  it('selects the immediately preceding beta sequence for the same patch', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.12-beta.11',
      tags: [
        'v2.4.12-alpha.12',
        'v2.4.12-beta.2',
        'v2.4.12-beta.10',
        'v2.4.11-beta.99',
      ],
    })

    assert.equal(result.rollbackFromVersion, '2.4.12-beta.10')
    assert.equal(result.rollbackTag, 'v2.4.12-beta.10')
  })

  it('normalizes preview aliases into the BETA rollback channel', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.12-snapshot.3',
      tags: ['v2.4.12-alpha.2', 'v2.4.11', 'v2.4.12'],
    })

    assert.equal(result.channel, 'BETA')
    assert.equal(result.rollbackFromVersion, '2.4.12-alpha.2')
  })

  it('never selects a cross-channel or newer rollback target', () => {
    // Same guard as before; it no longer throws, because "nothing older in this channel" is
    // exactly the first-release case (#559). What must not happen is picking one of these.
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.12-beta.1',
      tags: ['v2.4.12', 'v2.4.12-beta.2', 'v2.4.11'],
    })

    assert.equal(result.rollbackFromVersion, FIRST_RELEASE_ROLLBACK_VERSION.BETA)
    assert.equal(result.rollbackTag, null)
    for (const wrong of ['2.4.12', '2.4.12-beta.2', '2.4.11'])
      assert.notEqual(result.rollbackFromVersion, wrong)
  })

  it('resolves a channel first release instead of failing the whole publish', () => {
    // The throw landed in the release job, after all three platform builds had finished.
    for (const [tag, channel] of [
      ['v2.5.0', 'RELEASE'],
      ['v2.5.0-beta.1', 'BETA'],
      ['v2.5.0-snapshot.20260811', 'BETA'],
    ]) {
      const result = resolveSameChannelRollbackVersion({ tag, tags: [] })

      assert.equal(result.channel, channel)
      assert.equal(result.rollbackFromVersion, FIRST_RELEASE_ROLLBACK_VERSION[channel])
      assert.equal(result.isFirstInChannel, true)
      assert.equal(result.rollbackTag, null)
    }
  })

  it('produces a sentinel the release contract accepts', () => {
    // The reason absence is not an option: prepare-release-assets requires the field, and so
    // does every already-shipped client. This has to pass the same validator a real
    // predecessor does, or the fix just moves the failure one step later.
    for (const [version, channel] of [
      ['2.5.0', 'RELEASE'],
      ['2.5.0-beta.1', 'BETA'],
    ]) {
      const issues = validateRollbackContract({
        version,
        channel,
        rollbackFromVersion: FIRST_RELEASE_ROLLBACK_VERSION[channel],
        rollbackCompatible: false,
        expectedRollbackFromVersion: FIRST_RELEASE_ROLLBACK_VERSION[channel],
      })

      assert.deepEqual(issues, [], `${channel}: ${JSON.stringify(issues)}`)
    }
  })

  it('is strictly older than anything that could be installed', () => {
    // What makes the sentinel safe rather than a lie. The client marks an update
    // rollback-compatible only when the manifest's target equals the version the user is
    // running, so a target older than every real version can never advertise a downgrade.
    for (const real of ['0.0.1', '1.0.0', '2.4.9', '2.5.0']) {
      assert.equal(compareRollbackVersions(FIRST_RELEASE_ROLLBACK_VERSION.RELEASE, real), -1, real)
    }
    for (const real of ['0.0.1-beta.1', '2.4.9-beta.7', '2.5.0-beta.1']) {
      assert.equal(compareRollbackVersions(FIRST_RELEASE_ROLLBACK_VERSION.BETA, real), -1, real)
    }
  })

  it('still refuses a tag with no usable version', () => {
    // Being total about missing predecessors must not make it total about garbage input.
    assert.throws(
      () => resolveSameChannelRollbackVersion({ tag: 'manual-build-20260811', tags: [] }),
      /must contain a supported semantic version/,
    )
  })
})

function fakeGitPath(root, tags) {
  const bin = path.join(root, 'bin')
  const git = path.join(bin, 'git')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    git,
    ['#!/bin/sh', ...tags.map(tag => `printf '%s\n' '0000000 refs/tags/${tag}'`)].join('\n'),
  )
  chmodSync(git, 0o755)
  return bin
}

describe('resolve-update-rollback-version CLI', () => {
  it('uses published tags rather than a higher unpublished beta returned by the remote', () => {
    withTempDir((root) => {
      const tagsFile = path.join(root, 'published-tags.txt')
      writeFileSync(
        tagsFile,
        ['v2.4.12-beta.8', 'v2.4.13-beta.1', 'v2.4.13-beta.10'].join('\n'),
      )
      const gitBin = fakeGitPath(root, ['v2.4.13-beta.99'])

      const result = runResolver(
        [
          '--tag',
          'v2.4.13-beta.11',
          '--tags-file',
          tagsFile,
          '--remote',
          'origin',
        ],
        { ...process.env, PATH: `${gitBin}${path.delimiter}${process.env.PATH}` },
      )

      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(JSON.parse(result.stdout), {
        channel: 'BETA',
        rollbackFromVersion: '2.4.13-beta.10',
        rollbackTag: 'v2.4.13-beta.10',
        targetVersion: '2.4.13-beta.11',
        isFirstInChannel: false,
      })
    })
  })

  it('fails clearly when its published-tags file cannot be read', () => {
    withTempDir((root) => {
      const gitBin = fakeGitPath(root, ['v2.4.13-beta.99'])
      const missingTagsFile = path.join(root, 'does-not-exist.txt')

      const result = runResolver(
        [
          '--tag',
          'v2.4.13-beta.11',
          '--tags-file',
          missingTagsFile,
          '--remote',
          'origin',
        ],
        { ...process.env, PATH: `${gitBin}${path.delimiter}${process.env.PATH}` },
      )

      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /--tags-file|tags file/i)
    })
  })
})
