import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Verification of a renderer override bundle before it is installed (#912).
 *
 * An installed override runs as the app's renderer, which channel-guard grants unguarded
 * system.shell along with the shell.openPath and download handlers. installRendererOverride
 * used to verify the checksum only when the artifact happened to declare one, skip the
 * signature entirely when no signatureUrl was present, and — when a signature *was* present
 * and did not verify — log a warning and extract the bundle anyway.
 *
 * The sibling installer path, resolveVerifiedInstallTask, has always required both and thrown
 * on either. These tests hold the override path to that same standard.
 */

const uncompress = vi.fn(async () => {})
const verifyFileSignature = vi.fn(async () => ({
  valid: true,
  reason: undefined as string | undefined
}))
const messageAdd = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/tuff-test'),
    getVersion: vi.fn(() => '2.4.9'),
    isPackaged: true
  }
}))

vi.mock('../../utils/release-signature', () => ({
  SignatureVerifier: class SignatureVerifier {
    verifyFileSignature = verifyFileSignature
    verifyFileSignatureWithCache = vi.fn(async () => ({ valid: true }))
  }
}))

vi.mock('../analytics/message-store', () => ({
  getAnalyticsMessageStore: () => ({ add: messageAdd })
}))
vi.mock('../database', () => ({ databaseModule: { getDb: vi.fn() } }))
vi.mock('../network', () => ({ getNetworkService: () => ({ request: vi.fn() }) }))
vi.mock('compressing', () => ({ default: { zip: { uncompress } }, zip: { uncompress } }))

vi.mock('fs-extra', () => {
  const api = {
    ensureDir: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    // false everywhere, so bundle-root resolution finds no index.html. That is deliberate:
    // the positive control only needs to prove extraction was reached, not to stage a bundle.
    pathExists: vi.fn(async () => false),
    readdir: vi.fn(async () => [])
  }
  return { default: api, ...api }
})

/**
 * The module reads TUFF_ENABLE_RENDERER_OVERRIDE at load time, so the variable has to be set
 * before the import — hence the dynamic import rather than a static one at the top.
 */
/** The private members these tests reach into; the class does not expose them. */
type TestableUpdateSystem = {
  installRendererOverride: (
    task: unknown,
    artifact: unknown,
    release: unknown,
    manifest: unknown
  ) => Promise<void>
  verifyChecksum: (filePath: string, expected: string) => Promise<boolean>
}

async function createSystem() {
  const { UpdateSystem } = await import('./update-system')
  const downloadCenter = {
    getTask: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    createTask: vi.fn()
  }
  return new (UpdateSystem as unknown as new (dc: unknown, cfg: unknown) => TestableUpdateSystem)(
    downloadCenter,
    { rendererOverrideEnabled: true }
  )
}

const release = { tag_name: 'v2.4.10' }
const task = (signatureUrl?: string) => ({
  destination: '/tmp/tuff-test',
  filename: 'renderer.zip',
  metadata: signatureUrl ? { signatureUrl } : {}
})

async function install(system: TestableUpdateSystem, artifact: unknown, signatureUrl?: string) {
  return await system.installRendererOverride(task(signatureUrl), artifact, release, null)
}

describe('installRendererOverride verification', () => {
  let system: TestableUpdateSystem

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('TUFF_ENABLE_RENDERER_OVERRIDE', '1')
    vi.resetModules()
    system = await createSystem()
    // Checksum comparison is not what these tests are about; each case controls it directly.
    system.verifyChecksum = vi.fn(async () => true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses an artifact that declares no checksum', async () => {
    // Previously the `if (artifact.sha256)` guard meant no checksum was simply not checked.
    await expect(install(system, {})).rejects.toThrow(/checksum is required but missing/i)
    expect(uncompress).not.toHaveBeenCalled()
  })

  it('refuses an artifact whose checksum does not match', async () => {
    system.verifyChecksum = vi.fn(async () => false)
    await expect(install(system, { sha256: 'abc' }, 'https://example.test/r.sig')).rejects.toThrow(
      /checksum verification failed/i
    )
    expect(uncompress).not.toHaveBeenCalled()
  })

  it('refuses when no signature URL is published', async () => {
    await expect(install(system, { sha256: 'abc' })).rejects.toThrow(
      /signature is required but missing/i
    )
    expect(uncompress).not.toHaveBeenCalled()
  })

  it('refuses an invalid signature instead of warning and installing anyway', async () => {
    // The core of #912: this path logged a warning and fell through to extraction.
    verifyFileSignature.mockResolvedValue({ valid: false, reason: 'bad-signature' })
    await expect(install(system, { sha256: 'abc' }, 'https://example.test/r.sig')).rejects.toThrow(
      /signature verification failed: bad-signature/i
    )
    expect(uncompress).not.toHaveBeenCalled()
  })

  it('reports every refusal at error severity, not warn', async () => {
    // The warn severity was part of the defect: an operator reading the message stream saw a
    // caution about a bundle that had already been installed.
    verifyFileSignature.mockResolvedValue({ valid: false, reason: 'bad-signature' })
    await expect(install(system, { sha256: 'abc' }, 'https://example.test/r.sig')).rejects.toThrow()
    expect(messageAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
    expect(messageAdd).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }))
  })

  it('proceeds to extraction once checksum and signature both verify', async () => {
    // Positive control. Without it every assertion above would still pass if the method threw
    // unconditionally, which would "fix" the issue by breaking the feature.
    verifyFileSignature.mockResolvedValue({ valid: true, reason: undefined })
    await expect(install(system, { sha256: 'abc' }, 'https://example.test/r.sig')).rejects.toThrow(
      /bundle missing index\.html/i
    )
    expect(uncompress).toHaveBeenCalledTimes(1)
  })
})
