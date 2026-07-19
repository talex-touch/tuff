import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardPluginVersion } from '../pluginsStore'

import { extractTpexMetadata } from '../tpex'
import {
  createPlugin,
  publishPluginVersion,
  reeditPluginVersion,
} from '../pluginsStore'

const state = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  governanceEvents: [] as Array<Record<string, unknown>>,
  uploadPluginPackage: vi.fn(async () => ({
    key: 'plugin-packages/scan-demo.tpex',
    url: 'https://storage.example/plugin-packages/scan-demo.tpex',
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

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

vi.mock('../imageStorage', () => ({
  deleteImage: vi.fn(async () => undefined),
  uploadImageFromBuffer: vi.fn(async () => {
    throw new Error('The publish fixture must keep its existing icon.')
  }),
}))

vi.mock('../pluginPackageStorage', () => ({
  deletePluginPackage: state.deletePluginPackage,
  uploadPluginPackage: state.uploadPluginPackage,
}))

vi.mock('../pluginSecurityScanWaiverStore', () => ({
  listActivePluginSecurityScanWaivers: vi.fn(async () => []),
}))

vi.mock('../platformGovernanceStore', () => ({
  recordPlatformGovernanceEvent: vi.fn(async (_event: unknown, payload: Record<string, unknown>) => {
    state.governanceEvents.push(payload)
  }),
}))

vi.mock('../uploadGovernance', () => ({
  completeUploadGovernance: state.completeUploadGovernance,
  failUploadGovernance: state.failUploadGovernance,
  startUploadGovernance: state.startUploadGovernance,
}))

const TAR_BLOCK_SIZE = 512
const PLUGIN_ID = 'com.tuffex.scan-demo'
const OWNER_ID = 'scan-owner'
const VERSION = '1.0.0'
const event = { context: {} } as H3Event

interface TarEntry {
  name: string
  content: string
}

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  buffer.write(`${value.toString(8).padStart(length - 1, '0')}\0`, start, length, 'ascii')
}

function createTarEntry({ name, content }: TarEntry): Buffer {
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

function createTpex(entries: readonly TarEntry[]): Buffer {
  const files: Record<string, string> = {}
  for (const entry of entries)
    files[entry.name] = `sha256-${createHash('sha256').update(entry.content).digest('hex')}`
  const orderedFiles: Record<string, string> = {}
  for (const name of Object.keys(files).sort())
    orderedFiles[name] = files[name] ?? ''

  const manifest = {
    id: PLUGIN_ID,
    name: 'scan-demo',
    version: VERSION,
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    _files: files,
    _signature: createHash('md5').update(JSON.stringify(orderedFiles)).digest('base64'),
  }
  return Buffer.concat([
    ...entries.map(createTarEntry),
    createTarEntry({ name: 'manifest.json', content: JSON.stringify(manifest) }),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

function packageFile(archive: Buffer): File {
  const bytes = Uint8Array.from(archive)
  return {
    name: 'scan-demo.tpex',
    type: 'application/vnd.tuffex.plugin+tar',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

async function createPublishablePlugin() {
  return createPlugin(event, {
    userId: OWNER_ID,
    slug: PLUGIN_ID,
    name: 'Security Scan Demo',
    summary: 'Plugin fixture for authoritative scan admission.',
    category: 'utilities',
    readmeMarkdown: '# Security Scan Demo',
    iconKey: 'plugin-icons/existing.svg',
    iconUrl: 'https://storage.example/plugin-icons/existing.svg',
  })
}

async function expectedScanSummary(archive: Buffer) {
  const report = (await extractTpexMetadata(archive, {
    pluginId: PLUGIN_ID,
    version: VERSION,
  })).securityScan
  return {
    securityScanDecision: report.decision,
    securityScanReportDigest: createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    securityScannerVersion: report.scannerVersion,
    securityRuleSetVersion: report.ruleSetVersion,
    securityScanFindingCount: report.findings.length,
    securityScanCompletedAt: report.completedAt,
    report,
  }
}

beforeEach(() => {
  state.storage.clear()
  state.governanceEvents.length = 0
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pluginsStore Security Scan publish and re-edit admission', () => {
  it('persists every clean scan summary field and emits sanitized completed governance metadata', async () => {
    const plugin = await createPublishablePlugin()
    const archive = createTpex([{ name: 'index.js', content: 'export const ready = true' }])
    const expected = await expectedScanSummary(archive)

    const published = await publishPluginVersion(event, {
      pluginId: plugin.id,
      channel: 'RELEASE',
      version: VERSION,
      changelog: 'Initial release.',
      packageFile: packageFile(archive),
      createdBy: OWNER_ID,
    })

    const summary = {
      securityScanDecision: expected.securityScanDecision,
      securityScanReportDigest: expected.securityScanReportDigest,
      securityScannerVersion: expected.securityScannerVersion,
      securityRuleSetVersion: expected.securityRuleSetVersion,
      securityScanFindingCount: expected.securityScanFindingCount,
      securityScanCompletedAt: expected.securityScanCompletedAt,
    }
    expect(published).toMatchObject(summary)
    expect(state.storage.get('dashboard:pluginVersions')).toEqual([
      expect.objectContaining(summary),
    ])

    const resourceId = `plugin:${plugin.id}:version:release:${VERSION}`
    expect(state.governanceEvents).toEqual([
      expect.objectContaining({
        scope: 'plugin-security-scan',
        action: 'scan.started',
        actorId: OWNER_ID,
        resourceType: 'plugin-package',
        resourceId,
        metadata: { pluginId: PLUGIN_ID, version: VERSION },
      }),
      expect.objectContaining({
        scope: 'plugin-security-scan',
        action: 'scan.completed',
        actorId: OWNER_ID,
        resourceType: 'plugin-package',
        resourceId,
        metadata: {
          artifactSha256: expected.report.artifactSha256,
          decision: 'passed',
          scannerVersion: expected.report.scannerVersion,
          ruleSetVersion: expected.report.ruleSetVersion,
          findingCount: 0,
          failureCode: null,
        },
      }),
    ])
  })

  it('blocks a secret finding before package upload or version persistence and keeps governance metadata redacted', async () => {
    const plugin = await createPublishablePlugin()
    const matchedSecret = 'not-a-real-secret-value'
    const source = `const api_key = "${matchedSecret}"`
    const archive = createTpex([{ name: 'secret.js', content: source }])
    const expected = await expectedScanSummary(archive)

    await expect(publishPluginVersion(event, {
      pluginId: plugin.id,
      channel: 'RELEASE',
      version: VERSION,
      changelog: 'Initial release.',
      packageFile: packageFile(archive),
      createdBy: OWNER_ID,
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('PLUGIN_SCAN_SECRET_MATERIAL'),
    })

    expect(state.uploadPluginPackage).not.toHaveBeenCalled()
    expect(state.storage.get('dashboard:pluginVersions')).toBeUndefined()
    expect(state.governanceEvents).toEqual([
      expect.objectContaining({ action: 'scan.started' }),
      expect.objectContaining({
        scope: 'plugin-security-scan',
        action: 'scan.blocked',
        metadata: {
          artifactSha256: expected.report.artifactSha256,
          decision: 'blocked',
          scannerVersion: expected.report.scannerVersion,
          ruleSetVersion: expected.report.ruleSetVersion,
          findingCount: 1,
          failureCode: null,
        },
      }),
    ])

    const governancePayload = JSON.stringify(state.governanceEvents)
    expect(governancePayload).not.toContain(matchedSecret)
    expect(governancePayload).not.toContain(source)
    expect(governancePayload).not.toContain('"source"')
  })

  it('refreshes a rejected version with the replacement package scan summary', async () => {
    const plugin = await createPublishablePlugin()
    const rejected: DashboardPluginVersion = {
      id: 'rejected-version',
      pluginId: plugin.id,
      createdBy: OWNER_ID,
      channel: 'RELEASE',
      version: VERSION,
      signature: 'old-signature',
      packageKey: 'plugin-packages/rejected.tpex',
      packageUrl: 'https://storage.example/plugin-packages/rejected.tpex',
      packageSize: 1,
      iconKey: 'plugin-icons/existing.svg',
      iconUrl: 'https://storage.example/plugin-icons/existing.svg',
      readmeMarkdown: '# Rejected package',
      manifest: { id: PLUGIN_ID, version: VERSION },
      changelog: 'Rejected release.',
      status: 'rejected',
      reviewedAt: '2026-07-17T12:00:00.000Z',
      rejectReason: 'Needs a clean package.',
      securityScanDecision: 'blocked',
      securityScanReportDigest: 'stale-report-digest',
      securityScannerVersion: 'stale-scanner',
      securityRuleSetVersion: 'stale-rules',
      securityScanFindingCount: 4,
      securityScanCompletedAt: '2026-07-17T12:00:00.000Z',
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    }
    state.storage.set('dashboard:pluginVersions', [rejected])

    const archive = createTpex([{ name: 'index.js', content: 'export const repaired = true' }])
    const expected = await expectedScanSummary(archive)
    const reedited = await reeditPluginVersion(event, {
      pluginId: plugin.id,
      versionId: rejected.id,
      packageFile: packageFile(archive),
      changelog: 'Replaced rejected package with a clean artifact.',
      updatedBy: OWNER_ID,
    })

    const summary = {
      securityScanDecision: expected.securityScanDecision,
      securityScanReportDigest: expected.securityScanReportDigest,
      securityScannerVersion: expected.securityScannerVersion,
      securityRuleSetVersion: expected.securityRuleSetVersion,
      securityScanFindingCount: expected.securityScanFindingCount,
      securityScanCompletedAt: expected.securityScanCompletedAt,
    }
    expect(reedited).toMatchObject({ status: 'pending', rejectReason: null, ...summary })
    expect(state.storage.get('dashboard:pluginVersions')).toEqual([
      expect.objectContaining({ id: rejected.id, status: 'pending', rejectReason: null, ...summary }),
    ])
  })
})
