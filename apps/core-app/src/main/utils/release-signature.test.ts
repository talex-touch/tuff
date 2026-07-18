import crypto from 'node:crypto'
import { mkdtemp, readFile as readFileFromDisk, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createReadStreamMock, networkRequestMock, readFileMock } = vi.hoisted(() => ({
  createReadStreamMock: vi.fn(),
  networkRequestMock: vi.fn(),
  readFileMock: vi.fn()
}))

vi.mock('../modules/network', () => ({
  getNetworkService: () => ({ request: networkRequestMock })
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => '/app' }
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: createReadStreamMock,
    promises: {
      ...actual.promises,
      readFile: readFileMock
    }
  }
})

import { SignatureVerifier } from './release-signature'

const signatureUrl = 'https://example.test/Tuff-2.4.10-setup.exe.sig'
const packagePath = '/tmp/Tuff-2.4.10-setup.exe'
const temporaryRoots: string[] = []

async function* streamPackageBytes(filePath: string) {
  yield await readFileFromDisk(filePath)
}

async function createSignedPackageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'tuff-release-signature-'))
  temporaryRoots.push(root)

  const fixturePackagePath = join(root, 'Tuff-2.4.10-setup.exe')
  const cachePath = join(root, 'cache', 'Tuff-2.4.10-setup.exe.sig')
  const packagePayload = Buffer.from('signed package contents')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const signaturePayload = Buffer.from(
    crypto.sign('RSA-SHA256', packagePayload, privateKey).toString('base64')
  )

  await writeFile(fixturePackagePath, packagePayload)

  return {
    cachePath,
    packagePath: fixturePackagePath,
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    signaturePayload
  }
}

function configureSuccessfulVerification(publicKey: string) {
  readFileMock.mockImplementation(async (filePath: string) => {
    if (filePath.endsWith('release-signing-public.pem')) {
      return publicKey
    }
    return await readFileFromDisk(filePath)
  })
  createReadStreamMock.mockImplementation(streamPackageBytes)
}

describe('SignatureVerifier', () => {
  beforeEach(() => {
    createReadStreamMock.mockReset()
    networkRequestMock.mockReset()
    readFileMock.mockReset()
    networkRequestMock.mockResolvedValue({ data: Buffer.from('deadbeef') })
  })

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))
    )
    vi.restoreAllMocks()
  })

  it('fails closed when no embedded signing key is available', async () => {
    readFileMock.mockRejectedValue(new Error('key missing'))

    const result = await new SignatureVerifier().verifyFileSignature(packagePath, signatureUrl)

    expect(result).toEqual({
      valid: false,
      reason: 'Embedded signature public key not available'
    })
    expect(networkRequestMock).toHaveBeenCalledWith(expect.objectContaining({ url: signatureUrl }))
    expect(createReadStreamMock).not.toHaveBeenCalled()
  })

  it('streams package bytes into RSA-SHA256 verification and rejects a mismatched signature', async () => {
    const chunks = [Buffer.from('package-'), Buffer.from('contents')]
    const verifier = {
      update: vi.fn(),
      end: vi.fn(),
      verify: vi.fn(() => false)
    }
    readFileMock.mockResolvedValue('-----BEGIN PUBLIC KEY-----\nembedded\n-----END PUBLIC KEY-----')
    createReadStreamMock.mockReturnValue(
      (async function* () {
        yield* chunks
      })()
    )
    vi.spyOn(crypto, 'createVerify').mockReturnValue(verifier as never)

    const result = await new SignatureVerifier().verifyFileSignature(packagePath, signatureUrl)

    expect(result).toEqual({ valid: false, reason: 'Signature mismatch' })
    expect(createReadStreamMock).toHaveBeenCalledWith(packagePath)
    expect(verifier.update).toHaveBeenNthCalledWith(1, chunks[0])
    expect(verifier.update).toHaveBeenNthCalledWith(2, chunks[1])
    expect(verifier.end).toHaveBeenCalledOnce()
    expect(verifier.verify).toHaveBeenCalledWith(
      '-----BEGIN PUBLIC KEY-----\nembedded\n-----END PUBLIC KEY-----',
      Buffer.from('deadbeef', 'hex')
    )
    expect(readFileMock.mock.calls.some(([path]) => path === packagePath)).toBe(false)
  })

  it('downloads a detached signature once then verifies the cached bytes offline', async () => {
    const fixture = await createSignedPackageFixture()
    configureSuccessfulVerification(fixture.publicKey)
    createReadStreamMock.mockImplementation(streamPackageBytes)
    networkRequestMock.mockResolvedValue({ data: fixture.signaturePayload })
    const verifier = new SignatureVerifier()

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: true, reason: undefined })
    await expect(readFileFromDisk(fixture.cachePath)).resolves.toEqual(fixture.signaturePayload)
    expect(networkRequestMock).toHaveBeenCalledTimes(1)

    networkRequestMock.mockClear()
    networkRequestMock.mockRejectedValue(new Error('network must remain offline during preflight'))

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: true, reason: undefined })
    expect(networkRequestMock).not.toHaveBeenCalled()
  })

  it('fails closed when the cached detached signature has been tampered with', async () => {
    const fixture = await createSignedPackageFixture()
    configureSuccessfulVerification(fixture.publicKey)
    networkRequestMock.mockResolvedValue({ data: fixture.signaturePayload })
    const verifier = new SignatureVerifier()

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: true, reason: undefined })
    await writeFile(fixture.cachePath, Buffer.from('tampered detached signature'))
    networkRequestMock.mockClear()
    networkRequestMock.mockRejectedValue(new Error('cache verification must not retry network'))

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: false, reason: 'Signature mismatch' })
    expect(networkRequestMock).not.toHaveBeenCalled()
  })

  it('fails closed when the package changes after caching its detached signature', async () => {
    const fixture = await createSignedPackageFixture()
    configureSuccessfulVerification(fixture.publicKey)
    networkRequestMock.mockResolvedValue({ data: fixture.signaturePayload })
    const verifier = new SignatureVerifier()

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: true, reason: undefined })
    await writeFile(fixture.packagePath, Buffer.from('tampered package contents'))
    networkRequestMock.mockClear()
    networkRequestMock.mockRejectedValue(new Error('cache verification must not retry network'))

    await expect(
      verifier.verifyFileSignatureWithCache(fixture.packagePath, signatureUrl, fixture.cachePath)
    ).resolves.toEqual({ valid: false, reason: 'Signature mismatch' })
    expect(networkRequestMock).not.toHaveBeenCalled()
  })

  it('fails closed when an existing signature cache cannot be read', async () => {
    const fixture = await createSignedPackageFixture()
    const unreadableCacheError = Object.assign(new Error('cache permission denied'), {
      code: 'EACCES'
    })
    readFileMock.mockImplementation(async (filePath: string) => {
      if (filePath === fixture.cachePath) {
        throw unreadableCacheError
      }
      return fixture.publicKey
    })
    networkRequestMock.mockRejectedValue(new Error('unreadable cache must not trigger network'))

    await expect(
      new SignatureVerifier().verifyFileSignatureWithCache(
        fixture.packagePath,
        signatureUrl,
        fixture.cachePath
      )
    ).resolves.toEqual({ valid: false, reason: 'Signature cache is unreadable' })
    expect(networkRequestMock).not.toHaveBeenCalled()
  })
})
