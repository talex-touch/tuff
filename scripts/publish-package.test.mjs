import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { REGISTRY_MANIFEST_FIELDS, verifyRegistryManifest } from './publish-package.mjs'

const pkg = { name: '@talex-touch/utils' }

describe('verifyRegistryManifest', () => {
  it('accepts a registry manifest with fully resolved specifiers', () => {
    const readField = () => '{"marked":"^17.0.6","gsap":"^3.15.0"}'

    assert.doesNotThrow(() => verifyRegistryManifest(pkg, '1.0.51', readField))
  })

  it('rejects a forbidden protocol that reached the registry', () => {
    const readField = (_name, _version, field) =>
      field === 'dependencies' ? '{"gsap":"catalog:"}' : '{}'

    assert.throws(
      () => verifyRegistryManifest(pkg, '1.0.51', readField),
      /Registry manifest still contains forbidden protocol in dependencies/,
    )
  })

  it('fails when npm view fails, instead of reporting the manifest clean', () => {
    // The regression: the old catch rethrew only its own message, so a rate limit, auth
    // failure or registry hiccup made the check pass silently (#560).
    const readField = () => {
      throw new Error('npm ERR! 429 Too Many Requests')
    }

    assert.throws(
      () => verifyRegistryManifest(pkg, '1.0.51', readField),
      /Could not read the published manifest .* 429 Too Many Requests/s,
    )
  })

  it('fails on the first unreadable field rather than continuing through the rest', () => {
    const seen = []
    const readField = (_name, _version, field) => {
      seen.push(field)
      throw new Error('ENOTFOUND registry.npmjs.org')
    }

    assert.throws(() => verifyRegistryManifest(pkg, '1.0.51', readField))
    assert.deepEqual(seen, [REGISTRY_MANIFEST_FIELDS[0]])
  })

  it('checks every declared field when they are all readable', () => {
    const seen = []
    const readField = (_name, _version, field) => {
      seen.push(field)
      return '{}'
    }

    verifyRegistryManifest(pkg, '1.0.51', readField)
    assert.deepEqual(seen, REGISTRY_MANIFEST_FIELDS)
  })

  it('treats an absent field as clean, since npm prints nothing for one', () => {
    // `npm view <pkg> peerDependencies --json` exits 0 with empty output when the field is
    // absent. That is genuinely clean and must stay distinguishable from a failed call.
    const readField = () => ''

    assert.doesNotThrow(() => verifyRegistryManifest(pkg, '1.0.51', readField))
  })

  it('catches each forbidden protocol, not just catalog:', () => {
    for (const spec of ['workspace:^1.0.0', 'file:../utils', 'link:../utils']) {
      const readField = () => `{"dep":"${spec}"}`
      assert.throws(
        () => verifyRegistryManifest(pkg, '1.0.51', readField),
        /forbidden protocol/,
        `expected ${spec} to be rejected`,
      )
    }
  })
})
