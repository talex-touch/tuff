'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  EVERYTHING_INSTALL_RESOURCES,
  getEverythingInstallResources,
  resolveEverythingInstallArchitecture,
} = require('./everything-resources.js')

const supportedArchitectures = ['x64', 'x86', 'ARM64']

test('publishes immutable Everything, SDK, and CLI assets for every supported architecture', () => {
  assert.deepEqual(
    Object.keys(EVERYTHING_INSTALL_RESOURCES),
    supportedArchitectures,
  )
  assert.equal(Object.isFrozen(EVERYTHING_INSTALL_RESOURCES), true)

  for (const architecture of supportedArchitectures) {
    const resources = EVERYTHING_INSTALL_RESOURCES[architecture]

    assert.equal(Object.isFrozen(resources), true)
    assert.equal(resources.length, 3)
    assert.deepEqual(resources.map(({ type }) => type).sort(), [
      'cli',
      'everything',
      'sdk',
    ])
    assert.deepEqual(
      resources.find(({ type }) => type === 'sdk'),
      {
        type: 'sdk',
        filename: 'Everything-SDK.zip',
        url: 'https://www.voidtools.com/Everything-SDK.zip',
        sha256:
          '00693a1561d86d29a24e4691877ece7fb23e9a5d8d8cbb2435e0b8576e96f343',
      },
    )

    for (const resource of resources) {
      assert.equal(Object.isFrozen(resource), true)
      assert.equal(
        resource.url,
        `https://www.voidtools.com/${resource.filename}`,
      )
      assert.match(resource.sha256, /^[0-9a-f]{64}$/)
    }
  }
})

test('resolves native architecture with WoW64 precedence and x64 fallback', () => {
  const cases = [
    {
      name: 'WoW64 architecture takes precedence over process architecture',
      environment: {
        PROCESSOR_ARCHITEW6432: 'ARM64',
        PROCESSOR_ARCHITECTURE: 'x86',
      },
      expected: 'ARM64',
    },
    {
      name: 'x86 WoW64 architecture takes precedence over ARM64 process architecture',
      environment: {
        PROCESSOR_ARCHITEW6432: 'x86',
        PROCESSOR_ARCHITECTURE: 'ARM64',
      },
      expected: 'x86',
    },
    {
      name: 'process architecture resolves when WoW64 architecture is absent',
      environment: { PROCESSOR_ARCHITECTURE: 'ARM64' },
      expected: 'ARM64',
    },
    {
      name: 'missing architecture falls back to x64',
      environment: {},
      expected: 'x64',
    },
    {
      name: 'unknown WoW64 architecture falls back to x64 before process architecture',
      environment: {
        PROCESSOR_ARCHITEW6432: 'mips',
        PROCESSOR_ARCHITECTURE: 'ARM64',
      },
      expected: 'x64',
    },
  ]

  for (const { name, environment, expected } of cases) {
    assert.equal(
      resolveEverythingInstallArchitecture(environment),
      expected,
      name,
    )
  }
})

test('returns independent mutable resource copies', () => {
  const firstResult = getEverythingInstallResources('x86')
  firstResult[0].filename = 'tampered.zip'
  firstResult.push({ type: 'unexpected' })

  const nextResult = getEverythingInstallResources('x86')

  assert.equal(nextResult.length, 3)
  assert.equal(nextResult[0].filename, 'Everything-1.4.1.1032.x86.zip')
})

test('rejects explicitly unsupported install architectures', () => {
  assert.throws(
    () => getEverythingInstallResources('mips'),
    /Unsupported Everything install architecture: mips/,
  )
})
