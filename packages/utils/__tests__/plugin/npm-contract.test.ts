import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { networkClient } from '../../network'
import {
  buildNpmPackageJson,
  classifyNpmPluginPackageName,
  classifyNpmVersionSpec,
  CURRENT_SDK_VERSION,
  DEFAULT_NPM_REGISTRY_URL,
  encodeNpmPackagePath,
  extractTuffPackageMetadata,
  formatNpmPluginSource,
  formatOfficialNpmPackageName,
  getForbiddenNpmLifecycleScripts,
  getNpmRuntimeDependencyNames,
  getTuffPackageMetadataSource,
  hasTuffNpmDiscoveryKeyword,
  inferPluginNameFromNpmPackage,
  isAllowedNpmRegistryUrl,
  isOfficialNpmPluginPackageName,
  isThirdPartyNpmPluginPackageName,
  isTuffNpmDiscoveryKeyword,
  isTuffNpmPluginPackageName,
  isValidNpmPackageName,
  isValidNpmVersionSpec,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT,
  NPM_PLUGIN_CANONICAL_KEYWORD,
  normalizeNpmRegistryUrl,
  parseNpmPluginSource,
  PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_BYTES,
  PLUGIN_PACKAGE_POLICY_VERSION,
  resolveNpmRegistryUrl,
  TUFF_NPM_METADATA_SCHEMA_VERSION,
  validateNpmNoLifecycleScripts,
  validateNpmPackageIdentity,
  validateNpmZeroRuntimeDependencies,
  validatePluginPackagePolicy,
  type PluginPackageEntry,
  type PluginPackagePolicyInput,
  type PluginPackageViolationCode,
} from '../../plugin'
import { NpmProvider } from '../../plugin/providers/npm-provider'
import { PluginStoreClient } from '../../plugin/providers/store-client'
import { PluginProviderType } from '../../plugin/providers/types'
import { createDefaultStoreProviders, DEFAULT_STORE_PROVIDERS } from '../../store/constants'

const FILE_HASH = `sha256-${'a'.repeat(64)}`
const FILE_MAP_DIGEST = 'b'.repeat(64)

function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'com.talex.touch.clipboard-history',
    name: 'clipboard-history',
    version: '1.2.0',
    sdkapi: CURRENT_SDK_VERSION,
    category: 'productivity',
    description: { default: 'Clipboard history manager' },
    author: 'Talex Touch',
    main: 'index.js',
    icon: { type: 'class', value: 'i-ri-clipboard-line' },
    dev: { enable: false, source: false, address: '' },
    permissions: {
      required: ['clipboard.read'],
      optional: ['clipboard.write'],
    },
    features: [
      {
        id: 'open',
        platform: { win32: true, darwin: true, linux: true },
        interaction: { type: 'webcontent', path: 'index.html' },
      },
    ],
    ...overrides,
  }
}

function baseNpmPackageJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: '@talex-touch/clipboard-history-plugin',
    version: '1.2.0',
    description: 'Clipboard history manager',
    keywords: ['tuff-plugin', 'productivity'],
    main: './index.js',
    dependencies: {},
    tuff: {
      schemaVersion: 1,
      id: 'com.talex.touch.clipboard-history',
      name: 'clipboard-history',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'productivity',
    },
    ...overrides,
  }
}

function npmEntries(extra: readonly PluginPackageEntry[] = []): PluginPackageEntry[] {
  return [
    { path: 'index.js', type: 'file', size: 128 },
    { path: 'manifest.json', type: 'file', size: 256 },
    { path: 'package.json', type: 'file', size: 256 },
    ...extra,
  ]
}

function stampedNpmManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseManifest({
    _files: {
      'index.js': FILE_HASH,
      'package.json': FILE_HASH,
    },
    _signature: 'valid-npm-signature',
    ...overrides,
  })
}

function violationCodes(input: PluginPackagePolicyInput): readonly PluginPackageViolationCode[] {
  const result = validatePluginPackagePolicy(input)
  if (result.ok)
    throw new Error('Expected package policy to reject the fixture.')
  return result.violations.map(violation => violation.code)
}

describe('npm plugin contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('naming helpers and classification', () => {
    it('validates canonical npm package names and rejects malformed ones', () => {
      expect(isValidNpmPackageName('@talex-touch/clipboard-history-plugin')).toBe(true)
      expect(isValidNpmPackageName('tuff-plugin-calc')).toBe(true)
      expect(isValidNpmPackageName('@acme/my.tool_1')).toBe(true)
      expect(isValidNpmPackageName('a')).toBe(true)

      expect(isValidNpmPackageName('')).toBe(false)
      expect(isValidNpmPackageName('UpperCase')).toBe(false)
      expect(isValidNpmPackageName('@talex-touch/')).toBe(false)
      expect(isValidNpmPackageName('@/foo')).toBe(false)
      expect(isValidNpmPackageName('a/b')).toBe(false)
      expect(isValidNpmPackageName('@a/b/c')).toBe(false)
      expect(isValidNpmPackageName('.hidden')).toBe(false)
      expect(isValidNpmPackageName('_private')).toBe(false)
      expect(isValidNpmPackageName('foo..bar')).toBe(false)
      expect(isValidNpmPackageName('foo bar')).toBe(false)
      expect(isValidNpmPackageName('a'.repeat(215))).toBe(false)
    })

    it('formats and classifies official and third-party plugin package names', () => {
      expect(formatOfficialNpmPackageName('clipboard-history')).toBe('@talex-touch/clipboard-history-plugin')
      expect(() => formatOfficialNpmPackageName('Bad_Slug')).toThrow(RangeError)

      expect(isOfficialNpmPluginPackageName('@talex-touch/clipboard-history-plugin')).toBe(true)
      expect(isOfficialNpmPluginPackageName('@talex-touch/utils')).toBe(false)
      expect(isOfficialNpmPluginPackageName('@talex-touch/tuff-plugin-demo')).toBe(false)

      expect(isThirdPartyNpmPluginPackageName('tuff-plugin-calc')).toBe(true)
      expect(isThirdPartyNpmPluginPackageName('@acme/tuff-plugin-calc')).toBe(true)
      expect(isThirdPartyNpmPluginPackageName('@acme/calc-plugin')).toBe(true)
      expect(isThirdPartyNpmPluginPackageName('@talex-touch/calc-plugin')).toBe(false)
      expect(isThirdPartyNpmPluginPackageName('@talex-touch/tuff-plugin-calc')).toBe(false)
      expect(isThirdPartyNpmPluginPackageName('lodash')).toBe(false)

      expect(isTuffNpmPluginPackageName('@talex-touch/clipboard-history-plugin')).toBe(true)
      expect(isTuffNpmPluginPackageName('tuff-plugin-calc')).toBe(true)
      expect(isTuffNpmPluginPackageName('@acme/tuff-plugin-calc')).toBe(true)
      expect(isTuffNpmPluginPackageName('@acme/calc-plugin')).toBe(true)
      expect(isTuffNpmPluginPackageName('@talex-touch/utils')).toBe(false)
      expect(isTuffNpmPluginPackageName('lodash')).toBe(false)

      expect(classifyNpmPluginPackageName('@talex-touch/clipboard-history-plugin')).toEqual({
        packageName: '@talex-touch/clipboard-history-plugin',
        kind: 'official-scoped',
        officialScope: true,
        scope: '@talex-touch',
        inferredPluginName: 'clipboard-history',
      })
      expect(classifyNpmPluginPackageName('tuff-plugin-calc')).toEqual({
        packageName: 'tuff-plugin-calc',
        kind: 'unscoped-prefixed',
        officialScope: false,
        inferredPluginName: 'calc',
      })
      expect(classifyNpmPluginPackageName('@acme/tuff-plugin-calc')).toEqual({
        packageName: '@acme/tuff-plugin-calc',
        kind: 'scoped-prefixed',
        officialScope: false,
        scope: '@acme',
        inferredPluginName: 'calc',
      })
      expect(classifyNpmPluginPackageName('@acme/calc-plugin')).toEqual({
        packageName: '@acme/calc-plugin',
        kind: 'scoped-suffixed',
        officialScope: false,
        scope: '@acme',
        inferredPluginName: 'calc',
      })
      expect(classifyNpmPluginPackageName('@acme/custom')).toEqual({
        packageName: '@acme/custom',
        kind: 'explicit',
        officialScope: false,
        scope: '@acme',
      })

      expect(inferPluginNameFromNpmPackage('@talex-touch/clipboard-history-plugin')).toBe('clipboard-history')
      expect(inferPluginNameFromNpmPackage('tuff-plugin-calc')).toBe('calc')
      expect(inferPluginNameFromNpmPackage('@acme/custom')).toBeUndefined()
    })
  })

  describe('npm source parser and version spec validator', () => {
    it('classifies exact versions, semver ranges, and dist-tags while rejecting unsafe specs', () => {
      expect(classifyNpmVersionSpec('1.2.3')).toBe('exact')
      expect(classifyNpmVersionSpec('1.2.3-beta.1+build.4')).toBe('exact')

      expect(classifyNpmVersionSpec('^1.2.0')).toBe('range')
      expect(classifyNpmVersionSpec('~0.9.1')).toBe('range')
      expect(classifyNpmVersionSpec('>=1.0.0 <2.0.0')).toBe('range')
      expect(classifyNpmVersionSpec('>= 1.0.0 < 2.0.0')).toBe('range')
      expect(classifyNpmVersionSpec('1.x')).toBe('range')
      expect(classifyNpmVersionSpec('1.2.*')).toBe('range')
      expect(classifyNpmVersionSpec('*')).toBe('range')
      expect(classifyNpmVersionSpec('1.0.0 || 2.0.0')).toBe('range')
      expect(classifyNpmVersionSpec('1.0.0 - 2.0.0')).toBe('range')
      expect(classifyNpmVersionSpec('v1.2.3')).toBe('range')

      expect(classifyNpmVersionSpec('latest')).toBe('dist-tag')
      expect(classifyNpmVersionSpec('beta')).toBe('dist-tag')
      expect(classifyNpmVersionSpec('next-2026')).toBe('dist-tag')
      expect(classifyNpmVersionSpec('v2-beta')).toBe('dist-tag')

      const unsafeSpecs = [
        '',
        '   ',
        'https://evil.test/pkg.tgz',
        'file:../local',
        'git+https://github.com/org/repo.git',
        'workspace:*',
        'catalog:',
        'npm:other@1.0.0',
        '1.0.0; rm -rf /',
        '../escape',
        '01.2.3',
        '1.x.2',
        '1.2.x-beta',
        '^',
        '1.0.0 ||',
        'latest..bad',
        'bad tag',
        '1.0.0\n2.0.0',
        'a'.repeat(129),
      ]
      for (const spec of unsafeSpecs) {
        expect(isValidNpmVersionSpec(spec), `expected "${spec}" to be rejected`).toBe(false)
      }
    })

    it('parses explicit npm: sources and bare Tuff conventions while rejecting non-npm inputs', () => {
      expect(parseNpmPluginSource('npm:@talex-touch/clipboard-history-plugin@1.2.0')).toMatchObject({
        explicit: true,
        packageName: '@talex-touch/clipboard-history-plugin',
        spec: '1.2.0',
        specKind: 'exact',
        classification: {
          kind: 'official-scoped',
          officialScope: true,
          inferredPluginName: 'clipboard-history',
        },
      })

      expect(parseNpmPluginSource('npm:custom-pkg@^1.0.0')).toMatchObject({
        explicit: true,
        packageName: 'custom-pkg',
        spec: '^1.0.0',
        specKind: 'range',
        classification: { kind: 'explicit', officialScope: false },
      })

      expect(parseNpmPluginSource('@talex-touch/clipboard-history-plugin@beta')).toMatchObject({
        explicit: false,
        packageName: '@talex-touch/clipboard-history-plugin',
        spec: 'beta',
        specKind: 'dist-tag',
      })

      expect(parseNpmPluginSource('tuff-plugin-calc')).toMatchObject({
        explicit: false,
        packageName: 'tuff-plugin-calc',
        classification: { kind: 'unscoped-prefixed', inferredPluginName: 'calc' },
      })

      expect(parseNpmPluginSource('@acme/tuff-plugin-calc@latest')).toMatchObject({
        explicit: false,
        packageName: '@acme/tuff-plugin-calc',
        spec: 'latest',
        specKind: 'dist-tag',
      })

      expect(parseNpmPluginSource('@acme/calc-plugin')).toMatchObject({
        explicit: false,
        packageName: '@acme/calc-plugin',
        classification: { kind: 'scoped-suffixed', inferredPluginName: 'calc' },
      })

      // Bare non-convention package rejected unless allowAnyBarePackageName is true
      expect(parseNpmPluginSource('clipboard-history')).toBeNull()
      expect(parseNpmPluginSource('@talex-touch/utils')).toBeNull()
      expect(parseNpmPluginSource('custom-pkg', { allowAnyBarePackageName: true })).toMatchObject({
        explicit: false,
        packageName: 'custom-pkg',
        classification: { kind: 'explicit' },
      })

      const rejected = [
        '',
        'npm:',
        'npm:@talex-touch/clipboard-history-plugin@',
        'npm:tuff-plugin-calc@https://evil.test/a.tgz',
        'npm:../escape',
        'tpex:clipboard-history',
        'github:talex-touch/tuff',
        'https://registry.npmjs.org/tuff-plugin-calc/-/tuff-plugin-calc-1.0.0.tgz',
        'file:///tmp/plugin.tgz',
        '/Users/demo/plugin.tpex',
        './plugin.tgz',
        '../plugin.tpex',
        'C:\\plugins\\demo.tpex',
        'demo.tpex',
        'demo.tgz',
      ]
      for (const source of rejected) {
        expect(parseNpmPluginSource(source), `expected "${source}" to be rejected`).toBeNull()
        expect(
          parseNpmPluginSource(source, { allowAnyBarePackageName: true }),
          `expected "${source}" to be rejected even with hint`,
        ).toBeNull()
      }

      expect(formatNpmPluginSource('@talex-touch/clipboard-history-plugin')).toBe('npm:@talex-touch/clipboard-history-plugin')
      expect(formatNpmPluginSource('@talex-touch/clipboard-history-plugin', '1.2.0')).toBe('npm:@talex-touch/clipboard-history-plugin@1.2.0')
      expect(() => formatNpmPluginSource('BadName')).toThrow(RangeError)
      expect(() => formatNpmPluginSource('tuff-plugin-calc', 'file:../x')).toThrow(RangeError)
    })
  })

  describe('discovery keywords, path encoding, and registry URL checks', () => {
    it('recognizes canonical and legacy discovery keywords', () => {
      expect(NPM_PLUGIN_CANONICAL_KEYWORD).toBe('tuff-plugin')
      expect(isTuffNpmDiscoveryKeyword('tuff-plugin')).toBe(true)
      expect(isTuffNpmDiscoveryKeyword('TUFF-PLUGIN')).toBe(true)
      expect(isTuffNpmDiscoveryKeyword('talex-touch-plugin')).toBe(true)
      expect(isTuffNpmDiscoveryKeyword('talex-touch-plugin', { includeLegacy: false })).toBe(false)
      expect(isTuffNpmDiscoveryKeyword('other')).toBe(false)

      expect(hasTuffNpmDiscoveryKeyword(['productivity', 'tuff-plugin'])).toBe(true)
      expect(hasTuffNpmDiscoveryKeyword(['talex-touch-plugin'])).toBe(true)
      expect(hasTuffNpmDiscoveryKeyword(['talex-touch-plugin'], { includeLegacy: false })).toBe(false)
      expect(hasTuffNpmDiscoveryKeyword(['productivity'])).toBe(false)
      expect(hasTuffNpmDiscoveryKeyword(undefined)).toBe(false)
    })

    it('encodes scoped and unscoped package paths safely', () => {
      expect(encodeNpmPackagePath('@talex-touch/clipboard-history-plugin')).toBe(
        '@talex-touch%2Fclipboard-history-plugin',
      )
      expect(encodeNpmPackagePath('tuff-plugin-calc')).toBe('tuff-plugin-calc')
      expect(() => encodeNpmPackagePath('../etc/passwd')).toThrow(RangeError)
    })

    it('enforces HTTPS registry URLs with opt-in local loopback HTTP', () => {
      expect(normalizeNpmRegistryUrl('https://registry.npmjs.org///')).toBe('https://registry.npmjs.org')

      expect(isAllowedNpmRegistryUrl('https://registry.npmjs.org')).toBe(true)
      expect(isAllowedNpmRegistryUrl('https://npm.pkg.github.com/custom/path')).toBe(true)
      expect(isAllowedNpmRegistryUrl('http://registry.npmjs.org')).toBe(false)
      expect(isAllowedNpmRegistryUrl('http://localhost:4873')).toBe(false)
      expect(isAllowedNpmRegistryUrl('http://127.0.0.1:4873')).toBe(false)
      expect(isAllowedNpmRegistryUrl('http://localhost:4873', { allowLocalHttp: true })).toBe(true)
      expect(isAllowedNpmRegistryUrl('http://127.0.0.1:4873', { allowLocalHttp: true })).toBe(true)
      expect(isAllowedNpmRegistryUrl('http://[::1]:4873', { allowLocalHttp: true })).toBe(true)
      expect(isAllowedNpmRegistryUrl('http://192.168.1.5:4873', { allowLocalHttp: true })).toBe(false)
      expect(isAllowedNpmRegistryUrl('https://user:pass@registry.npmjs.org')).toBe(false)
      expect(isAllowedNpmRegistryUrl('https://registry.npmjs.org?foo=bar')).toBe(false)
      expect(isAllowedNpmRegistryUrl('https://registry.npmjs.org#frag')).toBe(false)
      expect(isAllowedNpmRegistryUrl('file:///tmp/registry')).toBe(false)
      expect(isAllowedNpmRegistryUrl('not-a-url')).toBe(false)

      expect(resolveNpmRegistryUrl([undefined, '', 'https://registry.npmmirror.com/'])).toBe(
        'https://registry.npmmirror.com',
      )
      expect(resolveNpmRegistryUrl([undefined, null, ''])).toBe(DEFAULT_NPM_REGISTRY_URL)
      expect(() => resolveNpmRegistryUrl(['http://evil.test'])).toThrow(RangeError)
    })
  })

  describe('metadata extraction, zero-deps, lifecycle scripts, identity, and packager builder', () => {
    it('extracts canonical package.json#tuff and falls back to legacy tuffPlugin', () => {
      const canonicalPkg = {
        name: '@talex-touch/clipboard-history-plugin',
        tuff: {
          schemaVersion: 1,
          id: 'com.talex.touch.clipboard-history',
          name: 'clipboard-history',
          displayName: { en: 'Clipboard History', zh: '剪贴板历史' },
          sdkapi: CURRENT_SDK_VERSION,
          category: 'productivity',
          icon: { type: 'class', value: 'i-ri-clipboard-line' },
          permissions: { required: ['clipboard.read'], optional: ['clipboard.write'] },
          platforms: { win32: true, darwin: true, linux: true },
          surface: 'webcontent',
          manifest: './manifest.json',
          integrity: { fileMapSha256: FILE_MAP_DIGEST },
        },
        tuffPlugin: {
          category: 'legacy-ignored',
        },
      }

      expect(getTuffPackageMetadataSource(canonicalPkg)).toBe('tuff')
      expect(extractTuffPackageMetadata(canonicalPkg)).toEqual({
        schemaVersion: TUFF_NPM_METADATA_SCHEMA_VERSION,
        id: 'com.talex.touch.clipboard-history',
        name: 'clipboard-history',
        displayName: { en: 'Clipboard History', zh: '剪贴板历史' },
        sdkapi: CURRENT_SDK_VERSION,
        category: 'productivity',
        icon: { type: 'class', value: 'i-ri-clipboard-line' },
        permissions: { required: ['clipboard.read'], optional: ['clipboard.write'] },
        platforms: { win32: true, darwin: true, linux: true },
        surface: 'webcontent',
        manifest: './manifest.json',
        integrity: { fileMapSha256: FILE_MAP_DIGEST },
      })

      const legacyPkg = {
        name: 'tuff-plugin-legacy',
        tuffPlugin: {
          category: 'utilities',
          icon: 'i-ri-tools-line',
          tags: ['tools', 'helper'],
        },
      }
      expect(getTuffPackageMetadataSource(legacyPkg)).toBe('tuffPlugin')
      expect(extractTuffPackageMetadata(legacyPkg)).toEqual({
        schemaVersion: 1,
        category: 'utilities',
        icon: 'i-ri-tools-line',
        tags: ['tools', 'helper'],
      })

      expect(extractTuffPackageMetadata({ tuff: { schemaVersion: 2, name: 'future' } })).toBeNull()
      expect(extractTuffPackageMetadata({ name: 'plain-pkg' })).toBeNull()
    })

    it('validates zero runtime dependencies and zero install lifecycle scripts', () => {
      expect(validateNpmZeroRuntimeDependencies({ dependencies: {} })).toEqual({
        ok: true,
        dependencies: [],
      })
      expect(validateNpmZeroRuntimeDependencies({})).toEqual({
        ok: true,
        dependencies: [],
      })
      expect(getNpmRuntimeDependencyNames({
        dependencies: { zod: '^3.0.0' },
        optionalDependencies: { fsevents: '^2.0.0' },
      })).toEqual(['fsevents', 'zod'])
      expect(validateNpmZeroRuntimeDependencies({
        dependencies: { axios: '^1.0.0' },
      })).toEqual({
        ok: false,
        dependencies: ['axios'],
      })
      expect(validateNpmZeroRuntimeDependencies({
        dependencies: 'invalid',
      })).toEqual({
        ok: false,
        dependencies: [],
        invalidField: 'dependencies',
      })

      expect(validateNpmNoLifecycleScripts({})).toEqual({ ok: true, forbiddenScripts: [] })
      expect(validateNpmNoLifecycleScripts({ scripts: { build: 'vite build', test: 'vitest' } })).toEqual({
        ok: true,
        forbiddenScripts: [],
      })
      expect(getForbiddenNpmLifecycleScripts({
        scripts: { preinstall: 'echo 1', postinstall: 'node evil.js', build: 'vite' },
      })).toEqual(['preinstall', 'postinstall'])
      expect(validateNpmNoLifecycleScripts({
        scripts: { prepare: 'husky' },
      })).toEqual({
        ok: false,
        forbiddenScripts: ['prepare'],
      })
      expect(validateNpmNoLifecycleScripts({
        scripts: 'not-an-object',
      })).toEqual({
        ok: false,
        forbiddenScripts: [],
        invalidScriptsField: true,
      })
    })

    it('validates package identity and parity against manifest.json', () => {
      const okResult = validateNpmPackageIdentity({
        packageJson: baseNpmPackageJson(),
        manifest: baseManifest(),
        expectedPackageName: '@talex-touch/clipboard-history-plugin',
        requireOfficialNaming: true,
        requireDiscoveryKeyword: true,
        forbidPrivate: true,
      })
      expect(okResult.ok).toBe(true)

      const badResult = validateNpmPackageIdentity({
        packageJson: baseNpmPackageJson({
          name: '@talex-touch/wrong-plugin',
          version: '2.0.0',
          private: true,
          keywords: ['other'],
          dependencies: { lodash: '^4.0.0' },
          scripts: { postinstall: 'curl evil.test' },
          tuff: {
            schemaVersion: 1,
            id: 'com.talex.touch.other',
            name: 'other',
            sdkapi: 251212,
            category: 'utilities',
          },
        }),
        manifest: baseManifest(),
        expectedPackageName: '@talex-touch/clipboard-history-plugin',
        requireOfficialNaming: true,
        requireDiscoveryKeyword: true,
        forbidPrivate: true,
      })
      expect(badResult.ok).toBe(false)
      if (!badResult.ok) {
        const codes = badResult.issues.map(issue => issue.code)
        expect(codes).toEqual(expect.arrayContaining([
          'NPM_PACKAGE_EXPECTED_NAME_MISMATCH',
          'NPM_PACKAGE_OFFICIAL_NAME_MISMATCH',
          'NPM_PACKAGE_VERSION_MISMATCH',
          'NPM_PACKAGE_TUFF_ID_MISMATCH',
          'NPM_PACKAGE_TUFF_NAME_MISMATCH',
          'NPM_PACKAGE_TUFF_SDKAPI_MISMATCH',
          'NPM_PACKAGE_TUFF_CATEGORY_MISMATCH',
          'NPM_PACKAGE_DISCOVERY_KEYWORD_MISSING',
          'NPM_PACKAGE_PRIVATE_FORBIDDEN',
          'NPM_PACKAGE_RUNTIME_DEPENDENCIES_FORBIDDEN',
          'NPM_PACKAGE_LIFECYCLE_SCRIPTS_FORBIDDEN',
        ]))
      }
    })

    it('builds a sanitized publish-ready package.json that passes identity validation', () => {
      const built = buildNpmPackageJson({
        manifest: baseManifest(),
        sourcePackageJson: {
          name: '@talex-touch/clipboard-history-plugin',
          version: '0.0.1-stale',
          private: true,
          license: 'MIT',
          homepage: 'https://tuff.tagzxia.com/store/clipboard-history',
          repository: { type: 'git', url: 'https://github.com/talex-touch/tuff.git', directory: 'plugins/clipboard-history' },
          keywords: ['clipboard', 'productivity'],
          dependencies: { '@talex-touch/utils': 'workspace:^', vue: 'catalog:' },
          devDependencies: { vite: '^6.0.0' },
          scripts: { postinstall: 'echo bad', build: 'vite build' },
        },
        files: ['manifest.json', 'index.js', 'index.html', 'assets/'],
        fileMapSha256: FILE_MAP_DIGEST,
      })

      expect(built.name).toBe('@talex-touch/clipboard-history-plugin')
      expect(built.version).toBe('1.2.0')
      expect(built.dependencies).toEqual({})
      expect('private' in built).toBe(false)
      expect('scripts' in built).toBe(false)
      expect('devDependencies' in built).toBe(false)
      expect(built.keywords).toEqual(['tuff-plugin', 'productivity', 'clipboard'])
      expect(built.exports).toEqual({
        '.': './index.js',
        './manifest.json': './manifest.json',
        './package.json': './package.json',
      })
      expect(built.engines).toEqual({ tuff: `>=${CURRENT_SDK_VERSION}` })
      expect(built.publishConfig).toEqual({ access: 'public' })
      expect(built.tuff).toMatchObject({
        schemaVersion: 1,
        id: 'com.talex.touch.clipboard-history',
        name: 'clipboard-history',
        sdkapi: CURRENT_SDK_VERSION,
        category: 'productivity',
        surface: 'webcontent',
        manifest: './manifest.json',
        platforms: { win32: true, darwin: true, linux: true },
        integrity: { fileMapSha256: FILE_MAP_DIGEST },
      })

      const identityCheck = validateNpmPackageIdentity({
        packageJson: built,
        manifest: baseManifest(),
        expectedPackageName: '@talex-touch/clipboard-history-plugin',
        requireOfficialNaming: true,
        requireDiscoveryKeyword: true,
        forbidPrivate: true,
      })
      expect(identityCheck.ok).toBe(true)

      expect(() => buildNpmPackageJson({
        manifest: baseManifest({ main: '../escape.js' }),
      })).toThrow(RangeError)
    })
  })

  describe('package-policy npm-package profile', () => {
    it('accepts a valid strictly stamped npm package', () => {
      const result = validatePluginPackagePolicy({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries(),
        archiveSize: 2048,
        expected: {
          pluginId: 'com.talex.touch.clipboard-history',
          pluginName: 'clipboard-history',
          version: '1.2.0',
          npmPackageName: '@talex-touch/clipboard-history-plugin',
        },
      })

      expect(result).toEqual({
        ok: true,
        policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
        identity: {
          id: 'com.talex.touch.clipboard-history',
          name: 'clipboard-history',
          version: '1.2.0',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'productivity',
          permissions: ['clipboard.read', 'clipboard.write'],
        },
        inventory: {
          archiveBytes: 2048,
          entryCount: 3,
          expandedBytes: 640,
          paths: ['index.js', 'manifest.json', 'package.json'],
        },
      })
    })

    it('rejects unstamped npm packages by default and allows unstamped only under allowUnstampedCommunity when both _files and _signature are absent', () => {
      const defaultCodes = violationCodes({
        profile: 'npm-package',
        manifest: baseManifest(),
        packageJson: baseNpmPackageJson({ name: 'tuff-plugin-clipboard-history' }),
        entries: npmEntries(),
      })
      expect(defaultCodes).toEqual(expect.arrayContaining([
        'PLUGIN_PACKAGE_FILE_MAP_REQUIRED',
        'PLUGIN_PACKAGE_SIGNATURE_REQUIRED',
      ]))

      const communityAllowed = validatePluginPackagePolicy({
        profile: 'npm-package',
        manifest: baseManifest(),
        packageJson: baseNpmPackageJson({ name: 'tuff-plugin-clipboard-history' }),
        entries: npmEntries(),
        allowUnstampedCommunity: true,
      })
      expect(communityAllowed.ok).toBe(true)

      // Partial stamp with _files only must still fail strictly
      const partialFilesOnly = violationCodes({
        profile: 'npm-package',
        manifest: baseManifest({
          _files: { 'index.js': FILE_HASH, 'package.json': FILE_HASH },
        }),
        packageJson: baseNpmPackageJson({ name: 'tuff-plugin-clipboard-history' }),
        entries: npmEntries(),
        allowUnstampedCommunity: true,
      })
      expect(partialFilesOnly).toContain('PLUGIN_PACKAGE_SIGNATURE_REQUIRED')

      // Partial stamp with _signature only must still fail strictly
      const partialSigOnly = violationCodes({
        profile: 'npm-package',
        manifest: baseManifest({ _signature: 'partial-sig' }),
        packageJson: baseNpmPackageJson({ name: 'tuff-plugin-clipboard-history' }),
        entries: npmEntries(),
        allowUnstampedCommunity: true,
      })
      expect(partialSigOnly).toContain('PLUGIN_PACKAGE_FILE_MAP_REQUIRED')
    })

    it('enforces node_modules, lifecycle scripts, runtime deps, parity, archive, entry, and manifest rules', () => {
      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries([
          { path: 'node_modules/pkg/index.js', type: 'file', size: 10 },
          { path: 'nested/Node_Modules/x.js', type: 'file', size: 10 },
        ]),
      })).toContain('PLUGIN_PACKAGE_NODE_MODULES_FORBIDDEN')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest({ _files: { 'index.js': FILE_HASH } }),
        packageJson: baseNpmPackageJson(),
        entries: [
          { path: 'index.js', type: 'file', size: 128 },
          { path: 'manifest.json', type: 'file', size: 256 },
        ],
      })).toContain('PLUGIN_PACKAGE_NPM_PACKAGE_JSON_ENTRY_MISSING')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({ scripts: { postinstall: 'sh -c evil' } }),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_NPM_LIFECYCLE_SCRIPTS_FORBIDDEN')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({ dependencies: { leftpad: '^1.0.0' } }),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_NPM_DEPENDENCIES_FORBIDDEN')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({ private: true }),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_NPM_PRIVATE_FORBIDDEN')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({ version: '9.9.9' }),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_NPM_VERSION_MISMATCH')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({ name: 'tuff-plugin-other' }),
        entries: npmEntries(),
        expected: { npmPackageName: 'tuff-plugin-clipboard-history' },
      })).toContain('PLUGIN_PACKAGE_NPM_NAME_MISMATCH')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson({
          tuff: { schemaVersion: 1, id: 'com.other.mismatch.plugin', name: 'clipboard-history' },
        }),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_NPM_METADATA_MISMATCH')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest({ dev: { enable: true, source: false, address: '' } }),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries(),
      })).toContain('PLUGIN_PACKAGE_DEV_MODE_ENABLED')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries([{ path: 'link', type: 'symlink', size: 0 }]),
      })).toContain('PLUGIN_PACKAGE_ENTRY_TYPE_DENIED')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries([{ path: '../escape.js', type: 'file', size: 1 }]),
      })).toContain('PLUGIN_PACKAGE_ENTRY_PATH_INVALID')

      expect(violationCodes({
        profile: 'npm-package',
        manifest: stampedNpmManifest(),
        packageJson: baseNpmPackageJson(),
        entries: npmEntries([{ path: 'huge.bin', type: 'file', size: PLUGIN_PACKAGE_MAX_ENTRY_BYTES + 1 }]),
        archiveSize: PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES + 1,
      })).toEqual(expect.arrayContaining([
        'PLUGIN_PACKAGE_ENTRY_TOO_LARGE',
        'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED',
      ]))
    })
  })

  describe('unified providers and store constants', () => {
    it('aligns DEFAULT_STORE_PROVIDERS npm-scope defaults with canonical keyword and registry URL', () => {
      const npmSource = DEFAULT_STORE_PROVIDERS.find(provider => provider.id === 'npm-scope')
      expect(npmSource).toBeDefined()
      expect(npmSource?.url).toBe(DEFAULT_NPM_REGISTRY_URL)
      expect(npmSource?.config?.registryUrl).toBe(DEFAULT_NPM_REGISTRY_URL)
      expect(npmSource?.config?.keyword).toBe(NPM_PLUGIN_CANONICAL_KEYWORD)

      const customProviders = createDefaultStoreProviders('https://nexus.example.test')
      const customNpmSource = customProviders.find(provider => provider.id === 'npm-scope')
      expect(customNpmSource?.url).toBe(DEFAULT_NPM_REGISTRY_URL)
      expect(customNpmSource?.config?.keyword).toBe('tuff-plugin')
    })

    it('tightens NpmProvider canHandle, packument fetching, search, and trust-safe install metadata', async () => {
      const provider = new NpmProvider()

      expect(provider.canHandle({ source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0' })).toBe(true)
      expect(provider.canHandle({ source: '@talex-touch/clipboard-history-plugin' })).toBe(true)
      expect(provider.canHandle({ source: 'tuff-plugin-calc' })).toBe(true)
      expect(provider.canHandle({ source: '@acme/tuff-plugin-calc' })).toBe(true)
      expect(provider.canHandle({ source: '@acme/calc-plugin' })).toBe(true)
      expect(provider.canHandle({ source: 'custom-pkg', hintType: PluginProviderType.NPM })).toBe(true)

      expect(provider.canHandle({ source: 'tpex:clipboard-history' })).toBe(false)
      expect(provider.canHandle({ source: 'clipboard-history' })).toBe(false)
      expect(provider.canHandle({ source: 'https://registry.npmjs.org/foo.tgz' })).toBe(false)
      expect(provider.canHandle({ source: '/tmp/plugin.tpex' })).toBe(false)

      const requestSpy = vi.spyOn(networkClient, 'request')
      requestSpy.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        url: 'https://registry.npmjs.org/@talex-touch%2Fclipboard-history-plugin',
        data: {
          'name': '@talex-touch/clipboard-history-plugin',
          'dist-tags': { latest: '1.2.0', beta: '1.3.0-beta.1' },
          'versions': {
            '1.3.0-beta.1': {
              name: '@talex-touch/clipboard-history-plugin',
              version: '1.3.0-beta.1',
              description: 'Clipboard history',
              dist: {
                tarball: 'https://registry.npmjs.org/@talex-touch/clipboard-history-plugin/-/clipboard-history-plugin-1.3.0-beta.1.tgz',
                shasum: 'abc123',
                integrity: 'sha512-test',
              },
              tuff: {
                schemaVersion: 1,
                id: 'com.talex.touch.clipboard-history',
                name: 'clipboard-history',
                sdkapi: CURRENT_SDK_VERSION,
                category: 'productivity',
                icon: { type: 'class', value: 'i-ri-clipboard-line' },
              },
            },
          },
        },
      } as never)

      const pkg = await provider.getPackageInfo('@talex-touch/clipboard-history-plugin', 'beta')
      expect(pkg?.version).toBe('1.3.0-beta.1')
      expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://registry.npmjs.org/@talex-touch%2Fclipboard-history-plugin',
        headers: { Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT },
      }))

      requestSpy.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        url: 'https://registry.npmjs.org/-/v1/search',
        data: {
          objects: [
            {
              package: {
                name: '@talex-touch/clipboard-history-plugin',
                version: '1.2.0',
                keywords: ['tuff-plugin'],
              },
            },
            {
              package: {
                name: 'random-untagged-pkg',
                version: '1.0.0',
                keywords: ['other'],
              },
            },
          ],
        },
      } as never)

      const found = await provider.searchPlugins('clipboard')
      expect(found).toHaveLength(1)
      expect(found[0]?.name).toBe('@talex-touch/clipboard-history-plugin')
      expect(requestSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        url: expect.stringContaining(encodeURIComponent('keywords:tuff-plugin clipboard')),
      }))

      const tempDir = await mkdtemp(path.join(tmpdir(), 'tuff-npm-provider-test-'))
      try {
        const tarballBytes = new Uint8Array([1, 2, 3])
        const { createHash } = await import('node:crypto')
        const expectedShasum = createHash('sha1').update(tarballBytes).digest('hex')
        const expectedIntegrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`

        requestSpy.mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://registry.npmjs.org/@talex-touch%2Fclipboard-history-plugin',
          data: {
            'name': '@talex-touch/clipboard-history-plugin',
            'dist-tags': { latest: '1.2.0' },
            'versions': {
              '1.2.0': {
                name: '@talex-touch/clipboard-history-plugin',
                version: '1.2.0',
                description: 'Clipboard history',
                author: 'Talex Touch',
                dist: {
                  tarball: 'https://registry.npmjs.org/@talex-touch/clipboard-history-plugin/-/clipboard-history-plugin-1.2.0.tgz',
                  shasum: expectedShasum,
                  integrity: expectedIntegrity,
                },
                tuff: {
                  schemaVersion: 1,
                  id: 'com.talex.touch.clipboard-history',
                  name: 'clipboard-history',
                  sdkapi: CURRENT_SDK_VERSION,
                  category: 'productivity',
                  icon: { type: 'class', value: 'i-ri-clipboard-line' },
                },
              },
            },
          },
        } as never)
        requestSpy.mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://registry.npmjs.org/@talex-touch/clipboard-history-plugin/-/clipboard-history-plugin-1.2.0.tgz',
          data: tarballBytes.buffer,
        } as never)

        const installResult = await provider.install(
          { source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0' },
          { tempDir },
        )
        expect(installResult.provider).toBe(PluginProviderType.NPM)
        expect(installResult.official).toBe(false)
        expect(installResult.manifest).toMatchObject({
          id: 'com.talex.touch.clipboard-history',
          name: 'clipboard-history',
          version: '1.2.0',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'productivity',
          icon: 'i-ri-clipboard-line',
        })
        expect(installResult.metadata).toMatchObject({
          packageName: '@talex-touch/clipboard-history-plugin',
          version: '1.2.0',
          requestedSpec: '1.2.0',
          registry: DEFAULT_NPM_REGISTRY_URL,
          officialScope: true,
          shasum: expectedShasum,
          integrity: expectedIntegrity,
        })

        // Disallowed tarball origin rejected before download
        requestSpy.mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://registry.npmjs.org/tuff-plugin-evil',
          data: {
            'name': 'tuff-plugin-evil',
            'dist-tags': { latest: '1.0.0' },
            'versions': {
              '1.0.0': {
                name: 'tuff-plugin-evil',
                version: '1.0.0',
                dist: {
                  tarball: 'http://169.254.169.254/latest/meta-data.tgz',
                  integrity: expectedIntegrity,
                },
              },
            },
          },
        } as never)
        await expect(
          provider.install({ source: 'npm:tuff-plugin-evil@1.0.0' }, { tempDir }),
        ).rejects.toThrow('PLUGIN_NPM_TARBALL_URL_DISALLOWED')

        // Tampered tarball bytes rejected by SRI check before writing
        requestSpy.mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://registry.npmjs.org/tuff-plugin-tampered',
          data: {
            'name': 'tuff-plugin-tampered',
            'dist-tags': { latest: '1.0.0' },
            'versions': {
              '1.0.0': {
                name: 'tuff-plugin-tampered',
                version: '1.0.0',
                dist: {
                  tarball: 'https://registry.npmjs.org/tuff-plugin-tampered/-/tampered-1.0.0.tgz',
                  integrity: expectedIntegrity,
                },
              },
            },
          },
        } as never)
        requestSpy.mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://registry.npmjs.org/tuff-plugin-tampered/-/tampered-1.0.0.tgz',
          data: new Uint8Array([9, 9, 9]).buffer,
        } as never)
        await expect(
          provider.install({ source: 'npm:tuff-plugin-tampered@1.0.0' }, { tempDir }),
        ).rejects.toThrow('PLUGIN_NPM_INTEGRITY_MISMATCH')
      }
      finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })

    it('unifies PluginStoreClient npm normalization with @talex-touch/ official scope and legacy tuffPlugin fallback', async () => {
      const client = new PluginStoreClient()
      const requestSpy = vi.spyOn(networkClient, 'request')

      requestSpy.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        url: 'https://registry.npmjs.org/-/v1/search',
        data: {
          objects: [
            {
              package: {
                name: '@talex-touch/clipboard-history-plugin',
                version: '1.2.0',
                description: 'Official scoped plugin',
                keywords: ['tuff-plugin'],
                tuff: {
                  schemaVersion: 1,
                  name: 'clipboard-history',
                  category: 'productivity',
                  icon: { type: 'class', value: 'i-ri-clipboard-line' },
                },
              },
            },
            {
              package: {
                name: 'tuff-plugin-legacy',
                version: '0.5.0',
                description: 'Legacy third-party plugin',
                keywords: ['talex-touch-plugin'],
                tuffPlugin: {
                  category: 'utilities',
                  icon: 'i-ri-tools-line',
                },
              },
            },
          ],
        },
      } as never)

      const list = await client.listNpmPlugins()
      expect(list).toHaveLength(2)
      expect(list[0]).toMatchObject({
        id: '@talex-touch/clipboard-history-plugin',
        name: 'clipboard-history',
        isOfficial: false,
        category: 'productivity',
        icon: 'i-ri-clipboard-line',
        packageUrl: undefined,
      })
      expect(list[1]).toMatchObject({
        id: 'tuff-plugin-legacy',
        name: 'legacy',
        isOfficial: false,
        category: 'utilities',
        icon: 'i-ri-tools-line',
      })
      expect(client.getInstallSource(list[0]!)).toBe('npm:@talex-touch/clipboard-history-plugin')
    })
  })
})
