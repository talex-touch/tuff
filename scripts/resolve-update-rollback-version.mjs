#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  compareRollbackVersions,
  inferManifestChannel,
} from './lib/update-rollback-contract.mjs'

/**
 * What a channel's first release names as its rollback target.
 *
 * "No predecessor" cannot be represented as an absent field: `prepare-release-assets.mjs`
 * requires `--rollback-from-version`, `validateRollbackContract` requires a non-empty
 * same-channel semver strictly older than the release, and — the one that decides it —
 * `validateUpdateReleaseManifest` in every *already shipped* client rejects a manifest whose
 * `rollbackFromVersion` is not a string. Making the field optional would mean the first
 * release in a channel produced a manifest installed clients refuse, so they would never
 * see the update at all.
 *
 * A channel-matched zero is the only shape the whole chain accepts, and it cannot mislead
 * anyone: the client sets `rollbackCompatible` only when the manifest's rollback target
 * equals the version the user is *currently running* (`update-system.ts`), and nobody is
 * running 0.0.0. So a first release advertises no downgrade path rather than a false one.
 */
export const FIRST_RELEASE_ROLLBACK_VERSION = {
  RELEASE: '0.0.0',
  BETA: '0.0.0-beta.0',
}

function versionFromTag(tag) {
  return String(tag ?? '')
    .trim()
    .replace(/^v/i, '')
}

export function resolveSameChannelRollbackVersion({ tag, tags }) {
  const targetVersion = versionFromTag(tag)
  const channel = inferManifestChannel(targetVersion)
  if (!channel) {
    throw new Error(
      `Release tag must contain a supported semantic version: ${tag}`,
    )
  }

  const candidates = [...new Set(tags)]
    .map((candidateTag) => {
      const version = versionFromTag(candidateTag)
      return { tag: candidateTag, version }
    })
    .filter(candidate => candidate.tag !== tag)
    .filter(candidate => inferManifestChannel(candidate.version) === channel)
    .filter(
      candidate =>
        compareRollbackVersions(candidate.version, targetVersion) === -1,
    )
    .sort((left, right) => {
      const comparison = compareRollbackVersions(right.version, left.version)
      return comparison === 0 ? left.tag.localeCompare(right.tag) : comparison
    })

  const previous = candidates[0]
  if (!previous) {
    // First release in this channel. Throwing here failed the release *after* all three
    // platform builds had finished, with no way through short of editing the workflow (#559).
    return {
      channel,
      rollbackFromVersion: FIRST_RELEASE_ROLLBACK_VERSION[channel],
      rollbackTag: null,
      targetVersion,
      isFirstInChannel: true,
    }
  }

  return {
    channel,
    rollbackFromVersion: previous.version,
    rollbackTag: previous.tag,
    targetVersion,
    isFirstInChannel: false,
  }
}

export function getRemoteTags(remote) {
  const output = execFileSync(
    'git',
    ['ls-remote', '--tags', '--refs', remote],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  return output
    .split('\n')
    .map(line => line.trim().split(/\s+/)[1])
    .filter(ref => ref?.startsWith('refs/tags/'))
    .map(ref => ref.slice('refs/tags/'.length))
}

export function getTagsFromFile(tagsFile) {
  try {
    return readFileSync(tagsFile, 'utf8')
      .split('\n')
      .map(tag => tag.trim())
      .filter(Boolean)
  }
  catch (error) {
    throw new Error(
      `Could not read --tags-file ${tagsFile}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function main() {
  const argv = process.argv.slice(2)
  const tag = getArgValue(argv, '--tag')
  const remote = getArgValue(argv, '--remote', 'origin')
  const tagsFile = getArgValue(argv, '--tags-file')
  if (!tag || (!remote && !tagsFile)) {
    throw new Error(
      'Usage: node scripts/resolve-update-rollback-version.mjs --tag <tag> [--remote <remote>] [--tags-file <file>]',
    )
  }

  const tags = tagsFile ? getTagsFromFile(tagsFile) : getRemoteTags(remote)
  console.log(JSON.stringify(resolveSameChannelRollbackVersion({ tag, tags })))
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main()
  }
  catch (error) {
    console.error(
      `[resolve-update-rollback-version] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
