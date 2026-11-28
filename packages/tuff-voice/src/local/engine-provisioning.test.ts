import type { Buffer } from 'node:buffer'
import type { SpeechRuntimeEntryV1 } from './model-catalog'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSpeechRuntime, SpeechRuntimeInstallError } from './engine-provisioning'

const execFileAsync = promisify(execFile)
const createdDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function makeArchiveFetch(archiveBytes: Buffer): typeof fetch {
  return vi.fn(async () => new Response(new Uint8Array(archiveBytes), {
    status: 200,
    headers: { 'content-length': String(archiveBytes.byteLength) },
  })) as unknown as typeof fetch
}

function baseEntry(overrides: Partial<SpeechRuntimeEntryV1> = {}): SpeechRuntimeEntryV1 {
  return {
    id: 'sherpa-onnx',
    version: '1.13.8',
    platform: 'darwin-arm64',
    bytes: 64,
    sha256: 'a'.repeat(64),
    url: 'https://cdn.example.test/runtime.tar.gz',
    archive: 'tar.gz',
    binary: 'bin/sherpa-onnx-offline',
    ...overrides,
  }
}

const publicLookup = async () => [{ address: '93.184.216.34' }]

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('engine-provisioning archive security & validation', () => {
  it('rejects invalid id, version, non-positive bytes, unsafe URLs, and loopback redirects upfront', async () => {
    const root = await makeTempDir('tuff-rt-invalid-')

    await expect(
      installSpeechRuntime(baseEntry({ id: '../evil' as never }), { root, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    await expect(
      installSpeechRuntime(baseEntry({ version: '../1.0.0' }), { root, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    await expect(
      installSpeechRuntime(baseEntry({ bytes: 0 }), { root, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    await expect(
      installSpeechRuntime(baseEntry({ bytes: -10 }), { root, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    await expect(
      installSpeechRuntime(baseEntry({ url: 'http://127.0.0.1/runtime.tar.gz' }), { root, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    // Redirect to loopback must be blocked by safeFetchWithRedirects.
    const redirectFetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/evil.tar.gz' },
    })) as unknown as typeof fetch

    await expect(
      installSpeechRuntime(baseEntry(), { root, fetchImpl: redirectFetch, lookup: publicLookup }),
    ).rejects.toBeInstanceOf(SpeechRuntimeInstallError)
  })

  it('installs valid tar.gz and zip archives into the runtime store', async () => {
    const work = await makeTempDir('tuff-rt-valid-')
    const src = join(work, 'src')
    const binDir = join(src, 'release-v1', 'bin')
    await mkdir(binDir, { recursive: true })
    const binPath = join(binDir, 'sherpa-onnx-offline')
    await writeFile(binPath, '#!/bin/sh\necho ok\n', 'utf8')
    await chmod(binPath, 0o755)

    // 1. Valid tar.gz
    const tgzPath = join(work, 'valid.tar.gz')
    await execFileAsync('tar', ['-czf', tgzPath, '-C', src, 'release-v1'])
    const tgzBytes = await readFile(tgzPath)
    const tgzRoot = await makeTempDir('tuff-rt-tgz-root-')
    const tgzInstalled = await installSpeechRuntime(
      baseEntry({
        archive: 'tar.gz',
        bytes: tgzBytes.byteLength,
        sha256: sha256(tgzBytes),
      }),
      { root: tgzRoot, fetchImpl: makeArchiveFetch(tgzBytes), lookup: publicLookup },
    )
    expect(tgzInstalled.downloaded).toBe(true)
    expect(tgzInstalled.binaryPath).toBe(join(tgzRoot, 'sherpa-onnx', '1.13.8', 'release-v1', 'bin', 'sherpa-onnx-offline'))

    // 2. Valid zip (on POSIX hosts with zip/unzip)
    if (process.platform !== 'win32') {
      const zipPath = join(work, 'valid.zip')
      await execFileAsync('zip', ['-q', '-r', zipPath, 'release-v1'], { cwd: src })
      const zipBytes = await readFile(zipPath)
      const zipRoot = await makeTempDir('tuff-rt-zip-root-')
      const zipInstalled = await installSpeechRuntime(
        baseEntry({
          archive: 'zip',
          url: 'https://cdn.example.test/runtime.zip',
          bytes: zipBytes.byteLength,
          sha256: sha256(zipBytes),
        }),
        { root: zipRoot, fetchImpl: makeArchiveFetch(zipBytes), lookup: publicLookup },
      )
      expect(zipInstalled.downloaded).toBe(true)
      expect(zipInstalled.binaryPath).toBe(join(zipRoot, 'sherpa-onnx', '1.13.8', 'release-v1', 'bin', 'sherpa-onnx-offline'))
    }
  })

  it('rejects symlink, hardlink, .extract, runtime.json, traversal, and absolute entries BEFORE extraction', async () => {
    if (process.platform === 'win32')
      return

    const work = await makeTempDir('tuff-rt-malicious-')

    // Case A: Symlink inside tar.gz
    const symSrc = join(work, 'sym-src')
    await mkdir(join(symSrc, 'bin'), { recursive: true })
    await writeFile(join(symSrc, 'bin', 'real'), 'x')
    await symlink('/etc/passwd', join(symSrc, 'bin', 'sherpa-onnx-offline'))
    const symTgz = join(work, 'sym.tar.gz')
    await execFileAsync('tar', ['-czf', symTgz, '-C', symSrc, 'bin'])
    const symBytes = await readFile(symTgz)
    await expect(
      installSpeechRuntime(
        baseEntry({ bytes: symBytes.byteLength, sha256: sha256(symBytes) }),
        { root: await makeTempDir('tuff-rt-sym-'), fetchImpl: makeArchiveFetch(symBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    // Case B: Hardlink inside tar.gz
    const hardSrc = join(work, 'hard-src')
    await mkdir(join(hardSrc, 'bin'), { recursive: true })
    await writeFile(join(hardSrc, 'bin', 'a'), 'x')
    await link(join(hardSrc, 'bin', 'a'), join(hardSrc, 'bin', 'sherpa-onnx-offline'))
    const hardTgz = join(work, 'hard.tar.gz')
    await execFileAsync('tar', ['-czf', hardTgz, '-C', hardSrc, 'bin'])
    const hardBytes = await readFile(hardTgz)
    await expect(
      installSpeechRuntime(
        baseEntry({ bytes: hardBytes.byteLength, sha256: sha256(hardBytes) }),
        { root: await makeTempDir('tuff-rt-hard-'), fetchImpl: makeArchiveFetch(hardBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    // Case C: Top-level .extract collision
    const extractSrc = join(work, 'extract-src')
    await mkdir(join(extractSrc, '.extract', 'bin'), { recursive: true })
    await writeFile(join(extractSrc, '.extract', 'bin', 'sherpa-onnx-offline'), 'x')
    const extractTgz = join(work, 'extract.tar.gz')
    await execFileAsync('tar', ['-czf', extractTgz, '-C', extractSrc, '.extract'])
    const extractBytes = await readFile(extractTgz)
    await expect(
      installSpeechRuntime(
        baseEntry({ bytes: extractBytes.byteLength, sha256: sha256(extractBytes) }),
        { root: await makeTempDir('tuff-rt-ext-'), fetchImpl: makeArchiveFetch(extractBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    // Case D: runtime.json entry collision
    const manifestSrc = join(work, 'manifest-src')
    await mkdir(join(manifestSrc, 'bin'), { recursive: true })
    await writeFile(join(manifestSrc, 'runtime.json'), '{}')
    await writeFile(join(manifestSrc, 'bin', 'sherpa-onnx-offline'), 'x')
    const manifestTgz = join(work, 'manifest.tar.gz')
    await execFileAsync('tar', ['-czf', manifestTgz, '-C', manifestSrc, 'runtime.json', 'bin'])
    const manifestBytes = await readFile(manifestTgz)
    await expect(
      installSpeechRuntime(
        baseEntry({ bytes: manifestBytes.byteLength, sha256: sha256(manifestBytes) }),
        { root: await makeTempDir('tuff-rt-man-'), fetchImpl: makeArchiveFetch(manifestBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })

    // Case E: Path traversal (../escape.txt) inside zip — must reject BEFORE extraction touches disk
    const slipRoot = await makeTempDir('tuff-rt-slip-')
    const escapedTarget = join(slipRoot, 'sherpa-onnx', '1.13.8', 'escape.txt')
    const slipZip = join(work, 'slip.zip')
    await execFileAsync('python3', [
      '-c',
      `import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as zf:
    zf.writestr('../escape.txt', 'pwned')
    zf.writestr('bin/sherpa-onnx-offline', 'x')
`,
      slipZip,
    ])
    const slipBytes = await readFile(slipZip)
    await expect(
      installSpeechRuntime(
        baseEntry({
          archive: 'zip',
          url: 'https://cdn.example.test/slip.zip',
          bytes: slipBytes.byteLength,
          sha256: sha256(slipBytes),
        }),
        { root: slipRoot, fetchImpl: makeArchiveFetch(slipBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })
    await expect(access(escapedTarget)).rejects.toThrow()

    // Case F: Symlink inside zip — rejected BEFORE extraction
    const symZip = join(work, 'sym.zip')
    await execFileAsync('zip', ['-q', '--symlinks', symZip, 'bin/sherpa-onnx-offline'], { cwd: symSrc })
    const symZipBytes = await readFile(symZip)
    await expect(
      installSpeechRuntime(
        baseEntry({
          archive: 'zip',
          url: 'https://cdn.example.test/sym.zip',
          bytes: symZipBytes.byteLength,
          sha256: sha256(symZipBytes),
        }),
        { root: await makeTempDir('tuff-rt-symzip-'), fetchImpl: makeArchiveFetch(symZipBytes), lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_RUNTIME_INVALID' })
  })
})
