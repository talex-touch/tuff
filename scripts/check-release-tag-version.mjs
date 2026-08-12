#!/usr/bin/env node
/**
 * Asserts the pushed tag and the version being built are the same release.
 *
 * The two halves of a release come from different places and nothing reconciled them (#550):
 *
 *   - the manifest, the GitHub release name and the rollback contract derive from the git tag
 *   - every artifact filename and latest.yml derive from apps/core-app/package.json
 *
 * So tagging v2.5.0 while the manifest still says 2.4.14-beta.2 produced a release *labelled*
 * v2.5.0 that *shipped* 2.4.14-beta.2 binaries, with a rollback contract describing a version
 * that was never built. The existing Windows assertion does not catch it — it compares the
 * installer to package.json, and both agree; it is the tag neither of them is checked against.
 *
 * Runs before the platform builds, so a mismatch costs seconds rather than three builds.
 *
 * Read-only. `--self-test` proves the detector fires.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = path.join('apps', 'core-app', 'package.json')

/** A release tag. Anything else is a branch build with no tag to reconcile. */
const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:[-.].+)?)$/

export function checkTagVersion(ref, manifestVersion) {
  const match = RELEASE_TAG.exec(String(ref ?? '').trim())
  if (!match)
    return { skipped: true, reason: `ref "${ref}" is not a release tag` }

  const tagVersion = match[1]
  if (tagVersion === manifestVersion)
    return { ok: true, tagVersion, manifestVersion }

  return { ok: false, tagVersion, manifestVersion }
}

function readManifestVersion(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, MANIFEST), 'utf8')).version
}

function getArg(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function selfTest() {
  const cases = [
    { name: 'a tag matching the manifest passes', ref: 'v2.4.14-beta.2', version: '2.4.14-beta.2', expect: 'ok' },
    { name: 'a tag ahead of the manifest fails', ref: 'v2.5.0', version: '2.4.14-beta.2', expect: 'fail' },
    { name: 'a tag behind the manifest fails', ref: 'v2.4.13', version: '2.4.14-beta.2', expect: 'fail' },
    { name: 'a prerelease suffix mismatch fails', ref: 'v2.4.14-beta.3', version: '2.4.14-beta.2', expect: 'fail' },
    // A dispatch build runs off a branch. There is no tag to reconcile, and failing there
    // would block every manual build rather than catching a mislabelled release.
    { name: 'a branch ref is skipped, not failed', ref: 'TalexDreamSoul/app-shell-v2', version: '2.4.14-beta.2', expect: 'skip' },
    { name: 'an empty ref is skipped', ref: '', version: '2.4.14-beta.2', expect: 'skip' },
    { name: 'a tag without the v prefix is not treated as a release tag', ref: '2.5.0', version: '2.4.14-beta.2', expect: 'skip' },
  ]

  let failures = 0
  for (const testCase of cases) {
    const result = checkTagVersion(testCase.ref, testCase.version)
    const actual = result.skipped ? 'skip' : result.ok ? 'ok' : 'fail'
    const passed = actual === testCase.expect
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!passed) {
      failures += 1
      console.log(`     expected ${testCase.expect}, got ${actual}: ${JSON.stringify(result)}`)
    }
  }

  // The repository as it stands must be self-consistent for a tag of its own version.
  const version = readManifestVersion()
  const real = checkTagVersion(`v${version}`, version)
  console.log(`${real.ok ? 'ok  ' : 'FAIL'} a tag of the current manifest version (v${version}) passes`)
  if (!real.ok)
    failures += 1

  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

const ref = getArg('--tag') ?? process.env.GITHUB_REF_NAME ?? ''
const manifestVersion = readManifestVersion()
const result = checkTagVersion(ref, manifestVersion)

if (result.skipped) {
  console.log(`[release-tag-version] skipped: ${result.reason}`)
  process.exit(0)
}

if (!result.ok) {
  console.error(
    `[release-tag-version] the tag and the build disagree about which release this is:\n`
    + `\n    tag                       v${result.tagVersion}`
    + `\n    apps/core-app/package.json ${result.manifestVersion}\n`
    + `\nEvery artifact filename and latest.yml come from the manifest; the release manifest,`
    + `\nthe GitHub release name and the rollback contract come from the tag. Publishing with`
    + `\nthese different ships ${result.manifestVersion} binaries under a v${result.tagVersion} label.`
    + `\n\nRun \`pnpm version\` to move the manifests, or retag at ${result.manifestVersion}.`,
  )
  process.exit(1)
}

console.log(`[release-tag-version] tag v${result.tagVersion} matches apps/core-app/package.json`)
