import { describe, expect, it } from 'vitest'
import {
  PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_BYTES,
  PLUGIN_PACKAGE_MAX_ENTRY_COUNT,
  PLUGIN_PACKAGE_POLICY_VERSION,
  validatePluginPackagePolicy,
  type PluginPackageEntry,
  type PluginPackagePolicyInput,
  type PluginPackageViolationCode,
} from '../../plugin/package-policy'

const FILE_HASH = `sha256-${'a'.repeat(64)}`

const officialStyleManifest = {
  id: 'com.tuffex.dev-utils',
  name: 'touch-dev-utils',
  version: '1.0.0',
  sdkapi: 260428,
  category: 'utilities',
  permissions: {
    required: ['clipboard.write', 'search.root-results'],
    optional: [],
  },
}

function stagedManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...officialStyleManifest,
    _files: { 'index.js': FILE_HASH },
    _signature: 'test-signature',
    ...overrides,
  }
}

function stagedEntries(extra: readonly PluginPackageEntry[] = []): PluginPackageEntry[] {
  return [
    { path: 'index.js', type: 'file', size: 8 },
    { path: 'manifest.json', type: 'file', size: 128 },
    ...extra,
  ]
}

function violationCodes(input: PluginPackagePolicyInput): readonly PluginPackageViolationCode[] {
  const result = validatePluginPackagePolicy(input)
  if (result.ok)
    throw new Error('Expected package policy to reject the fixture.')
  return result.violations.map(violation => violation.code)
}

describe('plugin package policy', () => {
  it('accepts an official-style UI-only source manifest and normalizes its identity', () => {
    const result = validatePluginPackagePolicy({
      profile: 'source-manifest',
      manifest: officialStyleManifest,
    })

    expect(result).toEqual({
      ok: true,
      policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
      identity: {
        id: 'com.tuffex.dev-utils',
        name: 'touch-dev-utils',
        version: '1.0.0',
        sdkapi: 260428,
        category: 'utilities',
        permissions: ['clipboard.write', 'search.root-results'],
      },
    })
  })

  it.each([
    ['missing id', { id: undefined }, 'PLUGIN_PACKAGE_MANIFEST_ID_REQUIRED'],
    ['invalid id', { id: 'com.tuffex' }, 'PLUGIN_PACKAGE_MANIFEST_ID_INVALID'],
    ['missing name', { name: undefined }, 'PLUGIN_PACKAGE_MANIFEST_NAME_REQUIRED'],
    ['invalid name', { name: 'Touch Dev Utils' }, 'PLUGIN_PACKAGE_MANIFEST_NAME_INVALID'],
    ['missing version', { version: undefined }, 'PLUGIN_PACKAGE_MANIFEST_VERSION_REQUIRED'],
    ['invalid SemVer', { version: '1.0' }, 'PLUGIN_PACKAGE_MANIFEST_VERSION_INVALID'],
    ['missing sdkapi', { sdkapi: undefined }, 'PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE'],
    ['unsupported sdkapi', { sdkapi: 260421 }, 'PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE'],
    ['missing category at the category baseline', { category: undefined }, 'PLUGIN_PACKAGE_MANIFEST_CATEGORY_REQUIRED'],
    ['invalid category', { category: 'Dev Tools' }, 'PLUGIN_PACKAGE_MANIFEST_CATEGORY_INVALID'],
    ['malformed permissions', { permissions: { required: [42] } }, 'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID'],
    ['unknown permission', { permissions: { required: ['network.unrestricted'] } }, 'PLUGIN_PACKAGE_MANIFEST_PERMISSION_UNKNOWN'],
  ] as const)('rejects %s with a stable violation code', (_name, overrides, expectedCode) => {
    const codes = violationCodes({
      profile: 'source-manifest',
      manifest: { ...officialStyleManifest, ...overrides },
    })

    expect(codes).toContain(expectedCode)
  })

  it('accepts a staged package when packaged dev mode is explicitly disabled', () => {
    const result = validatePluginPackagePolicy({
      profile: 'staged-package',
      manifest: stagedManifest({ dev: { enable: false, source: false, address: '' } }),
      entries: stagedEntries(),
      archiveSize: 512,
    })

    expect(result).toEqual({
      ok: true,
      policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
      identity: {
        id: 'com.tuffex.dev-utils',
        name: 'touch-dev-utils',
        version: '1.0.0',
        sdkapi: 260428,
        category: 'utilities',
        permissions: ['clipboard.write', 'search.root-results'],
      },
      inventory: {
        archiveBytes: 512,
        entryCount: 2,
        expandedBytes: 136,
        paths: ['index.js', 'manifest.json'],
      },
    })
  })

  it.each([
    { enable: true, source: false, address: '' },
    { enable: false, source: true, address: '' },
    { enable: false, source: false, address: 'https://localhost:5173' },
  ])('rejects a staged package with enabled or remote dev mode: %o', (dev) => {
    const codes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest({ dev }),
      entries: stagedEntries(),
    })

    expect(codes).toContain('PLUGIN_PACKAGE_DEV_MODE_ENABLED')
  })

  it.each([
    '../escape.js',
    '/absolute.js',
    'C:\\package\\index.js',
    'nested\\index.js',
    'nul\0entry.js',
  ])('rejects unsafe archive entry paths: %j', (path) => {
    const codes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([{ path, type: 'file', size: 1 }]),
    })

    expect(codes).toContain('PLUGIN_PACKAGE_ENTRY_PATH_INVALID')
  })

  it('rejects exact duplicate and case-colliding archive paths', () => {
    const duplicateCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([{ path: 'index.js', type: 'file', size: 1 }]),
    })
    const collisionCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([{ path: 'Index.js', type: 'file', size: 1 }]),
    })

    expect(duplicateCodes).toContain('PLUGIN_PACKAGE_ENTRY_DUPLICATE')
    expect(collisionCodes).toContain('PLUGIN_PACKAGE_ENTRY_CASE_COLLISION')
  })

  it.each(['symlink', 'hardlink', 'device', 'fifo', 'other'] as const)(
    'rejects denied %s archive entries',
    (type) => {
      const codes = violationCodes({
        profile: 'staged-package',
        manifest: stagedManifest(),
        entries: stagedEntries([{ path: 'blocked', type, size: 0 }]),
      })

      expect(codes).toContain('PLUGIN_PACKAGE_ENTRY_TYPE_DENIED')
    },
  )

  it('requires exactly one root manifest entry', () => {
    const missingCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: [{ path: 'index.js', type: 'file', size: 8 }],
    })
    const duplicateCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([{ path: 'manifest.json', type: 'file', size: 128 }]),
    })

    expect(missingCodes).toContain('PLUGIN_PACKAGE_MANIFEST_ENTRY_MISSING')
    expect(duplicateCodes).toContain('PLUGIN_PACKAGE_MANIFEST_ENTRY_DUPLICATE')
  })

  it('enforces package count, file, expanded, and archive-size limits', () => {
    const countCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: Array.from({ length: PLUGIN_PACKAGE_MAX_ENTRY_COUNT + 1 }, (_, index) => ({
        path: `entry-${index}.js`,
        type: 'file' as const,
        size: 0,
      })),
    })
    const fileCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([{ path: 'large.js', type: 'file', size: PLUGIN_PACKAGE_MAX_ENTRY_BYTES + 1 }]),
    })
    const expandedCodes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest(),
      entries: stagedEntries([
        { path: 'large-a.js', type: 'file', size: PLUGIN_PACKAGE_MAX_ENTRY_BYTES },
        { path: 'large-b.js', type: 'file', size: PLUGIN_PACKAGE_MAX_ENTRY_BYTES },
      ]),
    })
    const archiveCodes = violationCodes({
      profile: 'registry-admission',
      manifest: stagedManifest(),
      entries: stagedEntries(),
      archiveSize: PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES + 1,
    })

    expect(countCodes).toContain('PLUGIN_PACKAGE_ENTRY_COUNT_EXCEEDED')
    expect(fileCodes).toContain('PLUGIN_PACKAGE_ENTRY_TOO_LARGE')
    expect(expandedCodes).toContain('PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED')
    expect(archiveCodes).toContain('PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED')
  })

  it('rejects package content that does not match manifest._files', () => {
    const codes = violationCodes({
      profile: 'staged-package',
      manifest: stagedManifest({ _files: { 'different.js': FILE_HASH } }),
      entries: stagedEntries(),
    })

    expect(codes).toContain('PLUGIN_PACKAGE_FILE_MAP_MISMATCH')
  })

  it('reports expected identity and version mismatches at registry admission', () => {
    const codes = violationCodes({
      profile: 'registry-admission',
      manifest: stagedManifest(),
      entries: stagedEntries(),
      expected: {
        pluginId: 'com.tuffex.other',
        pluginName: 'another-plugin',
        version: '2.0.0',
      },
    })

    expect(codes).toEqual(expect.arrayContaining([
      'PLUGIN_PACKAGE_EXPECTED_ID_MISMATCH',
      'PLUGIN_PACKAGE_EXPECTED_NAME_MISMATCH',
      'PLUGIN_PACKAGE_EXPECTED_VERSION_MISMATCH',
    ]))
  })

  it('orders manifest failures before later archive failures deterministically', () => {
    const result = validatePluginPackagePolicy({
      profile: 'staged-package',
      manifest: stagedManifest({ id: 'invalid' }),
      entries: stagedEntries([{ path: '../escape.js', type: 'file', size: 1 }]),
    })

    if (result.ok)
      throw new Error('Expected the invalid staged package to be rejected.')

    expect(result.violations[0]?.code).toBe('PLUGIN_PACKAGE_MANIFEST_ID_INVALID')
  })
})
