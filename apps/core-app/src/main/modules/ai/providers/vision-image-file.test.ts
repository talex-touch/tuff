import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tempState = vi.hoisted(() => ({
  allowedRoot: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tempState.allowedRoot || os.tmpdir())
  }
}))

import { markPluginInvocation } from '../intelligence-invoke-purpose'
import { detectImageSignature, readSafeVisionImageFile } from './vision-image-file'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64'
)

describe('readSafeVisionImageFile', () => {
  let allowedDir: string
  let outsideDir: string

  beforeEach(async () => {
    allowedDir = await mkdtemp(path.join(os.tmpdir(), 'vision-allowed-'))
    outsideDir = await mkdtemp(path.join(os.tmpdir(), 'vision-outside-'))
    tempState.allowedRoot = allowedDir
  })

  afterEach(async () => {
    await rm(allowedDir, { recursive: true, force: true })
    await rm(outsideDir, { recursive: true, force: true })
  })

  it('rejects plugin callers even for a valid image inside allowed roots', async () => {
    const imgPath = path.join(allowedDir, 'sample.png')
    await writeFile(imgPath, ONE_PIXEL_PNG)

    const pluginOptions = markPluginInvocation({ metadata: {} }, 'evil-plugin', false)
    await expect(readSafeVisionImageFile(imgPath, pluginOptions)).rejects.toThrow(
      'VISION_FILE_SOURCE_FORBIDDEN'
    )

    await expect(
      readSafeVisionImageFile(imgPath, { metadata: { caller: 'plugin:another' } })
    ).rejects.toThrow('VISION_FILE_SOURCE_FORBIDDEN')
  })

  it('rejects symlinks, credential files, and non-image payloads', async () => {
    const realImg = path.join(allowedDir, 'real.png')
    await writeFile(realImg, ONE_PIXEL_PNG)

    const linkImg = path.join(allowedDir, 'link.png')
    await symlink(realImg, linkImg)
    await expect(readSafeVisionImageFile(linkImg)).rejects.toThrow()

    const fakeImg = path.join(allowedDir, 'not-an-image.png')
    await writeFile(fakeImg, Buffer.from('SECRET_API_KEY=12345'))
    await expect(readSafeVisionImageFile(fakeImg)).rejects.toThrow()

    const envFile = path.join(allowedDir, '.env')
    await writeFile(envFile, ONE_PIXEL_PNG)
    await expect(readSafeVisionImageFile(envFile)).rejects.toThrow()

    await expect(readSafeVisionImageFile('/etc/passwd')).rejects.toThrow()
  })

  it('reads a valid non-symlink image inside allowed roots and detects signature', async () => {
    const validImg = path.join(allowedDir, 'ok.png')
    await writeFile(validImg, ONE_PIXEL_PNG)

    const result = await readSafeVisionImageFile(validImg)
    expect(result.mimeType).toBe('image/png')
    expect(result.extension).toBe('png')
    expect(result.buffer.equals(ONE_PIXEL_PNG)).toBe(true)
    expect(detectImageSignature(Buffer.from('not-image'))).toBeNull()
  })
})
