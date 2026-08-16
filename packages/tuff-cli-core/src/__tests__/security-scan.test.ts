import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPluginSecurityScan,
  parseSecurityScanArgs,
  resolveSecurityScanWaivers,
  scanBuiltPluginPackage,
  SECURITY_WAIVERS_FILENAME,
} from '../security-scan'

const TAR_BLOCK_SIZE = 512
const fixtureRoots: string[] = []

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

function createTpex(source: string): Buffer {
  const fileHash = createHash('sha256').update(source).digest('hex')
  const files = { 'index.js': `sha256-${fileHash}` }
  const manifest = {
    id: 'com.tuffex.demo-plugin',
    name: 'demo-plugin',
    version: '1.0.0',
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    _files: files,
    _signature: createHash('md5').update(JSON.stringify(files)).digest('base64'),
  }
  return Buffer.concat([
    createTarEntry('index.js', source),
    createTarEntry('manifest.json', JSON.stringify(manifest)),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

async function createStagedTpex(source: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-security-scan-'))
  fixtureRoots.push(root)
  const buildDir = path.join(root, 'dist', 'build')
  const packagePath = path.join(buildDir, 'demo-plugin-1.0.0.tpex')
  const packageBytes = createTpex(source)
  await fs.ensureDir(buildDir)
  await fs.writeFile(packagePath, packageBytes)
  return { packageBytes, packagePath }
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map(root => fs.remove(root)))
})

describe('built plugin security scan', () => {
  it('passes a clean staged .tpex and ties its report to the artifact digest', async () => {
    const fixture = await createStagedTpex('export const ready = true')

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath })

    expect(report).toMatchObject({
      decision: 'passed',
      findings: [],
      artifactSha256: createHash('sha256').update(fixture.packageBytes).digest('hex'),
    })
    expect(() => assertPluginSecurityScan(report)).not.toThrow()
  })

  it('blocks a staged .tpex whose built code attempts a raw Electron escape', async () => {
    const fixture = await createStagedTpex('import { app } from "electron"')

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath })

    expect(report.decision).toBe('blocked')
    const rawRuntimeFinding = report.findings.find(
      finding => finding.code === 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE',
    )
    expect(rawRuntimeFinding?.location.path).toBe('index.js')
    expect(() => assertPluginSecurityScan(report)).toThrow('PLUGIN_SCAN_RAW_RUNTIME_ESCAPE')
  })
})

describe('security scan waivers', () => {
  async function writeWaiverFile(
    root: string,
    waivers: unknown,
    filename = SECURITY_WAIVERS_FILENAME,
  ) {
    const filePath = path.join(root, filename)
    await fs.writeJson(filePath, waivers)
    return filePath
  }

  function waiverFor(artifactSha256: string, ruleId: string) {
    return {
      id: 'waiver-raw-runtime',
      artifactSha256,
      ruleId,
      owner: 'platform-security',
      reason: 'Reviewed: bundled third-party runtime, tracked separately.',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
  }

  // `eval(` trips PLUGIN_SCAN_DYNAMIC_EXECUTION at `high`, which is the severity band waivers
  // are meant for. Critical findings are covered separately below — they are never waivable.
  const DYNAMIC_SOURCE = 'export const run = (code) => eval(code)'

  it('lets a named waiver unblock exactly the rule it covers', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const artifactSha256 = createHash('sha256').update(fixture.packageBytes).digest('hex')
    const waivers = [waiverFor(artifactSha256, 'PLUGIN_SCAN_DYNAMIC_EXECUTION')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.decision).not.toBe('blocked')
    expect(report.findings[0]?.waiver?.owner).toBe('platform-security')
    expect(() => assertPluginSecurityScan(report, waivers)).not.toThrow()
  })

  it('never waives a critical finding even with an exact match', async () => {
    const fixture = await createStagedTpex('import { app } from "electron"')
    const artifactSha256 = createHash('sha256').update(fixture.packageBytes).digest('hex')
    const waivers = [waiverFor(artifactSha256, 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.findings[0]?.severity).toBe('critical')
    expect(report.findings[0]?.waiver).toBeUndefined()
    expect(report.decision).toBe('blocked')
    expect(() => assertPluginSecurityScan(report, waivers)).toThrow(
      'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE',
    )
  })

  it('still blocks when the waiver names a different rule', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const artifactSha256 = createHash('sha256').update(fixture.packageBytes).digest('hex')
    const waivers = [waiverFor(artifactSha256, 'PLUGIN_SCAN_NATIVE_BINARY')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.decision).toBe('blocked')
    expect(() => assertPluginSecurityScan(report, waivers)).toThrow(
      'PLUGIN_SCAN_DYNAMIC_EXECUTION',
    )
  })

  it('still blocks when the waiver targets another artifact, and says the hash moved', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const waivers = [waiverFor('0'.repeat(64), 'PLUGIN_SCAN_DYNAMIC_EXECUTION')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.decision).toBe('blocked')
    expect(() => assertPluginSecurityScan(report, waivers)).toThrow(
      /targets a different artifact/,
    )
  })

  it('still blocks when the waiver has expired', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const artifactSha256 = createHash('sha256').update(fixture.packageBytes).digest('hex')
    const waivers = [{
      ...waiverFor(artifactSha256, 'PLUGIN_SCAN_DYNAMIC_EXECUTION'),
      expiresAt: '2020-01-01T00:00:00.000Z',
    }]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.decision).toBe('blocked')
  })

  it('reads the conventional waiver file from the plugin root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)
    await writeWaiverFile(root, [waiverFor('a'.repeat(64), 'PLUGIN_SCAN_DYNAMIC_EXECUTION')])

    expect(resolveSecurityScanWaivers({ root })).toHaveLength(1)
  })

  it('accepts the { waivers: [...] } envelope as well as a bare array', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)
    await writeWaiverFile(root, {
      waivers: [waiverFor('a'.repeat(64), 'PLUGIN_SCAN_DYNAMIC_EXECUTION')],
    })

    expect(resolveSecurityScanWaivers({ root })).toHaveLength(1)
  })

  it('returns no waivers when the plugin has no waiver file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)

    expect(resolveSecurityScanWaivers({ root })).toEqual([])
  })

  it('rejects an incomplete waiver instead of silently dropping it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)
    const { owner: _owner, ...incomplete } = waiverFor('a'.repeat(64), 'PLUGIN_SCAN_DYNAMIC_EXECUTION')
    await writeWaiverFile(root, [incomplete])

    expect(() => resolveSecurityScanWaivers({ root })).toThrow(/missing "owner"/)
  })

  it('rejects a waiver whose timestamps are not parseable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)
    await writeWaiverFile(root, [{
      ...waiverFor('a'.repeat(64), 'PLUGIN_SCAN_DYNAMIC_EXECUTION'),
      expiresAt: 'whenever',
    }])

    expect(() => resolveSecurityScanWaivers({ root })).toThrow(/invalid "expiresAt"/)
  })

  it('parses --waivers into an absolute path', () => {
    const parsed = parseSecurityScanArgs(['--waivers', 'waivers.json'], '/tmp/plugin')

    expect(parsed.waiversPath).toBe(path.resolve('/tmp/plugin', 'waivers.json'))
  })
})

describe('file-scoped security waivers', () => {
  const DYNAMIC_SOURCE = 'export const run = (code) => eval(code)'

  function fileWaiver(fileSha256: string, ruleId: string, extra: Record<string, unknown> = {}) {
    return {
      id: 'waiver-dynamic-exec',
      fileSha256,
      ruleId,
      owner: 'platform-security',
      reason: 'Reviewed: expression query is a documented feature of this plugin.',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ...extra,
    }
  }

  it('unblocks by file contents regardless of the artifact digest', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const fileSha256 = createHash('sha256').update(DYNAMIC_SOURCE).digest('hex')
    const waivers = [fileWaiver(fileSha256, 'PLUGIN_SCAN_DYNAMIC_EXECUTION')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.findings[0]?.waiver?.owner).toBe('platform-security')
    expect(report.decision).not.toBe('blocked')
  })

  it('stops applying once the waived file changes', async () => {
    const fixture = await createStagedTpex(`${DYNAMIC_SOURCE};// edited`)
    const staleSha = createHash('sha256').update(DYNAMIC_SOURCE).digest('hex')
    const waivers = [fileWaiver(staleSha, 'PLUGIN_SCAN_DYNAMIC_EXECUTION')]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.decision).toBe('blocked')
    expect(() => assertPluginSecurityScan(report, waivers)).toThrow(
      /targets different file contents/,
    )
  })

  it('matches nothing when the waiver declares no scope at all', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const { fileSha256: _dropped, ...unscoped } = fileWaiver('unused', 'PLUGIN_SCAN_DYNAMIC_EXECUTION')
    const waivers = [unscoped]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.findings[0]?.waiver).toBeUndefined()
    expect(report.decision).toBe('blocked')
  })

  it('requires both scopes to match when both are declared', async () => {
    const fixture = await createStagedTpex(DYNAMIC_SOURCE)
    const fileSha256 = createHash('sha256').update(DYNAMIC_SOURCE).digest('hex')
    const waivers = [fileWaiver(fileSha256, 'PLUGIN_SCAN_DYNAMIC_EXECUTION', {
      artifactSha256: '0'.repeat(64),
    })]

    const report = scanBuiltPluginPackage({ packagePath: fixture.packagePath, waivers })

    expect(report.findings[0]?.waiver).toBeUndefined()
    expect(report.decision).toBe('blocked')
  })

  it('rejects a waiver file entry that names no scope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-waivers-'))
    fixtureRoots.push(root)
    const { fileSha256: _dropped, ...unscoped } = fileWaiver('unused', 'PLUGIN_SCAN_DYNAMIC_EXECUTION')
    await fs.writeJson(path.join(root, SECURITY_WAIVERS_FILENAME), [unscoped])

    expect(() => resolveSecurityScanWaivers({ root })).toThrow(/needs "fileSha256"/)
  })
})
