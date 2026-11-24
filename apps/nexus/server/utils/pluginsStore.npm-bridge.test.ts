import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import {
  PLUGIN_SIGNING_ALGORITHM,
  PLUGIN_SIGNING_CONTRACT,
  serializePluginFileMap,
  serializePluginSigningPayload,
} from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'
import { extractTpexMetadata } from './tpex'

const state = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  uploadPluginPackage: vi.fn(async () => ({
    key: 'plugin-packages/npm-bridge.tpex',
    url: 'https://storage.example/plugin-packages/npm-bridge.tpex',
    size: 1024,
    contentType: 'application/vnd.tuffex.plugin+tar',
    storageChannel: 'memory',
    storageProvider: 'memory',
  })),
  deletePluginPackage: vi.fn(async () => undefined),
  startUploadGovernance: vi.fn(async () => ({ id: 'upload-attempt' })),
  completeUploadGovernance: vi.fn(async () => undefined),
  failUploadGovernance: vi.fn(async () => undefined),
}))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async <T>(key: string) => (state.storage.get(key) as T | undefined) ?? null,
    setItem: async (key: string, value: unknown) => {
      state.storage.set(key, value)
    },
  }),
}))

vi.mock('./imageStorage', () => ({
  deleteImage: vi.fn(async () => undefined),
  uploadImageFromBuffer: vi.fn(async () => {
    throw new Error('Fixture keeps existing plugin icon.')
  }),
}))

vi.mock('./pluginPackageStorage', () => ({
  deletePluginPackage: state.deletePluginPackage,
  uploadPluginPackage: state.uploadPluginPackage,
}))

vi.mock('./pluginSecurityScanWaiverStore', () => ({
  listActivePluginSecurityScanWaivers: vi.fn(async () => []),
}))

vi.mock('./platformGovernanceStore', () => ({
  recordPlatformGovernanceEvent: vi.fn(async () => undefined),
}))

vi.mock('./uploadGovernance', () => ({
  completeUploadGovernance: state.completeUploadGovernance,
  failUploadGovernance: state.failUploadGovernance,
  startUploadGovernance: state.startUploadGovernance,
}))

const TAR_BLOCK_SIZE = 512
const OWNER_ID = 'npm-bridge-owner'
const PLUGIN_SLUG = 'com.tuffex.clipboard-history'
const VERSION = '1.2.0'
const AT = '2026-10-01T00:00:00.000Z'
const VALID_SRI = `sha512-${createHash('sha512').update('dual-published-npm-tgz').digest('base64')}`
const VALID_TARBALL_SHA256 = createHash('sha256').update('dual-published-npm-tgz').digest('hex')

const publisherKeys = generateKeyPairSync('ed25519')
const publisherPublicKeyPem = publisherKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const PUBLISHER_KEY_ID = 'npm-bridge-publisher-key'

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  buffer.write(`${value.toString(8).padStart(length - 1, '0')}\0`, start, length, 'ascii')
}

function createTarEntry(name: string, content: string): Buffer {
  const contentBuffer = Buffer.from(content)
  const header = Buffer.alloc(TAR_BLOCK_SIZE)
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, contentBuffer.length, 124, 12)
  header.fill(' ', 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header)
    checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  const padding = Buffer.alloc((TAR_BLOCK_SIZE - (contentBuffer.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)
  return Buffer.concat([header, contentBuffer, padding])
}

function createTpex(version = VERSION): Buffer {
  const entries = [{ name: 'index.js', content: 'export const ready = true' }]
  const files: Record<string, string> = {}
  for (const entry of entries)
    files[entry.name] = `sha256-${createHash('sha256').update(entry.content).digest('hex')}`
  const manifest = {
    id: PLUGIN_SLUG,
    name: 'clipboard-history',
    version,
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    _files: files,
    _signature: createHash('md5').update(JSON.stringify(files)).digest('base64'),
  }
  return Buffer.concat([
    ...entries.map(entry => createTarEntry(entry.name, entry.content)),
    createTarEntry('manifest.json', JSON.stringify(manifest)),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

function packageFile(archive: Buffer): File {
  const bytes = Uint8Array.from(archive)
  return {
    name: `${PLUGIN_SLUG}.tpex`,
    type: 'application/vnd.tuffex.plugin+tar',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

async function publisherSigningInput(archive: Buffer, version = VERSION) {
  const metadata = await extractTpexMetadata(archive, { pluginId: PLUGIN_SLUG, version })
  const manifest = metadata.manifest as Record<string, unknown>
  const fileMap = manifest._files as Record<string, string>
  const issuedAt = new Date().toISOString()

  const payload = {
    contract: PLUGIN_SIGNING_CONTRACT,
    policyVersion: metadata.packagePolicy.policyVersion,
    pluginId: PLUGIN_SLUG,
    pluginName: String(manifest.name),
    version,
    channel: 'RELEASE' as const,
    artifactSha256: createHash('sha256').update(archive).digest('hex'),
    artifactSize: archive.length,
    fileMapSha256: createHash('sha256').update(serializePluginFileMap(fileMap)).digest('hex'),
    issuedAt,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
  const bytes = Buffer.from(serializePluginSigningPayload(payload), 'utf8')

  return {
    publisherSignature: {
      algorithm: PLUGIN_SIGNING_ALGORITHM,
      keyId: PUBLISHER_KEY_ID,
      payload,
      payloadSha256: createHash('sha256').update(bytes).digest('hex'),
      signature: sign(null, bytes, publisherKeys.privateKey).toString('base64'),
    },
    publisherPublicKey: publisherPublicKeyPem,
    publisherKeyValidFrom: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  }
}

let store: typeof import('./pluginsStore')
let d1: SqliteD1Database

function d1Event(): H3Event {
  return { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
}

function memoryEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  state.storage.clear()
  store = await import('./pluginsStore')
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
})

describe('pluginsStore NPM cross-link bridge', () => {
  it('safely migrates legacy D1 tables without npm columns and preserves backward compatibility', async () => {
    // Seed pre-migration tables without npm_package_name / npm_registry / npm_integrity / npm_tarball_sha256.
    d1.sqlite.exec(`
      CREATE TABLE dashboard_plugins (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        owner_org_id TEXT,
        name TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        artifact_type TEXT NOT NULL DEFAULT 'plugin',
        installs INTEGER NOT NULL DEFAULT 0,
        homepage TEXT,
        icon TEXT,
        image_url TEXT,
        last_updated TEXT,
        version TEXT,
        is_official INTEGER NOT NULL DEFAULT 0,
        badges TEXT NOT NULL,
        author TEXT,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft',
        readme_markdown TEXT,
        icon_key TEXT,
        icon_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        latest_version_id TEXT
      );
      CREATE TABLE dashboard_plugin_versions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        signature TEXT NOT NULL,
        artifact_sha256 TEXT,
        publisher_signature TEXT,
        publisher_key TEXT,
        publisher_key_id TEXT,
        publisher_verified_at TEXT,
        nexus_attestation TEXT,
        admission_status TEXT NOT NULL DEFAULT 'pending',
        policy_decision TEXT NOT NULL DEFAULT 'not-evaluated',
        artifact_state TEXT NOT NULL DEFAULT 'available',
        revoked_at TEXT,
        eligibility_revision INTEGER NOT NULL DEFAULT 0,
        eligibility_evaluated_at TEXT,
        eligibility_reasons TEXT,
        package_key TEXT NOT NULL,
        package_url TEXT NOT NULL,
        package_size INTEGER NOT NULL,
        icon_key TEXT NOT NULL,
        icon_url TEXT NOT NULL,
        readme_markdown TEXT,
        manifest TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_at TEXT,
        reject_reason TEXT,
        security_scan_decision TEXT,
        security_scan_report_digest TEXT,
        security_scanner_version TEXT,
        security_rule_set_version TEXT,
        security_scan_finding_count INTEGER,
        security_scan_completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugins (id, user_id, name, summary, category, badges, author, slug, status, readme_markdown, icon_url, created_at, updated_at)
      VALUES ('legacy-1', 'owner-1', 'Legacy Plugin', 'Pre-npm plugin', 'utilities', '[]', '{"name":"Talex"}', 'legacy-plugin', 'approved', '# Legacy', '/icon.png', ?, ?)
    `).run(AT, AT)
    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugin_versions (
        id, plugin_id, created_by, channel, version, signature, artifact_sha256,
        publisher_signature, publisher_key, publisher_key_id, publisher_verified_at, nexus_attestation,
        admission_status, policy_decision, artifact_state, package_key, package_url, package_size,
        icon_key, icon_url, manifest, notes, status, security_scan_decision, created_at, updated_at
      ) VALUES ('legacy-v1', 'legacy-1', 'owner-1', 'RELEASE', '1.0.0', 'sig', ?, ?, ?, 'key-1', ?, ?, 'eligible', 'passed', 'available',
        'legacy.tpex', '/pkg/legacy.tpex', 512, 'icon', '/icon.png', '{"name":"legacy-plugin"}', 'Initial', 'approved', 'passed', ?, ?)
    `).run(
      'a'.repeat(64),
      JSON.stringify({ payload: { policyVersion: 'v1' } }),
      JSON.stringify({ keyId: 'key-1' }),
      AT,
      JSON.stringify({ issuer: 'nexus' }),
      AT,
      AT,
    )

    const listing = await store.listStorePlugins(d1Event())
    expect(listing.total).toBe(1)
    expect(listing.plugins[0]).toMatchObject({
      slug: 'legacy-plugin',
      npmPackageName: null,
      npmRegistry: null,
      latestVersion: {
        id: 'legacy-v1',
        npmPackageName: null,
        npmRegistry: null,
        npmIntegrity: null,
        npmTarballSha256: null,
      },
    })

    const pluginCols = (d1.sqlite.prepare('PRAGMA table_info(dashboard_plugins)').all() as Array<{ name: string }>).map(row => row.name)
    const versionCols = (d1.sqlite.prepare('PRAGMA table_info(dashboard_plugin_versions)').all() as Array<{ name: string }>).map(row => row.name)
    expect(pluginCols).toEqual(expect.arrayContaining(['npm_package_name', 'npm_registry']))
    expect(versionCols).toEqual(expect.arrayContaining(['npm_package_name', 'npm_registry', 'npm_integrity', 'npm_tarball_sha256']))
  })

  it.each([
    ['D1 SQLite', () => d1Event()],
    ['memory fallback', () => memoryEvent()],
  ])('persists, updates, clears, and searches plugin npm metadata in %s', async (_label, getEvent) => {
    const event = getEvent()
    const created = await store.createPlugin(event, {
      userId: OWNER_ID,
      slug: PLUGIN_SLUG,
      name: 'Clipboard History',
      summary: 'Clipboard manager plugin.',
      category: 'utilities',
      readmeMarkdown: '# Clipboard History',
      iconKey: 'plugin-icons/clipboard.svg',
      iconUrl: 'https://storage.example/clipboard.svg',
      npmPackageName: ' @talex-touch/clipboard-history-plugin ',
      npmRegistry: 'https://npm.pkg.github.com///',
    })

    expect(created).toMatchObject({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com',
    })

    const fetched = await store.getPluginBySlug(event, PLUGIN_SLUG)
    expect(fetched).toMatchObject({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com',
    })

    // Unrelated update preserves existing npm metadata.
    const kept = await store.updatePlugin(event, created.id, { summary: 'Updated summary.' })
    expect(kept).toMatchObject({
      summary: 'Updated summary.',
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com',
    })

    // Explicit null clears npm fields cleanly.
    const cleared = await store.updatePlugin(event, created.id, {
      npmPackageName: null,
      npmRegistry: null,
    })
    expect(cleared).toMatchObject({
      npmPackageName: null,
      npmRegistry: null,
    })
  })

  it('rejects invalid npm package name and registry on createPlugin and updatePlugin', async () => {
    const event = d1Event()
    await expect(store.createPlugin(event, {
      userId: OWNER_ID,
      slug: PLUGIN_SLUG,
      name: 'Clipboard History',
      summary: 'Clipboard manager plugin.',
      category: 'utilities',
      readmeMarkdown: '# Clipboard History',
      npmPackageName: 'INVALID_UPPERCASE',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('NPM_PACKAGE_NAME_INVALID'),
    })

    await expect(store.createPlugin(event, {
      userId: OWNER_ID,
      slug: PLUGIN_SLUG,
      name: 'Clipboard History',
      summary: 'Clipboard manager plugin.',
      category: 'utilities',
      readmeMarkdown: '# Clipboard History',
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'http://registry.npmjs.org',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('NPM_REGISTRY_URL_INVALID'),
    })

    const created = await store.createPlugin(event, {
      userId: OWNER_ID,
      slug: PLUGIN_SLUG,
      name: 'Clipboard History',
      summary: 'Clipboard manager plugin.',
      category: 'utilities',
      readmeMarkdown: '# Clipboard History',
    })

    await expect(store.updatePlugin(event, created.id, {
      npmRegistry: 'http://localhost:4873',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('NPM_REGISTRY_URL_INVALID'),
    })
  })

  it.each([
    ['D1 SQLite', () => d1Event()],
    ['memory fallback', () => memoryEvent()],
  ])('persists version npm provenance on publish and reedit, and rejects invalid metadata before upload in %s', async (_label, getEvent) => {
    const event = getEvent()
    const plugin = await store.createPlugin(event, {
      userId: OWNER_ID,
      slug: PLUGIN_SLUG,
      name: 'Clipboard History',
      summary: 'Clipboard manager plugin.',
      category: 'utilities',
      readmeMarkdown: '# Clipboard History',
      iconKey: 'plugin-icons/clipboard.svg',
      iconUrl: 'https://storage.example/clipboard.svg',
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://registry.npmjs.org',
    })

    const archive = createTpex(VERSION)
    const signing = await publisherSigningInput(archive, VERSION)

    // Invalid registry fails before upload governance or package upload runs.
    await expect(store.publishPluginVersion(event, {
      pluginId: plugin.id,
      channel: 'RELEASE',
      version: VERSION,
      changelog: 'Initial dual release',
      packageFile: packageFile(archive),
      ...signing,
      createdBy: OWNER_ID,
      npmRegistry: 'http://evil.invalid',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('NPM_REGISTRY_URL_INVALID'),
    })
    expect(state.uploadPluginPackage).not.toHaveBeenCalled()

    // Invalid integrity fails before upload.
    await expect(store.publishPluginVersion(event, {
      pluginId: plugin.id,
      channel: 'RELEASE',
      version: VERSION,
      changelog: 'Initial dual release',
      packageFile: packageFile(archive),
      ...signing,
      createdBy: OWNER_ID,
      npmIntegrity: 'md5-weak',
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('NPM_INTEGRITY_INVALID'),
    })
    expect(state.uploadPluginPackage).not.toHaveBeenCalled()

    const published = await store.publishPluginVersion(event, {
      pluginId: plugin.id,
      channel: 'RELEASE',
      version: VERSION,
      changelog: 'Initial dual release',
      packageFile: packageFile(archive),
      ...signing,
      createdBy: OWNER_ID,
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://registry.npmjs.org/',
      npmIntegrity: VALID_SRI,
      npmTarballSha256: VALID_TARBALL_SHA256.toUpperCase(),
    })

    expect(published).toMatchObject({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://registry.npmjs.org',
      npmIntegrity: VALID_SRI,
      npmTarballSha256: VALID_TARBALL_SHA256,
    })

    const loaded = await store.getPluginBySlug(event, PLUGIN_SLUG, { includeVersions: true, viewerIsAdmin: true })
    expect(loaded?.versions?.[0]).toMatchObject({
      id: published.id,
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://registry.npmjs.org',
      npmIntegrity: VALID_SRI,
      npmTarballSha256: VALID_TARBALL_SHA256,
    })

    // Mark rejected and re-edit with updated tarball digest.
    await store.setPluginVersionStatus(event, plugin.id, published.id, 'rejected', {
      actorId: 'admin-1',
      actorRole: 'admin',
      reason: 'Re-upload with new tarball digest',
    })
    const updatedSha256 = 'f'.repeat(64)
    const reedited = await store.reeditPluginVersion(event, {
      pluginId: plugin.id,
      versionId: published.id,
      packageFile: packageFile(archive),
      ...signing,
      changelog: 'Re-published tarball',
      updatedBy: OWNER_ID,
      npmTarballSha256: updatedSha256,
    })

    expect(reedited).toMatchObject({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://registry.npmjs.org',
      npmIntegrity: VALID_SRI,
      npmTarballSha256: updatedSha256,
    })
  })

  it('includes npm columns in lean listStorePlugins queries and supports searching by npmPackageName', async () => {
    // Initialize schema via a benign read.
    await store.getPluginBySlug(d1Event(), 'warm-up')

    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugins (
        id, user_id, name, summary, category, is_official, badges, author, slug, status,
        readme_markdown, icon_url, npm_package_name, npm_registry, created_at, updated_at
      ) VALUES (
        'plugin-dual', 'owner-1', 'Clipboard History', 'Clipboard manager', 'utilities', 1,
        '["official"]', '{"name":"Talex"}', 'clipboard-history', 'approved',
        '# Clipboard', '/icon.png', '@talex-touch/clipboard-history-plugin', 'https://npm.pkg.github.com', ?, ?
      )
    `).run(AT, AT)

    d1.sqlite.prepare(`
      INSERT INTO dashboard_plugin_versions (
        id, plugin_id, created_by, channel, version, signature, artifact_sha256,
        publisher_signature, publisher_key, publisher_key_id, publisher_verified_at, nexus_attestation,
        admission_status, policy_decision, artifact_state, package_key, package_url, package_size,
        icon_key, icon_url, manifest, notes, status, security_scan_decision,
        npm_package_name, npm_registry, npm_integrity, npm_tarball_sha256, created_at, updated_at
      ) VALUES (
        'ver-dual-1', 'plugin-dual', 'owner-1', 'RELEASE', '1.2.0', 'sig', ?,
        ?, ?, 'key-1', ?, ?, 'eligible', 'passed', 'available', 'dual.tpex', '/pkg/dual.tpex', 2048,
        'icon', '/icon.png', '{"name":"clipboard-history","sdkapi":261011}', 'Dual release', 'approved', 'passed',
        '@talex-touch/clipboard-history-plugin', 'https://npm.pkg.github.com', ?, ?, ?, ?
      )
    `).run(
      'a'.repeat(64),
      JSON.stringify({ payload: { policyVersion: 'v1' } }),
      JSON.stringify({ keyId: 'key-1' }),
      AT,
      JSON.stringify({ issuer: 'tuff-nexus' }),
      VALID_SRI,
      VALID_TARBALL_SHA256,
      AT,
      AT,
    )

    const listed = await store.listStorePlugins(d1Event())
    expect(listed.total).toBe(1)
    expect(listed.plugins[0]).toMatchObject({
      slug: 'clipboard-history',
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com',
      latestVersion: {
        id: 'ver-dual-1',
        npmPackageName: '@talex-touch/clipboard-history-plugin',
        npmRegistry: 'https://npm.pkg.github.com',
        npmIntegrity: VALID_SRI,
        npmTarballSha256: VALID_TARBALL_SHA256,
      },
    })

    const searched = await store.searchStorePlugins(d1Event(), {
      keyword: '@talex-touch/clipboard-history-plugin',
    })
    expect(searched.total).toBe(1)
    expect(searched.plugins[0]?.slug).toBe('clipboard-history')
  })
})
