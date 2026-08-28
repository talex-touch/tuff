import { createHash, randomBytes, randomUUID } from 'node:crypto'
import fsSync, { type BigIntStats } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import type {
  IntelligenceMcpProfile,
  IntelligenceMcpRegistry
} from './modules/ai/intelligence-mcp-registry'

const MCP_PROFILE_ID = 'packaged-live-mcp-smoke'
const MCP_SERVER_PACKAGE = '@modelcontextprotocol/server-filesystem@2026.7.10'
const TIMEOUT_MS = 120_000
const SHA256_PATTERN = /^[a-f0-9]{64}$/

type LiveMcpSmokeFailureCode =
  | 'LIVE_MCP_SMOKE_OPT_IN_REQUIRED'
  | 'LIVE_MCP_SMOKE_TIMEOUT'
  | 'LIVE_MCP_SMOKE_ASSERTION_FAILED'
  | 'LIVE_MCP_SMOKE_CLEANUP_FAILED'
  | 'LIVE_MCP_SMOKE_FAILED'

type LiveMcpOperationalEvidence = {
  explicitOptIn: boolean
  realStdio: boolean
  launcherIdentityBound: boolean
  nodeHashMatched: boolean
  npxHashMatched: boolean
  pathShimExcluded: boolean
  initializeHandshake: boolean
  toolsListed: boolean
  readTextFileCalled: boolean
  roundTripCanaryMatched: boolean
}

type StableFileIdentity = {
  readonly dev: string
  readonly ino: string
  readonly size: number
  readonly mtimeNs: string
  readonly ctimeNs: string
}

type VerifiedMcpLauncher = {
  readonly nodeExecutable: string
  readonly nodeIdentity: StableFileIdentity
  readonly nodeSha256: string
  readonly nodeHashMatched: boolean
  readonly npxCli: string
  readonly npxIdentity: StableFileIdentity
  readonly npxCliSha256: string
  readonly npxHashMatched: boolean
  readonly safePath: string
}

type LiveMcpLauncherEvidence = {
  readonly nodeSha256: string
  readonly npxCliSha256: string
}

type LiveMcpSmokeResult = {
  readonly evidence: LiveMcpOperationalEvidence
  readonly launcher: LiveMcpLauncherEvidence
}

class LiveMcpSmokeError extends Error {
  constructor(readonly code: LiveMcpSmokeFailureCode) {
    super(code)
    this.name = 'LiveMcpSmokeError'
  }
}

function failureCode(error: unknown): LiveMcpSmokeFailureCode {
  return error instanceof LiveMcpSmokeError ? error.code : 'LIVE_MCP_SMOKE_FAILED'
}

function assertionFailed(): never {
  throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')
}

function stableIdentity(stats: BigIntStats): StableFileIdentity {
  return {
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    size: Number(stats.size),
    mtimeNs: stats.mtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString()
  }
}

function sameStableIdentity(left: StableFileIdentity, right: StableFileIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

async function lstatStableRegularFile(filePath: string): Promise<StableFileIdentity> {
  try {
    const stats = await fs.lstat(filePath, { bigint: true })
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size < 1n ||
      stats.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      assertionFailed()
    }
    return stableIdentity(stats)
  } catch (error) {
    if (error instanceof LiveMcpSmokeError) throw error
    throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')
  }
}

async function hashStableRegularFile(
  filePath: string,
  expectedIdentity: StableFileIdentity
): Promise<string> {
  const before = await lstatStableRegularFile(filePath)
  if (!sameStableIdentity(before, expectedIdentity)) assertionFailed()
  const noFollow = typeof fsSync.constants.O_NOFOLLOW === 'number' ? fsSync.constants.O_NOFOLLOW : 0
  let handle
  try {
    handle = await fs.open(filePath, fsSync.constants.O_RDONLY | noFollow)
    const opened = stableIdentity(await handle.stat({ bigint: true }))
    if (!sameStableIdentity(opened, expectedIdentity)) assertionFailed()

    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (position < expectedIdentity.size) {
      const length = Math.min(buffer.length, expectedIdentity.size - position)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      if (bytesRead <= 0) assertionFailed()
      digest.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }

    const afterHandle = stableIdentity(await handle.stat({ bigint: true }))
    const afterPath = await lstatStableRegularFile(filePath)
    if (
      position !== expectedIdentity.size ||
      !sameStableIdentity(afterHandle, expectedIdentity) ||
      !sameStableIdentity(afterPath, expectedIdentity)
    ) {
      assertionFailed()
    }
    return digest.digest('hex')
  } catch (error) {
    if (error instanceof LiveMcpSmokeError) throw error
    throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]
  if (!value) assertionFailed()
  return value
}

async function resolveMcpLauncher(): Promise<VerifiedMcpLauncher> {
  const requestedNode = requiredEnvironmentValue('TUFF_MCP_SMOKE_NODE_EXECUTABLE')
  const requestedNpxCli = requiredEnvironmentValue('TUFF_MCP_SMOKE_NPX_CLI')
  const expectedNodeSha256 = requiredEnvironmentValue('TUFF_MCP_SMOKE_NODE_SHA256')
  const expectedNpxCliSha256 = requiredEnvironmentValue('TUFF_MCP_SMOKE_NPX_CLI_SHA256')
  if (
    !path.isAbsolute(requestedNode) ||
    !path.isAbsolute(requestedNpxCli) ||
    !SHA256_PATTERN.test(expectedNodeSha256) ||
    !SHA256_PATTERN.test(expectedNpxCliSha256)
  ) {
    assertionFailed()
  }

  let nodeExecutable: string
  let npxCli: string
  try {
    ;[nodeExecutable, npxCli] = await Promise.all([
      fs.realpath(requestedNode),
      fs.realpath(requestedNpxCli)
    ])
  } catch {
    assertionFailed()
  }
  if (nodeExecutable !== requestedNode || npxCli !== requestedNpxCli) assertionFailed()

  const nodeRoot = path.resolve(path.dirname(nodeExecutable), '..')
  const expectedNpxCli = path.join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (npxCli !== expectedNpxCli) assertionFailed()

  const [nodeIdentity, npxIdentity] = await Promise.all([
    lstatStableRegularFile(nodeExecutable),
    lstatStableRegularFile(npxCli)
  ])
  const [nodeSha256, npxCliSha256] = await Promise.all([
    hashStableRegularFile(nodeExecutable, nodeIdentity),
    hashStableRegularFile(npxCli, npxIdentity)
  ])
  const nodeHashMatched = nodeSha256 === expectedNodeSha256
  const npxHashMatched = npxCliSha256 === expectedNpxCliSha256
  if (!nodeHashMatched || !npxHashMatched) assertionFailed()

  const safePath = [path.dirname(nodeExecutable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(
    path.delimiter
  )
  if (process.env.PATH !== safePath) assertionFailed()
  return Object.freeze({
    nodeExecutable,
    nodeIdentity,
    nodeSha256,
    nodeHashMatched,
    npxCli,
    npxIdentity,
    npxCliSha256,
    npxHashMatched,
    safePath
  })
}

async function verifyMcpLauncherUnchanged(launcher: VerifiedMcpLauncher): Promise<void> {
  const [nodeSha256, npxCliSha256] = await Promise.all([
    hashStableRegularFile(launcher.nodeExecutable, launcher.nodeIdentity),
    hashStableRegularFile(launcher.npxCli, launcher.npxIdentity)
  ])
  if (nodeSha256 !== launcher.nodeSha256 || npxCliSha256 !== launcher.npxCliSha256) {
    assertionFailed()
  }
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LiveMcpSmokeError('LIVE_MCP_SMOKE_TIMEOUT')), TIMEOUT_MS)
    timer.unref()
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runLiveMcpSmoke(
  registry: IntelligenceMcpRegistry,
  isolatedProfilePath: string,
  launcher: VerifiedMcpLauncher
): Promise<LiveMcpSmokeResult> {
  const runtimeRoot = await fs.mkdtemp(path.join(isolatedProfilePath, 'mcp-runtime-'))
  const serverRoot = path.join(runtimeRoot, 'files')
  const childHome = path.join(runtimeRoot, 'home')
  const childTemp = path.join(runtimeRoot, 'tmp')
  const npmCache = path.join(runtimeRoot, 'npm-cache')
  const npmUserConfig = path.join(runtimeRoot, 'npmrc')
  await Promise.all([
    fs.mkdir(serverRoot, { recursive: true }),
    fs.mkdir(childHome, { recursive: true }),
    fs.mkdir(childTemp, { recursive: true }),
    fs.mkdir(npmCache, { recursive: true })
  ])
  await fs.writeFile(npmUserConfig, '', { encoding: 'utf8', flag: 'wx', mode: 0o600 })

  const canary = `tuff-mcp-${randomBytes(32).toString('hex')}`
  const canaryPath = path.join(serverRoot, `${randomUUID()}.txt`)
  await fs.writeFile(canaryPath, canary, { encoding: 'utf8', flag: 'wx', mode: 0o600 })

  const profile: IntelligenceMcpProfile = {
    id: MCP_PROFILE_ID,
    name: MCP_PROFILE_ID,
    enabled: true,
    transport: {
      type: 'stdio',
      command: launcher.nodeExecutable,
      args: [launcher.npxCli, '-y', MCP_SERVER_PACKAGE, serverRoot],
      cwd: runtimeRoot,
      env: {
        PATH: launcher.safePath,
        HOME: childHome,
        USERPROFILE: childHome,
        TMPDIR: childTemp,
        TEMP: childTemp,
        TMP: childTemp,
        npm_config_cache: npmCache,
        npm_config_userconfig: npmUserConfig,
        npm_config_update_notifier: 'false',
        npm_config_audit: 'false',
        npm_config_fund: 'false'
      }
    }
  }
  registry.registerProfile(profile)

  const tools = await registry.listStructuredTools([MCP_PROFILE_ID])
  const initializeHandshake = Array.isArray(tools)
  const toolsListed = tools.some(
    (tool) =>
      tool.tuffMetadata.source === 'mcp' &&
      tool.tuffMetadata.metadata?.profileId === MCP_PROFILE_ID &&
      tool.tuffMetadata.metadata?.toolName === 'read_text_file'
  )
  if (!toolsListed) throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')

  const result = await registry.callTool(MCP_PROFILE_ID, 'read_text_file', {
    path: canaryPath
  })
  const readTextFileCalled = true
  const roundTripCanaryMatched = JSON.stringify(result).includes(canary)
  const launcherIdentityBound =
    profile.transport.type === 'stdio' &&
    profile.transport.command === launcher.nodeExecutable &&
    profile.transport.args?.length === 4 &&
    profile.transport.args[0] === launcher.npxCli &&
    profile.transport.args[1] === '-y' &&
    profile.transport.args[2] === MCP_SERVER_PACKAGE &&
    profile.transport.args[3] === serverRoot
  const nodeHashMatched = launcher.nodeHashMatched
  const npxHashMatched = launcher.npxHashMatched
  const pathShimExcluded =
    path.isAbsolute(profile.transport.command) &&
    path.isAbsolute(profile.transport.args?.[0] ?? '') &&
    profile.transport.env?.PATH === launcher.safePath &&
    process.env.PATH === launcher.safePath
  const realStdio =
    launcherIdentityBound &&
    nodeHashMatched &&
    npxHashMatched &&
    pathShimExcluded &&
    initializeHandshake &&
    toolsListed &&
    readTextFileCalled

  const evidence = Object.freeze({
    explicitOptIn: process.env.TUFF_MCP_SMOKE === '1',
    realStdio,
    launcherIdentityBound,
    nodeHashMatched,
    npxHashMatched,
    pathShimExcluded,
    initializeHandshake,
    toolsListed,
    readTextFileCalled,
    roundTripCanaryMatched
  })
  if (Object.values(evidence).some((value) => value !== true)) {
    throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')
  }
  await verifyMcpLauncherUnchanged(launcher)
  return Object.freeze({
    evidence,
    launcher: Object.freeze({
      nodeSha256: launcher.nodeSha256,
      npxCliSha256: launcher.npxCliSha256
    })
  })
}

async function main(): Promise<void> {
  if (process.env.TUFF_MCP_SMOKE !== '1') {
    process.stderr.write('LIVE_MCP_SMOKE_OPT_IN_REQUIRED\n')
    app.exit(1)
    return
  }

  let isolatedProfilePath: string | undefined
  let registry: IntelligenceMcpRegistry | undefined
  let result: LiveMcpSmokeResult | undefined
  let runFailure: LiveMcpSmokeFailureCode | undefined
  let cleanupFailed = false

  try {
    const [{ IntelligenceMcpRegistry }, { loggerManager }] = await Promise.all([
      import('./modules/ai/intelligence-mcp-registry'),
      import('./utils/logger')
    ])
    loggerManager.setConfig({ levels: { 'Intelligence:McpRegistry': 'error' } })

    isolatedProfilePath = fsSync.mkdtempSync(
      path.join(os.tmpdir(), 'tuff-live-mcp-electron-profile-')
    )
    app.setPath('userData', isolatedProfilePath)
    await app.whenReady()

    const [profileReal, userDataReal] = await Promise.all([
      fs.realpath(isolatedProfilePath),
      fs.realpath(app.getPath('userData'))
    ])
    if (profileReal !== userDataReal) {
      throw new LiveMcpSmokeError('LIVE_MCP_SMOKE_ASSERTION_FAILED')
    }

    const launcher = await resolveMcpLauncher()
    registry = new IntelligenceMcpRegistry()
    result = await withTimeout(runLiveMcpSmoke(registry, isolatedProfilePath, launcher))
  } catch (error) {
    runFailure = failureCode(error)
  } finally {
    if (registry) {
      try {
        await registry.closeAll()
      } catch {
        cleanupFailed = true
      }
    }
    if (isolatedProfilePath) {
      try {
        await fs.rm(isolatedProfilePath, { recursive: true, force: true })
      } catch {
        cleanupFailed = true
      }
      if (fsSync.existsSync(isolatedProfilePath)) cleanupFailed = true
    }
  }

  if (cleanupFailed) runFailure = 'LIVE_MCP_SMOKE_CLEANUP_FAILED'
  if (runFailure || !result || !isolatedProfilePath) {
    process.stderr.write(`${runFailure ?? 'LIVE_MCP_SMOKE_FAILED'}\n`)
    app.exit(1)
    return
  }

  const evidence = Object.freeze({
    ...result.evidence,
    isolatedProfileRemoved: !fsSync.existsSync(isolatedProfilePath)
  })
  if (Object.values(evidence).some((value) => value !== true)) {
    process.stderr.write('LIVE_MCP_SMOKE_CLEANUP_FAILED\n')
    app.exit(1)
    return
  }

  process.stdout.write(`${JSON.stringify({ ok: true, launcher: result.launcher, evidence })}\n`)
  app.exit(0)
}

void main().catch(() => {
  process.stderr.write('LIVE_MCP_SMOKE_FAILED\n')
  app.exit(1)
})
