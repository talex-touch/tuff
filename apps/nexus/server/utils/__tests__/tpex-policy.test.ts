import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { extractTpexMetadata, getTpexAdmissionFailure } from '../tpex'

const TAR_BLOCK_SIZE = 512

interface TarEntry {
  name: string
  content?: string
  type?: '0' | '1' | '2' | '3' | '4' | '5' | '6' | 'x'
}

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  const octal = value.toString(8).padStart(length - 1, '0')
  buffer.write(`${octal}\0`, start, length, 'ascii')
}

function createTarEntry({ name, content = '', type = '0' }: TarEntry): Buffer {
  const contentBuffer = Buffer.from(content)
  const header = Buffer.alloc(TAR_BLOCK_SIZE)
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, contentBuffer.length, 124, 12)
  writeOctal(header, 0, 136, 12)
  header.fill(' ', 148, 156)
  header.write(type, 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')

  let checksum = 0
  for (const byte of header)
    checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')

  const padding = Buffer.alloc((TAR_BLOCK_SIZE - (contentBuffer.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)
  return Buffer.concat([header, contentBuffer, padding])
}

function normalizedPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/')
}

function generateSignature(files: Record<string, string>): string {
  const ordered: Record<string, string> = {}
  for (const path of Object.keys(files).sort())
    ordered[path] = files[path] ?? ''
  return createHash('md5').update(JSON.stringify(ordered)).digest('base64')
}

function createTpex(
  entries: readonly TarEntry[],
  manifestOverrides: Record<string, unknown> = {},
): Buffer {
  const files: Record<string, string> = {}
  for (const entry of entries) {
    if ((entry.type ?? '0') !== '0') continue
    files[normalizedPath(entry.name)] = `sha256-${createHash('sha256').update(entry.content ?? '').digest('hex')}`
  }

  const manifest = {
    id: 'com.tuffex.policy-demo',
    name: 'policy-demo',
    version: '1.0.0',
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: ['clipboard.read'], optional: [] },
    _files: files,
    _signature: generateSignature(files),
    ...manifestOverrides,
  }

  return Buffer.concat([
    ...entries.map(createTarEntry),
    createTarEntry({ name: 'manifest.json', content: JSON.stringify(manifest) }),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

describe('TPEX package-policy admission', () => {
  it('admits an integrity-valid package with matching registry identity', async () => {
    const metadata = await extractTpexMetadata(
      createTpex([{ name: 'index.js', content: 'export default {}' }]),
      {
        pluginId: 'com.tuffex.policy-demo',
        pluginName: 'policy-demo',
        version: '1.0.0',
      },
    )

    expect(metadata.integrity).toEqual({ valid: true })
    expect(metadata.packagePolicy).toMatchObject({
      ok: true,
      identity: {
        id: 'com.tuffex.policy-demo',
        name: 'policy-demo',
        version: '1.0.0',
      },
    })
    expect(getTpexAdmissionFailure(metadata)).toBeNull()
  })

  it.each([
    ['a raw Windows backslash path', 'nested\\index.js'],
    ['a traversal path', '../escape.js'],
  ])('surfaces the policy code that rejects %s in preview admission', async (_name, path) => {
    const metadata = await extractTpexMetadata(createTpex([{ name: path, content: 'export default {}' }]))

    expect(metadata.integrity).toEqual({ valid: true })
    if (metadata.packagePolicy.ok)
      throw new Error('Expected the preview package to be rejected by policy.')

    expect(metadata.packagePolicy.violations[0]?.code).toBe('PLUGIN_PACKAGE_ENTRY_PATH_INVALID')
    expect(getTpexAdmissionFailure(metadata)).toEqual({
      code: 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID',
      reason: 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID at entries[0].path',
    })
  })

  it('rejects duplicate and case-colliding raw archive entries', async () => {
    const duplicate = await extractTpexMetadata(createTpex([
      { name: 'index.js', content: 'first' },
      { name: 'index.js', content: 'second' },
    ]))
    const collision = await extractTpexMetadata(createTpex([
      { name: 'index.js', content: 'first' },
      { name: 'Index.js', content: 'second' },
    ]))

    expect(duplicate.integrity).toEqual({ valid: true })
    expect(getTpexAdmissionFailure(duplicate)?.code).toBe('PLUGIN_PACKAGE_ENTRY_DUPLICATE')
    expect(collision.integrity).toEqual({ valid: true })
    expect(getTpexAdmissionFailure(collision)?.code).toBe('PLUGIN_PACKAGE_ENTRY_CASE_COLLISION')
  })

  it('rejects a symlink even when regular package content has valid integrity', async () => {
    const metadata = await extractTpexMetadata(createTpex([
      { name: 'index.js', content: 'export default {}' },
      { name: 'linked-index.js', type: '2' },
    ]))

    expect(metadata.integrity).toEqual({ valid: true })
    expect(getTpexAdmissionFailure(metadata)?.code).toBe('PLUGIN_PACKAGE_ENTRY_TYPE_DENIED')
  })

  it.each([
    ['plugin identity', { pluginId: 'com.tuffex.someone-else' }, 'PLUGIN_PACKAGE_EXPECTED_ID_MISMATCH'],
    ['version', { version: '2.0.0' }, 'PLUGIN_PACKAGE_EXPECTED_VERSION_MISMATCH'],
  ] as const)('rejects an expected %s mismatch before preview can proceed', async (_name, expected, code) => {
    const metadata = await extractTpexMetadata(
      createTpex([{ name: 'index.js', content: 'export default {}' }]),
      expected,
    )

    expect(metadata.integrity).toEqual({ valid: true })
    expect(getTpexAdmissionFailure(metadata)?.code).toBe(code)
  })

  it('rejects non-zero payload appended after the TAR terminator', async () => {
    const archive = Buffer.concat([
      createTpex([{ name: 'index.js', content: 'export default {}' }]),
      Buffer.from([0x7f, 0x01]),
    ])

    const metadata = await extractTpexMetadata(archive)

    expect(metadata.integrity).toEqual({ valid: true })
    if (metadata.packagePolicy.ok)
      throw new Error('Expected trailing non-zero bytes to be rejected by package policy.')

    const codes = metadata.packagePolicy.violations.map(violation => violation.code)
    expect(codes.some(code =>
      code === 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID'
      || code === 'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED',
    )).toBe(true)
  })
})
