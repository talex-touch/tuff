import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { REGISTRY_MANIFEST_FIELDS, verifyRegistryManifest } from './publish-package.mjs'

const pkg = { name: '@talex-touch/utils' }

describe('verifyRegistryManifest', () => {
  it('accepts a registry manifest with fully resolved specifiers', () => {
    const readField = () => '{"marked":"^17.0.6","gsap":"^3.15.0"}'

    assert.doesNotThrow(() => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }))
  })

  it('rejects a forbidden protocol that reached the registry', () => {
    const readField = (_name, _version, field) =>
      field === 'dependencies' ? '{"gsap":"catalog:"}' : '{}'

    assert.throws(
      () => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }),
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
      () => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }),
      /Could not read the published manifest .* 429 Too Many Requests/s,
    )
  })

  it('retries a field that is not queryable yet, rather than failing the release', () => {
    // tuffex@0.4.0 published correctly and then failed this check seconds later
    // with `404 No match found for version 0.4.0` — the registry had not caught
    // up. A good release should not go red for that.
    let calls = 0
    const readField = () => {
      calls += 1
      if (calls < 3)
        throw new Error('npm ERR! 404 No match found for version 0.4.0')
      return '{"marked":"^17.0.6"}'
    }

    assert.doesNotThrow(() =>
      verifyRegistryManifest(pkg, '0.4.0', readField, { sleep: () => {} }))
    assert.ok(calls >= 3, 'expected the read to be retried')
  })

  it('refuses a non-positive attempt count instead of passing without reading', () => {
    // With attempts <= 0 the loop never runs, so nothing is read and the
    // forbidden-protocol regex would test `undefined` and find it clean.
    let calls = 0
    const readField = () => {
      calls += 1
      return '{"gsap":"catalog:"}'
    }

    for (const attempts of [0, -1, 1.5, Number.NaN]) {
      assert.throws(
        () => verifyRegistryManifest(pkg, '1.0.51', readField, { attempts, sleep: () => {} }),
        /attempts must be a positive integer/,
      )
    }
    assert.equal(calls, 0)
  })

  it('still fails when the manifest never becomes readable', () => {
    let calls = 0
    const readField = () => {
      calls += 1
      throw new Error('npm ERR! 429 Too Many Requests')
    }

    assert.throws(
      () => verifyRegistryManifest(pkg, '1.0.51', readField, { attempts: 3, sleep: () => {} }),
      /after 3 attempt\(s\).*429 Too Many Requests/s,
    )
    assert.equal(calls, 3)
  })

  it('fails on the first unreadable field rather than continuing through the rest', () => {
    const seen = []
    const readField = (_name, _version, field) => {
      seen.push(field)
      throw new Error('ENOTFOUND registry.npmjs.org')
    }

    assert.throws(() => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }))
    // The claim is that it never reaches the later fields, not that it reads the
    // first one exactly once — an unreadable field is retried for propagation.
    assert.deepEqual([...new Set(seen)], [REGISTRY_MANIFEST_FIELDS[0]])
  })

  it('checks every declared field when they are all readable', () => {
    const seen = []
    const readField = (_name, _version, field) => {
      seen.push(field)
      return '{}'
    }

    verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} })
    assert.deepEqual(seen, REGISTRY_MANIFEST_FIELDS)
  })

  it('treats an absent field as clean, since npm prints nothing for one', () => {
    // `npm view <pkg> peerDependencies --json` exits 0 with empty output when the field is
    // absent. That is genuinely clean and must stay distinguishable from a failed call.
    const readField = () => ''

    assert.doesNotThrow(() => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }))
  })

  it('catches each forbidden protocol, not just catalog:', () => {
    for (const spec of ['workspace:^1.0.0', 'file:../utils', 'link:../utils']) {
      const readField = () => `{"dep":"${spec}"}`
      assert.throws(
        () => verifyRegistryManifest(pkg, '1.0.51', readField, { sleep: () => {} }),
        /forbidden protocol/,
        `expected ${spec} to be rejected`,
      )
    }
  })
})
