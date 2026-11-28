import type { Session } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { net } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTfilePreviewGrants, issueTfilePreviewGrant } from './tfile-preview-grant'
import { clearTfileProtocolLogState, registerTfileProtocolForSession } from './tfile-session'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/nonexistent-tfile-test-root',
    getAppPath: () => '/nonexistent-tfile-test-root',
    isPackaged: false
  },
  net: { fetch: vi.fn() }
}))
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() })
}))

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const release of cleanup.splice(0).reverse()) await release()
  vi.restoreAllMocks()
  vi.useRealTimers()
  clearTfilePreviewGrants()
  clearTfileProtocolLogState()
  vi.mocked(net.fetch).mockReset()
})

async function protocolFixture() {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'tfile-grant-contract-'))
  )
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }))
  const captured = path.join(directory, 'captured.png')
  const other = path.join(directory, 'other.png')
  await fs.writeFile(captured, 'captured-file-bytes')
  await fs.writeFile(other, 'different-file-bytes')
  let handler!: (request: { url: string }) => Promise<Response>
  cleanup.push(
    registerTfileProtocolForSession(
      {
        protocol: {
          handle: (_scheme: string, callback: typeof handler) => {
            handler = callback
          },
          unhandle: () => {}
        }
      } as unknown as Session,
      [directory]
    )
  )
  vi.mocked(net.fetch).mockImplementation(
    async (fileUrl) => new Response(await fs.readFile(fileURLToPath(String(fileUrl))))
  )
  return { captured, other, request: (url: string) => handler({ url }) }
}

describe('tfile preview grant consumption', () => {
  it('serves the exact canonical captured file while its grant remains live', async () => {
    const fixture = await protocolFixture()
    const grant = issueTfilePreviewGrant(fixture.captured)
    const response = await fixture.request(grant.tfileUrl)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('captured-file-bytes')
  })

  it('rejects expired grants even inside an independently allowlisted root', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const fixture = await protocolFixture()
    const grant = issueTfilePreviewGrant(fixture.captured)
    vi.setSystemTime(grant.expiresAt)
    const denied = await fixture.request(grant.tfileUrl)
    expect(denied.status).toBe(403)
    expect(await denied.text()).toBe('Forbidden')
    expect(net.fetch).not.toHaveBeenCalled()
    // The root really is servable without a grant: only the invalid capability must fail closed.
    const ordinary = await fixture.request(grant.tfileUrl.split('?')[0])
    expect(await ordinary.text()).toBe('captured-file-bytes')
  })

  it('rejects a valid token transplanted onto another allowlisted file', async () => {
    const fixture = await protocolFixture()
    const capturedGrant = issueTfilePreviewGrant(fixture.captured)
    const otherGrant = issueTfilePreviewGrant(fixture.other)
    const forged = new URL(otherGrant.tfileUrl)
    forged.searchParams.set(
      'previewGrant',
      new URL(capturedGrant.tfileUrl).searchParams.get('previewGrant')!
    )
    expect((await fixture.request(forged.toString())).status).toBe(403)
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('rejects a canonical captured file replaced by a symlink before consumption', async () => {
    const fixture = await protocolFixture()
    const grant = issueTfilePreviewGrant(fixture.captured)
    await fs.unlink(fixture.captured)
    await fs.symlink(fixture.other, fixture.captured)
    expect((await fixture.request(grant.tfileUrl)).status).toBe(403)
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('rechecks grant expiry after asynchronous canonicalization before reading bytes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const fixture = await protocolFixture()
    const grant = issueTfilePreviewGrant(fixture.captured)
    const canonicalized = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const realpath = fs.realpath.bind(fs)
    vi.spyOn(fs, 'realpath').mockImplementationOnce(async (target) => {
      const resolved = await realpath(target)
      canonicalized.resolve()
      await release.promise
      return resolved
    })
    const pending = fixture.request(grant.tfileUrl)
    await canonicalized.promise
    vi.setSystemTime(grant.expiresAt)
    release.resolve()
    expect((await pending).status).toBe(403)
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('rejects a symlink inside an allowlisted root that escapes outside the root', async () => {
    const allowedDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'tfile-allowed-root-'))
    )
    const secretDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'tfile-outside-secret-'))
    )
    cleanup.push(() => fs.rm(allowedDir, { recursive: true, force: true }))
    cleanup.push(() => fs.rm(secretDir, { recursive: true, force: true }))

    const secretFile = path.join(secretDir, 'local-secret.v1.key')
    await fs.writeFile(secretFile, 'top-secret-key')
    const escapeLink = path.join(allowedDir, 'escape.png')
    await fs.symlink(secretFile, escapeLink)

    let handler!: (request: { url: string }) => Promise<Response>
    cleanup.push(
      registerTfileProtocolForSession(
        {
          protocol: {
            handle: (_scheme: string, callback: typeof handler) => {
              handler = callback
            },
            unhandle: () => {}
          }
        } as unknown as Session,
        [allowedDir]
      )
    )

    // Note: os.tmpdir() is in built-in roots; use a non-tmp outside path or ensure secretDir is outside allowedDir.
    // To prove containment against ONLY allowedDir, verify with a symlink to a path outside os.tmpdir too.
    const etcHosts = process.platform === 'win32' ? secretFile : '/etc/hosts'
    const outsideEscape = path.join(allowedDir, 'etc-hosts.png')
    await fs.symlink(etcHosts, outsideEscape)

    const response = await handler({ url: `tfile://${outsideEscape}` })
    expect(response.status).toBe(403)
    expect(net.fetch).not.toHaveBeenCalled()
  })
})
