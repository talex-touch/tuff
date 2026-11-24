import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computeFileSha256,
  parseStageArgs,
  stageHerdrCoreBinary,
} from './stage-herdr-core-binary.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

async function createTempFixture(name = 'herdr-core') {
  const dir = await mkdtemp(path.join(tmpdir(), 'stage-herdr-test-'))
  tempDirs.push(dir)
  const sourcePath = path.join(dir, name)
  const payload = Buffer.from('#!/bin/sh\necho "hc 0.1.21"\n', 'utf8')
  await writeFile(sourcePath, payload)
  const sha256 = createHash('sha256').update(payload).digest('hex')
  const targetDir = path.join(dir, 'staged-out')
  return { dir, sourcePath, sha256, targetDir }
}

describe('stage-herdr-core-binary', () => {
  it('skips cleanly without touching targetDir when opt-in is not enabled', async () => {
    const { targetDir } = await createTempFixture()
    const options = parseStageArgs(['--target', targetDir], {})
    expect(options.optIn).toBe(false)

    const result = await stageHerdrCoreBinary(options)
    expect(result).toMatchObject({ staged: false, skipped: true })
    await expect(access(targetDir)).rejects.toThrow()
  })

  it('stages verified Unix binary with executable mode, Apache-2.0 license, NOTICE, and manifest', async () => {
    const { sourcePath, sha256, targetDir } = await createTempFixture()
    expect(await computeFileSha256(sourcePath)).toBe(sha256)

    const options = parseStageArgs(
      [
        '--from',
        sourcePath,
        '--sha256',
        sha256.toUpperCase(),
        '--version',
        '0.1.21',
        '--target',
        targetDir,
        '--platform',
        'darwin',
        '--arch',
        'arm64',
      ],
      {},
    )
    expect(options.optIn).toBe(true)

    const result = await stageHerdrCoreBinary(options)
    expect(result.staged).toBe(true)
    expect(result.binaryPath).toBe(path.join(targetDir, 'herdr-core'))
    expect(result.sha256).toBe(sha256)

    const stagedStat = await stat(result.binaryPath!)
    expect(stagedStat.mode & 0o111).not.toBe(0)

    const notice = await readFile(result.noticePath!, 'utf8')
    expect(notice).toContain('herdr-core')
    expect(notice).toContain('Apache License, Version 2.0')
    expect(notice).toContain('0.1.21')
    expect(notice).toContain(sha256)

    const license = await readFile(result.licensePath!, 'utf8')
    expect(license).toContain('Apache License')

    const manifest = JSON.parse(await readFile(result.manifestPath!, 'utf8'))
    expect(manifest).toMatchObject({
      name: 'herdr-core',
      binary: 'herdr-core',
      version: '0.1.21',
      platform: 'darwin',
      arch: 'arm64',
      sha256,
      license: 'Apache-2.0',
      noticeFile: 'NOTICE.txt',
      licenseFile: 'LICENSE-APACHE-2.0.txt',
    })
  })

  it('stages Windows .exe naming when TUFF_BUNDLE_HERDR_CORE=1 is set via env', async () => {
    const { sourcePath, sha256, targetDir } = await createTempFixture('herdr-core.exe')
    const options = parseStageArgs(
      ['--platform', 'win32', '--arch', 'x64'],
      {
        TUFF_BUNDLE_HERDR_CORE: '1',
        HERDR_CORE_BINARY_PATH: sourcePath,
        HERDR_CORE_BINARY_SHA256: sha256,
        HERDR_CORE_STAGE_DIR: targetDir,
      },
    )

    const result = await stageHerdrCoreBinary(options)
    expect(result.staged).toBe(true)
    expect(result.binaryPath).toBe(path.join(targetDir, 'herdr-core.exe'))
    expect(result.manifest?.binary).toBe('herdr-core.exe')
  })

  it('fails closed on missing, malformed, or mismatched SHA-256 without creating targetDir', async () => {
    const { sourcePath, targetDir } = await createTempFixture()

    await expect(
      stageHerdrCoreBinary(
        parseStageArgs(['--from', sourcePath, '--target', targetDir], {}),
      ),
    ).rejects.toThrow(/64-character hex/)
    await expect(access(targetDir)).rejects.toThrow()

    await expect(
      stageHerdrCoreBinary(
        parseStageArgs(['--from', sourcePath, '--sha256', 'deadbeef', '--target', targetDir], {}),
      ),
    ).rejects.toThrow(/64-character hex/)
    await expect(access(targetDir)).rejects.toThrow()

    await expect(
      stageHerdrCoreBinary(
        parseStageArgs(
          ['--from', sourcePath, '--sha256', '0'.repeat(64), '--target', targetDir],
          {},
        ),
      ),
    ).rejects.toThrow(/SHA-256 mismatch/)
    await expect(access(targetDir)).rejects.toThrow()
  })

  it('fails closed when TUFF_BUNDLE_HERDR_CORE=1 is set without a source binary path', async () => {
    const { targetDir } = await createTempFixture()
    const options = parseStageArgs(['--target', targetDir], { TUFF_BUNDLE_HERDR_CORE: '1' })
    await expect(stageHerdrCoreBinary(options)).rejects.toThrow(/no source binary/)
    await expect(access(targetDir)).rejects.toThrow()
  })
})
