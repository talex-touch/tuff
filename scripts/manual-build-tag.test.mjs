import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { inferManifestChannel } from './lib/update-rollback-contract.mjs'

/**
 * A manual build's synthesised tag must be one the rollback resolver accepts (#727).
 *
 * `workflow_dispatch` without a `sync_tag` used to synthesise `manual-build-<timestamp>`, and the
 * next step feeds that to `resolve-update-rollback-version.mjs`, which calls
 * `inferManifestChannel` and throws on anything that is not `MAJOR.MINOR.PATCH[-label.x]`.
 *
 * The cost is the shape of it: the throw happens in the *release* job, after all three platform
 * builds have finished. A manual build burned the full matrix and then died at the last step, every
 * time, and the workflow is not one anybody runs by accident to find out.
 *
 * Two things this pins that are easy to get wrong:
 *
 * - the label decides the channel, and the accepting set is narrow — `manual`, `release` and `rc`
 *   all return `null`, which is what made the obvious fix (`-manual.<ts>`) wrong too.
 * - the **base** version has to be used. `inferManifestChannel` reads the *first* prerelease
 *   identifier, so appending to `2.4.14-beta.2` keeps resolving to BETA even for a release-type
 *   build — the channel would silently be wrong rather than the run failing.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = readFileSync(path.join(REPO_ROOT, '.github/workflows/build-and-release.yml'), 'utf8')
const VERSION = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version

/** What the workflow's shell would produce for a given release_type. */
function synthesisedTag(releaseType) {
  const base = String(VERSION).split('-')[0]
  const label = releaseType === 'snapshot' ? 'snapshot' : releaseType === 'beta' ? 'beta' : 'master'
  return `v${base}-${label}.20260805-120000`
}

describe('manual build tag', () => {
  it('is the shape the workflow actually writes', () => {
    // Positive control: every assertion below is about a string this test builds, so it is only
    // worth anything if the workflow builds the same one.
    assert.match(WORKFLOW, /BASE_VERSION=\$\(node -p "require\('\.\/package\.json'\)\.version\.split\('-'\)\[0\]"\)/)
    assert.match(WORKFLOW, /tag=v\$\{BASE_VERSION\}-\$\{CHANNEL_LABEL\}\.\$\{TIMESTAMP\}/)
    assert.match(WORKFLOW, /snapshot\) CHANNEL_LABEL=snapshot ;;/)
    assert.match(WORKFLOW, /beta\) CHANNEL_LABEL=beta ;;/)
    assert.match(WORKFLOW, /\*\) CHANNEL_LABEL=master ;;/)
  })

  it('no longer synthesises the tag that could not be resolved', () => {
    assert.doesNotMatch(WORKFLOW, /tag=manual-build-/)
  })

  it('resolves to a channel for every release_type the dispatch offers', () => {
    // The three values the workflow's own prerelease branch distinguishes.
    for (const releaseType of ['snapshot', 'beta', 'release']) {
      const tag = synthesisedTag(releaseType)
      const channel = inferManifestChannel(tag.replace(/^v/i, ''))
      assert.ok(channel, `${releaseType} -> ${tag} resolved to ${channel}`)
    }
  })

  it('puts a release-type build on RELEASE and the others on BETA', () => {
    // The half that would fail silently rather than loudly: a wrong channel still resolves, it
    // just publishes the build to the wrong update stream.
    assert.equal(inferManifestChannel(synthesisedTag('release').replace(/^v/i, '')), 'RELEASE')
    assert.equal(inferManifestChannel(synthesisedTag('beta').replace(/^v/i, '')), 'BETA')
    assert.equal(inferManifestChannel(synthesisedTag('snapshot').replace(/^v/i, '')), 'BETA')
  })

  it('would have resolved to nothing under the labels that look reasonable', () => {
    // Negative control, and the reason the base version matters. Without these the test above
    // passes against a resolver that accepts everything.
    const base = String(VERSION).split('-')[0]
    for (const label of ['manual', 'release', 'rc']) {
      assert.equal(inferManifestChannel(`${base}-${label}.20260805-120000`), null, label)
    }
    assert.equal(inferManifestChannel('manual-build-20260805-120000'), null)
    // Appending to the full version keeps the first identifier, so the channel stays BETA.
    assert.equal(inferManifestChannel(`${VERSION}-master.20260805-120000`), 'BETA')
  })
})
