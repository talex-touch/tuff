import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { extractTpexMetadata } from '../tpex'

const TAR_BLOCK_SIZE = 512

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  const octal = value.toString(8).padStart(length - 1, '0')
  buffer.write(`${octal}\0`, start, length, 'ascii')
}

function createTarEntry(name: string, content: Buffer): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE)
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, content.length, 124, 12)
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12)
  header.fill(' ', 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')

  let checksum = 0
  for (const byte of header)
    checksum += byte
  const checksumValue = checksum.toString(8).padStart(6, '0')
  header.write(`${checksumValue}\0 `, 148, 8, 'ascii')

  const padding = Buffer.alloc((TAR_BLOCK_SIZE - (content.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)
  return Buffer.concat([header, content, padding])
}

function generateSignature(filesObject: Record<string, string>) {
  const sortedObject: Record<string, string> = {}
  for (const key of Object.keys(filesObject).sort())
    sortedObject[key] = filesObject[key] ?? ''
  return createHash('md5').update(JSON.stringify(sortedObject)).digest('base64')
}

function createTpex(entries: Record<string, string>, options: { manifestPathSeparator?: '\\' | '/' } = {}) {
  const hashedEntries = { ...entries }
  const fileHashes: Record<string, string> = {}
  for (const [name, content] of Object.entries(hashedEntries)) {
    const manifestName = options.manifestPathSeparator === '\\' ? name.replace(/\//g, '\\') : name
    fileHashes[manifestName] = `sha256-${createHash('sha256').update(content).digest('hex')}`
  }

  const manifest = {
    id: 'com.test.demo',
    name: 'demo-plugin',
    version: '1.0.0',
    icon: 'assets/logo.svg',
    _files: fileHashes,
    _signature: generateSignature(fileHashes),
  }

  return Buffer.concat([
    ...Object.entries(hashedEntries).map(([name, content]) => createTarEntry(name, Buffer.from(content))),
    createTarEntry('key.talex', Buffer.from('local-key')),
    createTarEntry('manifest.json', Buffer.from(JSON.stringify(manifest))),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

describe('tpex metadata integrity', () => {
  it('accepts packages whose manifest hashes and signature match contents', async () => {
    const buffer = createTpex({
      'index.js': 'console.log("ok")',
      'assets/logo.svg': '<svg />',
      'README.md': '# Demo',
    })

    const metadata = await extractTpexMetadata(buffer)

    expect(metadata.integrity).toEqual({ valid: true })
    expect(metadata.manifest?.name).toBe('demo-plugin')
    expect(metadata.iconFileName).toBe('logo.svg')
    expect(metadata.readmeMarkdown).toBe('# Demo')
  })

  it('accepts legacy Windows packages whose manifest paths use backslashes', async () => {
    const buffer = createTpex({
      'index.js': 'console.log("ok")',
      'assets/logo.svg': '<svg />',
    }, { manifestPathSeparator: '\\' })

    const metadata = await extractTpexMetadata(buffer)

    expect(metadata.integrity).toEqual({ valid: true })
  })

  it('rejects packages whose file content no longer matches manifest._files', async () => {
    const buffer = createTpex({
      'index.js': 'console.log("ok")',
      'assets/logo.svg': '<svg />',
    })
    const tampered = Buffer.from(buffer)
    const marker = Buffer.from('console.log("ok")')
    const start = tampered.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    Buffer.from('console.log("xx")').copy(tampered, start)

    const metadata = await extractTpexMetadata(tampered)

    expect(metadata.integrity.valid).toBe(false)
    expect(metadata.integrity.reason).toContain('hash mismatch')
  })
})
