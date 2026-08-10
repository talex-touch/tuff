import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsDir, '..')
const validatorPath = path.join(scriptsDir, 'validate-plugins.mjs')
const registryPath = path.join(repoRoot, 'packages/utils/permission/registry.ts')

/**
 * KNOWN_PERMISSION_IDS is a hand-copied snapshot of the permission registry. It had drifted
 * to 22 entries against a registry of 27, and unknown ids were reported with logWarn — which
 * does not affect the exit code, so a manifest requesting an undefined permission passed CI
 * silently (#735).
 *
 * Copying it again would just restart the clock. This fails the moment the two disagree.
 */

function hardcodedIds() {
  const source = fs.readFileSync(validatorPath, 'utf8')
  const block = source.match(/KNOWN_PERMISSION_IDS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(block, 'KNOWN_PERMISSION_IDS block not found — this test needs updating')
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]))
}

function registryIds() {
  // Double quotes in registry.ts, single quotes in the validator. Matching only one of them
  // reported an empty registry and a drift of 22, which is how this test came to check both.
  const source = fs.readFileSync(registryPath, 'utf8')
  return new Set(
    [...source.matchAll(/id:\s*['"]([\w.-]+)['"]/gi)].map(entry => entry[1]),
  )
}

describe('plugin permission validator', () => {
  it('reads a non-empty registry, so the comparison below is not vacuous', () => {
    // Control. If the registry regex ever stops matching, every assertion here would pass
    // against an empty set.
    assert.ok(registryIds().size > 20, 'expected the registry to define many permissions')
  })

  it('knows every permission the registry defines', () => {
    const known = hardcodedIds()
    const missing = [...registryIds()].filter(id => !known.has(id))

    assert.deepEqual(missing, [], `validator is missing registry permissions: ${missing}`)
  })

  it('does not invent permissions the registry has never defined', () => {
    const registry = registryIds()
    const invented = [...hardcodedIds()].filter(id => !registry.has(id))

    assert.deepEqual(invented, [], `validator lists unknown permissions: ${invented}`)
  })

  it('fails the run on an unknown permission id rather than warning', () => {
    // A warning leaves the exit code at 0, which is how this went unnoticed.
    const source = fs.readFileSync(validatorPath, 'utf8')
    const site = source.match(/if \(unknownIds\.length > 0\) \{[\s\S]*?\}/)

    assert.ok(site, 'unknown-permission branch not found')
    assert.match(site[0], /logError\(/)
    assert.doesNotMatch(site[0], /logWarn\(/)
  })
})
