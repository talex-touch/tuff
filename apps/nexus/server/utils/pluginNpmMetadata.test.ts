import { createHash } from 'node:crypto'
import { DEFAULT_NPM_REGISTRY_URL } from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'
import {
  isValidNpmIntegrity,
  isValidNpmTarballSha256,
  parsePluginNpmMetadata,
  parsePluginVersionNpmMetadata,
  resolveStorePluginNpmMetadata,
  resolveStoreVersionNpmMetadata,
} from './pluginNpmMetadata'

const VALID_SHA256 = 'a'.repeat(64)
const VALID_SRI_SHA512 = `sha512-${createHash('sha512').update('tuff-npm-tarball').digest('base64')}`
const VALID_SRI_SHA384 = `sha384-${createHash('sha384').update('tuff-npm-tarball').digest('base64')}`
const VALID_SRI_SHA256 = `sha256-${createHash('sha256').update('tuff-npm-tarball').digest('base64')}`

describe('pluginNpmMetadata parsing and validation', () => {
  it('returns null fields when metadata is omitted or empty for backward compatibility', () => {
    expect(parsePluginNpmMetadata({})).toEqual({
      npmPackageName: null,
      npmRegistry: null,
    })
    expect(parsePluginNpmMetadata({ npmPackageName: '   ', npmRegistry: null })).toEqual({
      npmPackageName: null,
      npmRegistry: null,
    })
    expect(parsePluginVersionNpmMetadata({})).toEqual({
      npmPackageName: null,
      npmRegistry: null,
      npmIntegrity: null,
      npmTarballSha256: null,
    })
  })

  it('normalizes valid official, community, registry, SRI, and sha256 metadata', () => {
    expect(parsePluginNpmMetadata({
      npmPackageName: '  @talex-touch/clipboard-history-plugin  ',
      npmRegistry: '  https://npm.pkg.github.com///  ',
    })).toEqual({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com',
    })

    expect(parsePluginVersionNpmMetadata({
      npmPackageName: 'tuff-plugin-focus-flow',
      npmRegistry: 'https://registry.npmjs.org/',
      npmIntegrity: ` ${VALID_SRI_SHA512} `,
      npmTarballSha256: ` ${'AB'.repeat(32)} `,
    })).toEqual({
      npmPackageName: 'tuff-plugin-focus-flow',
      npmRegistry: DEFAULT_NPM_REGISTRY_URL,
      npmIntegrity: VALID_SRI_SHA512,
      npmTarballSha256: 'ab'.repeat(32),
    })

    expect(isValidNpmIntegrity(VALID_SRI_SHA256)).toBe(true)
    expect(isValidNpmIntegrity(VALID_SRI_SHA384)).toBe(true)
    expect(isValidNpmIntegrity(VALID_SRI_SHA512)).toBe(true)
    expect(isValidNpmTarballSha256(VALID_SHA256)).toBe(true)
  })

  it.each([
    '@Talex-Touch/Uppercase-Plugin',
    '../escape',
    'npm:@talex-touch/clipboard-history-plugin',
    '@talex-touch/clipboard-history-plugin@1.0.0',
    'https://registry.npmjs.org/tuff-plugin-focus',
    'invalid name',
    '@scope/bad/name',
  ])('rejects invalid npmPackageName: %s', (npmPackageName) => {
    expect(() => parsePluginNpmMetadata({ npmPackageName })).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        statusMessage: expect.stringContaining('NPM_PACKAGE_NAME_INVALID'),
      }),
    )
  })

  it.each([
    'http://registry.npmjs.org',
    'http://127.0.0.1:4873',
    'http://localhost:4873',
    'ftp://registry.npmjs.org',
    'https://user:pass@registry.npmjs.org',
    'https://registry.npmjs.org/?token=secret',
    'https://registry.npmjs.org/#fragment',
    'not-a-url',
  ])('rejects disallowed or invalid npmRegistry: %s', (npmRegistry) => {
    expect(() => parsePluginNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry,
    })).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        statusMessage: expect.stringContaining('NPM_REGISTRY_URL_INVALID'),
      }),
    )
  })

  it.each([
    'md5-1B2M2Y8AsgTpgAmY7PhCfg==',
    'sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=',
    'sha512-too-short',
    'not-sri',
  ])('rejects invalid npmIntegrity: %s', (npmIntegrity) => {
    expect(() => parsePluginVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmIntegrity,
    })).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        statusMessage: expect.stringContaining('NPM_INTEGRITY_INVALID'),
      }),
    )
  })

  it.each([
    'abc123',
    'z'.repeat(64),
    `sha256-${VALID_SHA256}`,
  ])('rejects invalid npmTarballSha256: %s', (npmTarballSha256) => {
    expect(() => parsePluginVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmTarballSha256,
    })).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        statusMessage: expect.stringContaining('NPM_TARBALL_SHA256_INVALID'),
      }),
    )
  })

  it('rejects non-string metadata payloads cleanly', () => {
    expect(() => parsePluginNpmMetadata({ npmPackageName: 123 as unknown as string })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
    expect(() => parsePluginNpmMetadata({ npmRegistry: { url: 'https://registry.npmjs.org' } as unknown as string })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})

describe('pluginNpmMetadata store projection', () => {
  it('returns null when no npm package cross-link is present', () => {
    expect(resolveStorePluginNpmMetadata({}, null)).toBeNull()
    expect(resolveStoreVersionNpmMetadata({}, { version: '1.0.0' })).toBeNull()
    expect(resolveStoreVersionNpmMetadata({}, {
      version: '1.0.0',
      npmIntegrity: VALID_SRI_SHA512,
      npmTarballSha256: VALID_SHA256,
    })).toBeNull()
  })

  it('surfaces canonical npm metadata and inherits plugin-level defaults into versions', () => {
    const plugin = {
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com/',
    }
    const version = {
      version: '1.2.0',
      npmIntegrity: VALID_SRI_SHA512,
      npmTarballSha256: 'CD'.repeat(32),
    }

    expect(resolveStorePluginNpmMetadata(plugin, version)).toEqual({
      packageName: '@talex-touch/clipboard-history-plugin',
      registry: 'https://npm.pkg.github.com',
      installSource: 'npm:@talex-touch/clipboard-history-plugin',
      officialScope: true,
    })

    expect(resolveStoreVersionNpmMetadata(plugin, version)).toEqual({
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.2.0',
      registry: 'https://npm.pkg.github.com',
      installSource: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
      officialScope: true,
      integrity: VALID_SRI_SHA512,
      tarballSha256: 'cd'.repeat(32),
    })
  })

  it('defaults registry to registry.npmjs.org and supports version-level overrides and plugin fallback', () => {
    const plugin = {
      npmPackageName: null,
      npmRegistry: null,
    }
    const latestVersion = {
      version: '2.0.0-beta.1',
      npmPackageName: 'tuff-plugin-focus-flow',
      npmRegistry: null,
      npmIntegrity: null,
      npmTarballSha256: null,
    }

    expect(resolveStorePluginNpmMetadata(plugin, latestVersion)).toEqual({
      packageName: 'tuff-plugin-focus-flow',
      registry: DEFAULT_NPM_REGISTRY_URL,
      installSource: 'npm:tuff-plugin-focus-flow',
      officialScope: false,
    })

    expect(resolveStoreVersionNpmMetadata(plugin, latestVersion)).toEqual({
      packageName: 'tuff-plugin-focus-flow',
      version: '2.0.0-beta.1',
      registry: DEFAULT_NPM_REGISTRY_URL,
      installSource: 'npm:tuff-plugin-focus-flow@2.0.0-beta.1',
      officialScope: false,
      integrity: null,
      tarballSha256: null,
    })
  })

  it('fails closed when stored package name or explicit registry is invalid', () => {
    expect(resolveStorePluginNpmMetadata({
      npmPackageName: 'INVALID_UPPERCASE',
      npmRegistry: DEFAULT_NPM_REGISTRY_URL,
    }, {
      npmPackageName: '@talex-touch/fallback-plugin',
    })).toBeNull()

    expect(resolveStorePluginNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'http://evil.example',
    })).toBeNull()

    expect(resolveStoreVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'http://evil.example',
    }, {
      version: '1.0.0',
    })).toBeNull()

    expect(resolveStoreVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: DEFAULT_NPM_REGISTRY_URL,
    }, {
      version: '1.0.0',
      npmRegistry: 'http://localhost:4873',
    })).toBeNull()

    expect(resolveStoreVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
    }, {
      version: '1.0.0',
      npmPackageName: '../bad-pkg',
    })).toBeNull()
  })

  it('sanitizes malformed stored digests and safely formats non-standard version strings', () => {
    expect(resolveStoreVersionNpmMetadata({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
    }, {
      version: '1.0.0+build/5',
      npmIntegrity: 'md5-invalid',
      npmTarballSha256: 'not-hex',
    })).toEqual({
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.0.0+build/5',
      registry: DEFAULT_NPM_REGISTRY_URL,
      installSource: 'npm:@talex-touch/clipboard-history-plugin',
      officialScope: true,
      integrity: null,
      tarballSha256: null,
    })
  })
})
