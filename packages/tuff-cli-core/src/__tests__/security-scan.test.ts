import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPluginSecurityScan,
  scanBuiltPluginPackage,
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
