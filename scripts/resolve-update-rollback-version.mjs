#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  compareRollbackVersions,
  inferManifestChannel,
} from './lib/update-rollback-contract.mjs'

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
  if (!previous)
    throw new Error(`No same-channel predecessor exists for ${tag}`)

  return {
    channel,
    rollbackFromVersion: previous.version,
    rollbackTag: previous.tag,
    targetVersion,
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

function main() {
  const argv = process.argv.slice(2)
  const tag = getArgValue(argv, '--tag')
  const remote = getArgValue(argv, '--remote', 'origin')
  if (!tag || !remote) {
    throw new Error(
      'Usage: node scripts/resolve-update-rollback-version.mjs --tag <tag> [--remote <remote>]',
    )
  }

  console.log(
    JSON.stringify(
      resolveSameChannelRollbackVersion({ tag, tags: getRemoteTags(remote) }),
    ),
  )
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
