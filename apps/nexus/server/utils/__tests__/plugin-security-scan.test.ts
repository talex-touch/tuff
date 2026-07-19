import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  extractTpexMetadata,
  getTpexAdmissionFailure,
} from '../tpex'

const TAR_BLOCK_SIZE = 512

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
    id: 'com.tuffex.scan-demo',
    name: 'scan-demo',
    version: '1.0.0',
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

describe('TPEX authoritative security scan admission', () => {
  it('admits a clean, integrity-valid artifact', async () => {
    const metadata = await extractTpexMetadata(createTpex([
      { name: 'index.js', content: 'export const ready = true' },
    ]))

    expect(metadata.securityScan).toMatchObject({ decision: 'passed', findings: [] })
    expect(getTpexAdmissionFailure(metadata)).toBeNull()
  })

  it.each([
    ['raw runtime escape', 'escape.js', 'import { app } from "electron"', 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE'],
    ['secret material', 'secret.js', 'const api_key = "not-a-real-secret-value"', 'PLUGIN_SCAN_SECRET_MATERIAL'],
    ['native entry', 'native/addon.node', 'binary', 'PLUGIN_SCAN_NATIVE_BINARY'],
  ] as const)('rejects a %s from the artifact scan', async (_name, name, content, code) => {
    const metadata = await extractTpexMetadata(createTpex([{ name, content }]))

    expect(metadata.securityScan.decision).toBe('blocked')
    expect(getTpexAdmissionFailure(metadata)).toEqual({
      code,
      reason: `${code} at ${name}`,
    })
  })

  it('accepts only a valid server-provided waiver while retaining the waived finding', async () => {
    const artifact = createTpex([{ name: 'dynamic.js', content: 'eval("runtime")' }])
    const artifactSha256 = createHash('sha256').update(artifact).digest('hex')

    const metadata = await extractTpexMetadata(artifact, undefined, [{
      id: 'nexus-waiver-1',
      artifactSha256,
      ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      owner: 'nexus-security',
      reason: 'Approved compatibility exception',
      createdAt: '2026-07-17T12:00:00.000Z',
      expiresAt: '2026-07-19T12:00:00.000Z',
    }])

    expect(metadata.securityScan).toMatchObject({
      decision: 'passed',
      findings: [expect.objectContaining({
        code: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
        waiver: expect.objectContaining({ id: 'nexus-waiver-1', owner: 'nexus-security' }),
      })],
    })
    expect(getTpexAdmissionFailure(metadata)).toBeNull()
  })
})
