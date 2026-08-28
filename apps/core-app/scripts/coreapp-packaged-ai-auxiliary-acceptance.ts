#!/usr/bin/env tsx
import { listPackage, statFile, uncache } from '@electron/asar'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, lstatSync, type BigIntStats } from 'node:fs'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  unlink,
  type FileHandle
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  ORCHESTRATOR_PRIVACY_GATE_KEYS,
  type OrchestratorPrivacyGateChecks
} from '../src/main/modules/privacy/orchestrator-run-privacy-gates'
import { readAppBundleVersion } from './coreapp-packaged-ai-provider-acceptance'

export const LIVE_MCP_ACCEPTANCE_SCHEMA = 'tuff.live-mcp-acceptance.v2'
export const PRIVACY_LIFECYCLE_ACCEPTANCE_SCHEMA =
  'tuff.orchestrator-privacy-lifecycle-acceptance.v2'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024
const CHILD_TERMINATION_GRACE_MS = 2_000
const LIVE_MCP_TIMEOUT_MS = 150_000
const PRIVACY_SMOKE_TIMEOUT_MS = 60_000
const PROCESS_MARKER_ENV = 'TUFF_AUXILIARY_PROCESS_MARKER'
const PROCESS_MARKER_PATTERN = /^[a-f0-9-]{36}$/
const MAX_PROCESS_TABLE_BYTES = 32 * 1024 * 1024
const MAX_OUTPUT_DIRECTORY_RECOVERY_ENTRIES = 1_024
const REQUIRED_UNPACKED_PREFIXES = Object.freeze([
  'node_modules/@libsql/',
  'node_modules/libsql/',
  'node_modules/@neon-rs/',
  'node_modules/detect-libc/'
] as const)
const MAX_UNPACKED_FILE_COUNT = 10_000
const MAX_UNPACKED_TOTAL_BYTES = 256 * 1024 * 1024

export const PRIVACY_GATE_KEYS = ORCHESTRATOR_PRIVACY_GATE_KEYS

const LIVE_MCP_EVIDENCE_KEYS = Object.freeze([
  'explicitOptIn',
  'realStdio',
  'launcherIdentityBound',
  'nodeHashMatched',
  'npxHashMatched',
  'pathShimExcluded',
  'initializeHandshake',
  'toolsListed',
  'readTextFileCalled',
  'roundTripCanaryMatched',
  'isolatedProfileRemoved'
] as const)

const PRIVACY_SMOKE_BOOLEAN_KEYS = Object.freeze([
  'builtEntrypoint',
  'isolatedUserData',
  'artifactsUnderIsolatedProfile',
  'handlerRegistrationExact',
  'handlerInvocationExact',
  'policy',
  'policyUpdate',
  'summary',
  'cleanupPreview',
  'cleanup',
  'deletePreviewProven',
  'deleteRunProven',
  'orchestratorRunDeleteProven',
  'exported',
  'exportFormat',
  'exportDialogOwned',
  'providerDisclosure',
  'disclosureRedacted',
  'backupPreview',
  'backup',
  'restore',
  'restored',
  'restoreDialogOwned',
  'noReports',
  'syntheticOnly',
  'handlerTeardown',
  'runArtifactsRemoved',
  'isolatedProfileRemoved'
] as const)

const PRIVACY_SMOKE_EVIDENCE_KEYS = Object.freeze([
  ...PRIVACY_SMOKE_BOOLEAN_KEYS,
  'packagedPrivacyGates',
  'handlerCount',
  'ownerDeleteCalls',
  'reports'
] as const)

export type AuxiliaryAcceptanceErrorCode =
  | 'ARGUMENT_INVALID'
  | 'APP_BUNDLE_INVALID'
  | 'APP_ASAR_INVALID'
  | 'APP_ASAR_SNAPSHOT_FAILED'
  | 'APP_IDENTITY_INVALID'
  | 'WORKSPACE_ELECTRON_INVALID'
  | 'WORKSPACE_NODE_INVALID'
  | 'WORKSPACE_NPX_INVALID'
  | 'LIVE_MCP_TIMEOUT'
  | 'LIVE_MCP_OUTPUT_LIMIT_EXCEEDED'
  | 'LIVE_MCP_PROCESS_FAILED'
  | 'LIVE_MCP_OUTPUT_INVALID'
  | 'LIVE_MCP_EVIDENCE_FAILED'
  | 'PRIVACY_SMOKE_TIMEOUT'
  | 'PRIVACY_SMOKE_OUTPUT_LIMIT_EXCEEDED'
  | 'PRIVACY_SMOKE_PROCESS_FAILED'
  | 'PRIVACY_SMOKE_OUTPUT_INVALID'
  | 'PRIVACY_SMOKE_EVIDENCE_FAILED'
  | 'APP_ASAR_CHANGED'
  | 'OUTPUT_PATH_COLLISION'
  | 'OUTPUT_SYMLINK'
  | 'OUTPUT_EXISTS'
  | 'OUTPUT_WRITE_FAILED'
  | 'AUXILIARY_ACCEPTANCE_FAILED'

export class AuxiliaryAcceptanceError extends Error {
  constructor(readonly code: AuxiliaryAcceptanceErrorCode) {
    super(code)
    this.name = 'AuxiliaryAcceptanceError'
  }
}

export interface AuxiliaryAcceptanceOptions {
  appBundle: string
  liveMcpOutput: string
  privacyLifecycleOutput: string
}

export interface ChildCommand {
  executable: string
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  maxStdoutBytes: number
  maxStderrBytes: number
  processMarker: string
}

export interface ChildResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputExceeded: boolean
  spawnFailed: boolean
  descendantsDetected: boolean
}

interface AppIdentity {
  version: string
  hash: string
}

export interface LiveMcpReportChecks {
  explicitOptIn: true
  realStdio: true
  launcherIdentityBound: true
  nodeHashMatched: true
  npxHashMatched: true
  pathShimExcluded: true
  initializeHandshake: true
  toolsListed: true
  readTextFileCalled: true
  roundTripCanaryMatched: true
}

type PrivacyReportChecks = OrchestratorPrivacyGateChecks & {
  productionSmoke: true
}

interface StableFileIdentity {
  readonly dev: string
  readonly ino: string
  readonly size: number
  readonly mtimeNs: string
  readonly ctimeNs: string
}

interface StableNodeIdentity {
  readonly dev: string
  readonly ino: string
}

interface SnapshotUnpackedFile {
  readonly relativePath: string
  readonly size: number
  readonly hash: string
  readonly sourceIdentity: StableFileIdentity
  readonly snapshotIdentity: StableFileIdentity
}

export interface AppAsarSnapshot {
  readonly sourcePath: string
  readonly snapshotPath: string
  readonly directory: string
  readonly sourceIdentity: StableFileIdentity
  readonly snapshotIdentity: StableFileIdentity
  readonly hash: string
  readonly unpackedFiles: readonly SnapshotUnpackedFile[]
}

export interface McpLauncherIdentity {
  readonly nodeExecutable: string
  readonly nodeHash: string
  readonly npxCli: string
  readonly npxHash: string
  readonly safePath: string
}

export interface LiveMcpAcceptanceReport {
  schema: typeof LIVE_MCP_ACCEPTANCE_SCHEMA
  ok: true
  checkedAt: string
  app: AppIdentity
  launcher: {
    nodeSha256: string
    npxCliSha256: string
  }
  checks: LiveMcpReportChecks
  failures: []
}

export interface PrivacyLifecycleAcceptanceReport {
  schema: typeof PRIVACY_LIFECYCLE_ACCEPTANCE_SCHEMA
  ok: true
  checkedAt: string
  app: AppIdentity
  gateProvenance: 'packaged-app-asar'
  checks: PrivacyReportChecks
  failures: []
}

interface AuxiliaryAcceptanceReports {
  liveMcp: LiveMcpAcceptanceReport
  privacyLifecycle: PrivacyLifecycleAcceptanceReport
}

export interface AuxiliaryAcceptanceDependencies {
  readBundleVersion(appBundle: string): Promise<string>
  prepareAppAsarSnapshot(appAsar: string): Promise<AppAsarSnapshot>
  verifyAppAsarSnapshot(snapshot: AppAsarSnapshot): Promise<void>
  verifyAppAsarSource(snapshot: AppAsarSnapshot): Promise<void>
  cleanupAppAsarSnapshot(snapshot: AppAsarSnapshot): Promise<void>
  resolveElectronExecutable(): string
  resolveMcpLauncher(): Promise<McpLauncherIdentity>
  runChild(command: ChildCommand): Promise<ChildResult>
  now(): Date
  writeReports(
    options: Pick<AuxiliaryAcceptanceOptions, 'liveMcpOutput' | 'privacyLifecycleOutput'>,
    reports: AuxiliaryAcceptanceReports,
    beforeCommit?: () => Promise<void>
  ): Promise<void>
}

type JsonRecord = Record<string, unknown>

function fail(code: AuxiliaryAcceptanceErrorCode): never {
  throw new AuxiliaryAcceptanceError(code)
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function parseSingleLineJson(raw: string, code: AuxiliaryAcceptanceErrorCode): unknown {
  if (!raw || raw.includes('\0')) fail(code)
  const normalized = raw.endsWith('\r\n')
    ? raw.slice(0, -2)
    : raw.endsWith('\n')
      ? raw.slice(0, -1)
      : raw
  if (
    !normalized ||
    normalized.includes('\n') ||
    normalized.includes('\r') ||
    normalized.trim() !== normalized
  ) {
    fail(code)
  }
  try {
    return JSON.parse(normalized) as unknown
  } catch {
    fail(code)
  }
}

export function parseLiveMcpSmokeOutput(
  raw: string,
  expectedLauncher: Pick<McpLauncherIdentity, 'nodeHash' | 'npxHash'>
): LiveMcpReportChecks {
  const value = parseSingleLineJson(raw, 'LIVE_MCP_OUTPUT_INVALID')
  if (
    !hasExactKeys(value, ['ok', 'launcher', 'evidence']) ||
    value.ok !== true ||
    !hasExactKeys(value.launcher, ['nodeSha256', 'npxCliSha256']) ||
    typeof value.launcher.nodeSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.launcher.nodeSha256) ||
    typeof value.launcher.npxCliSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.launcher.npxCliSha256) ||
    !hasExactKeys(value.evidence, LIVE_MCP_EVIDENCE_KEYS)
  ) {
    fail('LIVE_MCP_OUTPUT_INVALID')
  }
  if (
    value.launcher.nodeSha256 !== expectedLauncher.nodeHash ||
    value.launcher.npxCliSha256 !== expectedLauncher.npxHash ||
    LIVE_MCP_EVIDENCE_KEYS.some((key) => value.evidence[key] !== true)
  ) {
    fail('LIVE_MCP_EVIDENCE_FAILED')
  }
  return {
    explicitOptIn: true,
    realStdio: true,
    launcherIdentityBound: true,
    nodeHashMatched: true,
    npxHashMatched: true,
    pathShimExcluded: true,
    initializeHandshake: true,
    toolsListed: true,
    readTextFileCalled: true,
    roundTripCanaryMatched: true
  }
}

export function parsePrivacySmokeOutput(raw: string): PrivacyReportChecks {
  const value = parseSingleLineJson(raw, 'PRIVACY_SMOKE_OUTPUT_INVALID')
  if (
    !hasExactKeys(value, ['ok', 'evidence']) ||
    value.ok !== true ||
    !hasExactKeys(value.evidence, PRIVACY_SMOKE_EVIDENCE_KEYS) ||
    !isNonNegativeInteger(value.evidence.handlerCount) ||
    value.evidence.handlerCount === 0 ||
    value.evidence.ownerDeleteCalls !== 2 ||
    !hasExactKeys(value.evidence.packagedPrivacyGates, PRIVACY_GATE_KEYS) ||
    !Array.isArray(value.evidence.reports) ||
    value.evidence.reports.length !== 0
  ) {
    fail('PRIVACY_SMOKE_OUTPUT_INVALID')
  }
  if (PRIVACY_SMOKE_BOOLEAN_KEYS.some((key) => value.evidence[key] !== true)) {
    fail('PRIVACY_SMOKE_EVIDENCE_FAILED')
  }
  if (PRIVACY_GATE_KEYS.some((key) => value.evidence.packagedPrivacyGates[key] !== true)) {
    fail('PRIVACY_SMOKE_EVIDENCE_FAILED')
  }
  return {
    ...(value.evidence.packagedPrivacyGates as OrchestratorPrivacyGateChecks),
    productionSmoke: true
  }
}

function signalChildProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      process.kill(pid, signal)
    } else {
      process.kill(-pid, signal)
    }
  } catch {
    // The child may have settled between the state check and the signal.
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch {
    // The marked process may have settled between discovery and signalling.
  }
}

function isChildProcessGroupAlive(pid: number | undefined): boolean {
  if (!pid || process.platform === 'win32') return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitForChildProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (isChildProcessGroupAlive(pid) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  return !isChildProcessGroupAlive(pid)
}

async function readMarkedProcessIds(marker: string): Promise<number[]> {
  if (process.platform === 'win32') throw new Error('PROCESS_TABLE_UNSUPPORTED')
  const executable = process.platform === 'darwin' ? '/bin/ps' : '/usr/bin/ps'
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ['eww', '-axo', 'pid=,command='], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(Buffer.concat(chunks).toString('utf8'))
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return
      bytes += chunk.length
      if (bytes > MAX_PROCESS_TABLE_BYTES) {
        child.kill('SIGKILL')
        finish(new Error('PROCESS_TABLE_TOO_LARGE'))
        return
      }
      chunks.push(chunk)
    })
    child.once('error', () => finish(new Error('PROCESS_TABLE_FAILED')))
    child.once('close', (exitCode) => {
      if (exitCode !== 0) finish(new Error('PROCESS_TABLE_FAILED'))
      else finish()
    })
  })
  const markerNeedle = `${PROCESS_MARKER_ENV}=${marker}`
  return output
    .split('\n')
    .filter((line) => line.includes(markerNeedle))
    .map((line) => Number(/^\s*(\d+)/.exec(line)?.[1] ?? 0))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid)
}

async function waitForMarkedProcessesExit(marker: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await readMarkedProcessIds(marker)).length === 0) return true
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  return (await readMarkedProcessIds(marker)).length === 0
}

async function cleanupDescendantProcesses(
  pid: number | undefined,
  marker: string
): Promise<boolean> {
  if (process.platform === 'win32') return true
  let descendantsDetected = false
  if (pid && isChildProcessGroupAlive(pid)) {
    descendantsDetected = true
    signalChildProcessGroup(pid, 'SIGTERM')
    if (!(await waitForChildProcessGroupExit(pid, CHILD_TERMINATION_GRACE_MS))) {
      signalChildProcessGroup(pid, 'SIGKILL')
      await waitForChildProcessGroupExit(pid, CHILD_TERMINATION_GRACE_MS)
    }
  }
  try {
    let markedPids = await readMarkedProcessIds(marker)
    if (markedPids.length === 0) return descendantsDetected
    descendantsDetected = true
    for (const markedPid of markedPids) signalProcess(markedPid, 'SIGTERM')
    if (!(await waitForMarkedProcessesExit(marker, CHILD_TERMINATION_GRACE_MS))) {
      markedPids = await readMarkedProcessIds(marker)
      for (const markedPid of markedPids) signalProcess(markedPid, 'SIGKILL')
      if (!(await waitForMarkedProcessesExit(marker, CHILD_TERMINATION_GRACE_MS))) return true
    }
    return descendantsDetected
  } catch {
    // A successful acceptance run must prove that no marked descendants survived.
    return true
  }
}

export async function runBoundedChild(command: ChildCommand): Promise<ChildResult> {
  return await new Promise<ChildResult>((resolve) => {
    if (
      !PROCESS_MARKER_PATTERN.test(command.processMarker) ||
      command.env[PROCESS_MARKER_ENV] !== command.processMarker
    ) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        spawnFailed: true,
        descendantsDetected: true
      })
      return
    }
    let child
    try {
      child = spawn(command.executable, [...command.args], {
        cwd: command.cwd,
        env: command.env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch {
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        spawnFailed: true,
        descendantsDetected: false
      })
      return
    }

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let outputExceeded = false
    let spawnFailed = false
    let terminationRequested = false
    let forceTimer: NodeJS.Timeout | undefined

    const terminate = (): void => {
      if (terminationRequested) return
      terminationRequested = true
      signalChildProcessGroup(child.pid, 'SIGTERM')
      forceTimer = setTimeout(
        () => signalChildProcessGroup(child.pid, 'SIGKILL'),
        CHILD_TERMINATION_GRACE_MS
      )
      forceTimer.unref()
    }

    const collect = (
      chunks: Buffer[],
      chunk: Buffer,
      currentBytes: number,
      maximumBytes: number
    ): number => {
      const remaining = Math.max(0, maximumBytes - currentBytes)
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      const nextBytes = currentBytes + chunk.length
      if (nextBytes > maximumBytes) {
        outputExceeded = true
        terminate()
      }
      return nextBytes
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes = collect(stdoutChunks, chunk, stdoutBytes, command.maxStdoutBytes)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes = collect(stderrChunks, chunk, stderrBytes, command.maxStderrBytes)
    })
    child.once('error', () => {
      spawnFailed = true
    })

    const deadline = setTimeout(() => {
      timedOut = true
      terminate()
    }, command.timeoutMs)

    child.once('close', (exitCode, signal) => {
      clearTimeout(deadline)
      if (forceTimer) clearTimeout(forceTimer)
      void cleanupDescendantProcesses(child.pid, command.processMarker).then(
        (descendantsDetected) => {
          resolve({
            exitCode,
            signal,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
            timedOut,
            outputExceeded,
            spawnFailed,
            descendantsDetected
          })
        }
      )
    })
  })
}

function assertChildSucceeded(
  result: ChildResult,
  codes: {
    timeout: AuxiliaryAcceptanceErrorCode
    outputLimit: AuxiliaryAcceptanceErrorCode
    processFailed: AuxiliaryAcceptanceErrorCode
  }
): void {
  if (result.timedOut) fail(codes.timeout)
  if (result.outputExceeded) fail(codes.outputLimit)
  if (
    result.spawnFailed ||
    result.descendantsDetected ||
    result.exitCode !== 0 ||
    result.signal !== null
  ) {
    fail(codes.processFailed)
  }
}

async function executeChild(
  dependencies: AuxiliaryAcceptanceDependencies,
  command: ChildCommand,
  processFailedCode: AuxiliaryAcceptanceErrorCode
): Promise<ChildResult> {
  try {
    return await dependencies.runChild(command)
  } catch {
    fail(processFailedCode)
  }
}

function resolveWorkspaceElectronExecutable(): string {
  const require = createRequire(import.meta.url)
  let executable: unknown
  try {
    executable = require('electron') as unknown
  } catch {
    fail('WORKSPACE_ELECTRON_INVALID')
  }
  if (typeof executable !== 'string') fail('WORKSPACE_ELECTRON_INVALID')
  try {
    const stats = lstatSync(executable)
    if (!stats.isFile() || stats.isSymbolicLink()) fail('WORKSPACE_ELECTRON_INVALID')
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail('WORKSPACE_ELECTRON_INVALID')
  }
  return executable
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

async function lstatStableRegularFile(
  filePath: string,
  code: AuxiliaryAcceptanceErrorCode
): Promise<StableFileIdentity> {
  try {
    const stats = await lstat(filePath, { bigint: true })
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size < 1n ||
      stats.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      fail(code)
    }
    return stableIdentity(stats)
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail(code)
  }
}

async function copyStableRegularFile(
  sourcePath: string,
  targetPath: string,
  code: AuxiliaryAcceptanceErrorCode,
  expected?: { readonly size: number; readonly hash: string }
): Promise<{
  sourceIdentity: StableFileIdentity
  targetIdentity: StableFileIdentity
  hash: string
}> {
  const before = await lstatStableRegularFile(sourcePath, code)
  if (expected && (before.size !== expected.size || !SHA256_PATTERN.test(expected.hash))) fail(code)
  await mkdir(path.dirname(targetPath), { recursive: true })
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  let source
  let target
  try {
    source = await open(sourcePath, fsConstants.O_RDONLY | noFollow)
    const openedSource = stableIdentity(await source.stat({ bigint: true }))
    if (!sameStableIdentity(before, openedSource)) fail(code)
    target = await open(
      targetPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o600
    )

    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (position < before.size) {
      const length = Math.min(buffer.length, before.size - position)
      const { bytesRead } = await source.read(buffer, 0, length, position)
      if (bytesRead <= 0) fail(code)
      digest.update(buffer.subarray(0, bytesRead))
      let written = 0
      while (written < bytesRead) {
        const result = await target.write(buffer, written, bytesRead - written, position + written)
        if (result.bytesWritten <= 0) fail(code)
        written += result.bytesWritten
      }
      position += bytesRead
    }
    await target.sync()
    const afterHandle = stableIdentity(await source.stat({ bigint: true }))
    const afterPath = await lstatStableRegularFile(sourcePath, code)
    if (
      position !== before.size ||
      !sameStableIdentity(before, afterHandle) ||
      !sameStableIdentity(before, afterPath)
    ) {
      fail(code)
    }
    const hash = digest.digest('hex')
    if (expected && (expected.size !== position || expected.hash !== hash)) fail(code)
    await target.chmod(0o400)
    const targetIdentity = stableIdentity(await target.stat({ bigint: true }))
    if (targetIdentity.size !== before.size) fail(code)
    await source.close()
    source = undefined
    await target.close()
    target = undefined
    return { sourceIdentity: before, targetIdentity, hash }
  } catch (error) {
    await source?.close().catch(() => undefined)
    await target?.close().catch(() => undefined)
    await unlink(targetPath).catch(() => undefined)
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail(code)
  }
}

async function hashStableRegularFile(
  filePath: string,
  expectedIdentity: StableFileIdentity,
  code: AuxiliaryAcceptanceErrorCode
): Promise<string> {
  const before = await lstatStableRegularFile(filePath, code)
  if (!sameStableIdentity(before, expectedIdentity)) fail(code)
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  let handle
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | noFollow)
    const opened = stableIdentity(await handle.stat({ bigint: true }))
    if (!sameStableIdentity(opened, expectedIdentity)) fail(code)
    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (position < expectedIdentity.size) {
      const length = Math.min(buffer.length, expectedIdentity.size - position)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      if (bytesRead <= 0) fail(code)
      digest.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const afterHandle = stableIdentity(await handle.stat({ bigint: true }))
    const afterPath = await lstatStableRegularFile(filePath, code)
    if (
      position !== expectedIdentity.size ||
      !sameStableIdentity(afterHandle, expectedIdentity) ||
      !sameStableIdentity(afterPath, expectedIdentity)
    ) {
      fail(code)
    }
    return digest.digest('hex')
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail(code)
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export function normalizeAsarEntry(entry: string): string {
  if (!entry || entry.includes('\0')) fail('APP_ASAR_SNAPSHOT_FAILED')
  const normalized = entry.replaceAll('\\', '/')
  if (normalized.startsWith('//') || /^[A-Za-z]:\//.test(normalized) || normalized.endsWith('/')) {
    fail('APP_ASAR_SNAPSHOT_FAILED')
  }
  const relativePath = normalized.startsWith('/') ? normalized.slice(1) : normalized
  const segments = relativePath.split('/')
  if (
    !relativePath ||
    path.posix.isAbsolute(relativePath) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail('APP_ASAR_SNAPSHOT_FAILED')
  }
  return relativePath
}

async function snapshotRequiredUnpackedFiles(
  sourceAppAsar: string,
  snapshotAppAsar: string
): Promise<SnapshotUnpackedFile[]> {
  uncache(snapshotAppAsar)
  const entries = listPackage(snapshotAppAsar, { isPack: false }).map(normalizeAsarEntry)
  const unpackedMetadata: Array<Pick<SnapshotUnpackedFile, 'relativePath' | 'size' | 'hash'>> = []
  let totalBytes = 0

  for (const relativePath of entries) {
    if (!REQUIRED_UNPACKED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) continue
    const metadata = statFile(snapshotAppAsar, relativePath, false)
    if (!('size' in metadata) || metadata.unpacked !== true) continue
    const integrity = metadata.integrity
    const hash = integrity?.hash
    if (
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      integrity?.algorithm !== 'SHA256' ||
      typeof hash !== 'string' ||
      !SHA256_PATTERN.test(hash)
    ) {
      fail('APP_ASAR_SNAPSHOT_FAILED')
    }
    unpackedMetadata.push({ relativePath, size: metadata.size, hash })
    totalBytes += metadata.size
    if (
      unpackedMetadata.length > MAX_UNPACKED_FILE_COUNT ||
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > MAX_UNPACKED_TOTAL_BYTES
    ) {
      fail('APP_ASAR_SNAPSHOT_FAILED')
    }
  }
  if (unpackedMetadata.length === 0) fail('APP_ASAR_SNAPSHOT_FAILED')

  const unpacked: SnapshotUnpackedFile[] = []
  for (const file of unpackedMetadata) {
    const copied = await copyStableRegularFile(
      path.join(`${sourceAppAsar}.unpacked`, file.relativePath),
      path.join(`${snapshotAppAsar}.unpacked`, file.relativePath),
      'APP_ASAR_SNAPSHOT_FAILED',
      file
    )
    unpacked.push({
      ...file,
      sourceIdentity: copied.sourceIdentity,
      snapshotIdentity: copied.targetIdentity
    })
  }
  return unpacked
}

export async function prepareAppAsarSnapshot(sourcePath: string): Promise<AppAsarSnapshot> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tuff-ai-auxiliary-asar-'))
  const snapshotPath = path.join(directory, 'app.asar')
  try {
    const copied = await copyStableRegularFile(sourcePath, snapshotPath, 'APP_ASAR_SNAPSHOT_FAILED')
    const unpackedFiles = await snapshotRequiredUnpackedFiles(sourcePath, snapshotPath)
    return Object.freeze({
      sourcePath,
      snapshotPath,
      directory,
      sourceIdentity: copied.sourceIdentity,
      snapshotIdentity: copied.targetIdentity,
      hash: copied.hash,
      unpackedFiles: Object.freeze(unpackedFiles)
    })
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail('APP_ASAR_SNAPSHOT_FAILED')
  }
}

export async function verifyAppAsarSnapshot(snapshot: AppAsarSnapshot): Promise<void> {
  const [sourceHash, snapshotHash] = await Promise.all([
    hashStableRegularFile(snapshot.sourcePath, snapshot.sourceIdentity, 'APP_ASAR_CHANGED'),
    hashStableRegularFile(
      snapshot.snapshotPath,
      snapshot.snapshotIdentity,
      'APP_ASAR_SNAPSHOT_FAILED'
    )
  ])
  if (sourceHash !== snapshot.hash) fail('APP_ASAR_CHANGED')
  if (snapshotHash !== snapshot.hash) fail('APP_ASAR_SNAPSHOT_FAILED')
  for (const file of snapshot.unpackedFiles) {
    const sourcePath = path.join(`${snapshot.sourcePath}.unpacked`, file.relativePath)
    const snapshotPath = path.join(`${snapshot.snapshotPath}.unpacked`, file.relativePath)
    const [sourceUnpackedHash, snapshotUnpackedHash] = await Promise.all([
      hashStableRegularFile(sourcePath, file.sourceIdentity, 'APP_ASAR_CHANGED'),
      hashStableRegularFile(snapshotPath, file.snapshotIdentity, 'APP_ASAR_SNAPSHOT_FAILED')
    ])
    if (sourceUnpackedHash !== file.hash) fail('APP_ASAR_CHANGED')
    if (snapshotUnpackedHash !== file.hash) fail('APP_ASAR_SNAPSHOT_FAILED')
  }
}

export async function verifyAppAsarSource(snapshot: AppAsarSnapshot): Promise<void> {
  const sourceHash = await hashStableRegularFile(
    snapshot.sourcePath,
    snapshot.sourceIdentity,
    'APP_ASAR_CHANGED'
  )
  if (sourceHash !== snapshot.hash) fail('APP_ASAR_CHANGED')
  for (const file of snapshot.unpackedFiles) {
    const sourcePath = path.join(`${snapshot.sourcePath}.unpacked`, file.relativePath)
    const hash = await hashStableRegularFile(sourcePath, file.sourceIdentity, 'APP_ASAR_CHANGED')
    if (hash !== file.hash) fail('APP_ASAR_CHANGED')
  }
}

export async function cleanupAppAsarSnapshot(snapshot: AppAsarSnapshot): Promise<void> {
  await rm(snapshot.directory, { recursive: true, force: true })
}

async function resolveWorkspaceMcpLauncher(): Promise<McpLauncherIdentity> {
  let nodeExecutable: string
  try {
    nodeExecutable = await realpath(process.execPath)
  } catch {
    fail('WORKSPACE_NODE_INVALID')
  }
  const nodeIdentity = await lstatStableRegularFile(nodeExecutable, 'WORKSPACE_NODE_INVALID')
  const nodeHash = await hashStableRegularFile(
    nodeExecutable,
    nodeIdentity,
    'WORKSPACE_NODE_INVALID'
  )
  const nodeRoot = path.resolve(path.dirname(nodeExecutable), '..')
  const npxCandidate = path.join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')
  let npxCli: string
  try {
    npxCli = await realpath(npxCandidate)
  } catch {
    fail('WORKSPACE_NPX_INVALID')
  }
  const relativeNpx = path.relative(nodeRoot, npxCli)
  if (!relativeNpx || relativeNpx.startsWith('..') || path.isAbsolute(relativeNpx)) {
    fail('WORKSPACE_NPX_INVALID')
  }
  const npxIdentity = await lstatStableRegularFile(npxCli, 'WORKSPACE_NPX_INVALID')
  const npxHash = await hashStableRegularFile(npxCli, npxIdentity, 'WORKSPACE_NPX_INVALID')
  return Object.freeze({
    nodeExecutable,
    nodeHash,
    npxCli,
    npxHash,
    safePath: [path.dirname(nodeExecutable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(
      path.delimiter
    )
  })
}

export function buildAuxiliaryChildEnv(
  source: NodeJS.ProcessEnv,
  additions: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const inheritedKeys = [
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'NODE_ENV',
    'PATHEXT',
    'SystemRoot',
    'WINDIR',
    'ComSpec'
  ] as const
  for (const key of inheritedKeys) {
    const value = source[key]
    if (value !== undefined) env[key] = value
  }
  Object.assign(env, additions)
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  return env
}

function defaultDependencies(): AuxiliaryAcceptanceDependencies {
  return {
    readBundleVersion: readAppBundleVersion,
    prepareAppAsarSnapshot,
    verifyAppAsarSnapshot,
    verifyAppAsarSource,
    cleanupAppAsarSnapshot,
    resolveElectronExecutable: resolveWorkspaceElectronExecutable,
    resolveMcpLauncher: resolveWorkspaceMcpLauncher,
    runChild: runBoundedChild,
    now: () => new Date(),
    writeReports: writeAuxiliaryAcceptanceReports
  }
}

async function statRequiredRegularFile(
  filePath: string,
  code: AuxiliaryAcceptanceErrorCode
): Promise<void> {
  try {
    const stats = await lstat(filePath)
    if (!stats.isFile() || stats.isSymbolicLink()) fail(code)
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail(code)
  }
}

async function resolveAppAsar(appBundle: string): Promise<string> {
  if (path.extname(appBundle).toLowerCase() !== '.app') fail('APP_BUNDLE_INVALID')
  try {
    const stats = await lstat(appBundle)
    if (!stats.isDirectory() || stats.isSymbolicLink()) fail('APP_BUNDLE_INVALID')
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail('APP_BUNDLE_INVALID')
  }
  const appAsar = path.join(appBundle, 'Contents', 'Resources', 'app.asar')
  await statRequiredRegularFile(appAsar, 'APP_ASAR_INVALID')
  await statRequiredRegularFile(
    path.join(appBundle, 'Contents', 'Info.plist'),
    'APP_BUNDLE_INVALID'
  )
  return appAsar
}

function validateIdentity(version: string, hash: string): AppIdentity {
  if (!SAFE_VERSION_PATTERN.test(version) || !SHA256_PATTERN.test(hash)) {
    fail('APP_IDENTITY_INVALID')
  }
  return { version, hash }
}

async function assertOutputTargetAvailable(outputPath: string): Promise<void> {
  try {
    const stats = await lstat(outputPath)
    if (stats.isSymbolicLink()) fail('OUTPUT_SYMLINK')
    fail('OUTPUT_EXISTS')
  } catch (error) {
    if (error instanceof AuxiliaryAcceptanceError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('OUTPUT_WRITE_FAILED')
  }
}

function stableNodeIdentity(stats: BigIntStats): StableNodeIdentity {
  return { dev: stats.dev.toString(), ino: stats.ino.toString() }
}

function sameStableNodeIdentity(left: StableNodeIdentity, right: StableNodeIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

interface PreparedOutput {
  targetPath: string
  temporaryPath: string
  directory: string
  parentDirectory: string
  fileHandle: FileHandle
  directoryHandle: FileHandle
  fileIdentity: StableNodeIdentity
  directoryIdentity: StableNodeIdentity
  parentDirectoryIdentity: StableNodeIdentity
  published: boolean
}

async function prepareOutput(targetPath: string, content: string): Promise<PreparedOutput> {
  const requestedTarget = path.resolve(targetPath)
  const requestedDirectory = path.dirname(requestedTarget)
  await mkdir(requestedDirectory, { recursive: true })
  const directory = await realpath(requestedDirectory)
  const canonicalTarget = path.join(directory, path.basename(requestedTarget))
  await assertOutputTargetAvailable(canonicalTarget)
  const parentDirectory = path.dirname(directory)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(canonicalTarget)}.${randomUUID()}.tmp`
  )
  let fileHandle: FileHandle | undefined
  let directoryHandle: FileHandle | undefined
  try {
    const [directoryStats, parentDirectoryStats] = await Promise.all([
      lstat(directory, { bigint: true }),
      lstat(parentDirectory, { bigint: true })
    ])
    if (
      !directoryStats.isDirectory() ||
      directoryStats.isSymbolicLink() ||
      !parentDirectoryStats.isDirectory() ||
      parentDirectoryStats.isSymbolicLink()
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    const directoryIdentity = stableNodeIdentity(directoryStats)
    const parentDirectoryIdentity = stableNodeIdentity(parentDirectoryStats)
    directoryHandle = await open(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0))
    const openedDirectoryIdentity = stableNodeIdentity(await directoryHandle.stat({ bigint: true }))
    if (!sameStableNodeIdentity(directoryIdentity, openedDirectoryIdentity)) {
      fail('OUTPUT_WRITE_FAILED')
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    fileHandle = await open(
      temporaryPath,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o600
    )
    await fileHandle.writeFile(content, 'utf8')
    await fileHandle.sync()
    return {
      targetPath: canonicalTarget,
      temporaryPath,
      directory,
      parentDirectory,
      fileHandle,
      directoryHandle,
      fileIdentity: stableNodeIdentity(await fileHandle.stat({ bigint: true })),
      directoryIdentity,
      parentDirectoryIdentity,
      published: false
    }
  } catch {
    await fileHandle?.close().catch(() => undefined)
    await directoryHandle?.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    fail('OUTPUT_WRITE_FAILED')
  }
}

async function assertPreparedDirectoryStable(output: PreparedOutput): Promise<void> {
  const [directoryStats, openedDirectoryStats] = await Promise.all([
    lstat(output.directory, { bigint: true }),
    output.directoryHandle.stat({ bigint: true })
  ])
  if (
    !directoryStats.isDirectory() ||
    directoryStats.isSymbolicLink() ||
    !sameStableNodeIdentity(output.directoryIdentity, stableNodeIdentity(directoryStats)) ||
    !sameStableNodeIdentity(output.directoryIdentity, stableNodeIdentity(openedDirectoryStats))
  ) {
    fail('OUTPUT_WRITE_FAILED')
  }
}

async function assertOwnedArtifact(
  artifactPath: string,
  identity: StableNodeIdentity
): Promise<void> {
  const stats = await lstat(artifactPath, { bigint: true })
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    !sameStableNodeIdentity(identity, stableNodeIdentity(stats))
  ) {
    fail('OUTPUT_WRITE_FAILED')
  }
}

async function resolvePreparedDirectoryForCleanup(
  output: PreparedOutput
): Promise<string | undefined> {
  try {
    const current = await lstat(output.directory, { bigint: true })
    if (
      current.isDirectory() &&
      !current.isSymbolicLink() &&
      sameStableNodeIdentity(output.directoryIdentity, stableNodeIdentity(current))
    ) {
      return output.directory
    }
  } catch {
    // A renamed directory may still be recoverable through its stable parent.
  }
  try {
    const parent = await lstat(output.parentDirectory, { bigint: true })
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      !sameStableNodeIdentity(output.parentDirectoryIdentity, stableNodeIdentity(parent))
    ) {
      return undefined
    }
    const entries = await readdir(output.parentDirectory)
    if (entries.length > MAX_OUTPUT_DIRECTORY_RECOVERY_ENTRIES) return undefined
    for (const entry of entries) {
      const candidate = path.join(output.parentDirectory, entry)
      const stats = await lstat(candidate, { bigint: true }).catch(() => undefined)
      if (
        stats?.isDirectory() &&
        !stats.isSymbolicLink() &&
        sameStableNodeIdentity(output.directoryIdentity, stableNodeIdentity(stats))
      ) {
        return candidate
      }
    }
  } catch {
    // Cleanup remains fail-closed if ownership cannot be proven.
  }
  return undefined
}

async function unlinkOwnedArtifact(
  directory: string | undefined,
  basename: string,
  identity: StableNodeIdentity
): Promise<void> {
  if (!directory) return
  const artifactPath = path.join(directory, basename)
  try {
    const stats = await lstat(artifactPath, { bigint: true })
    if (
      stats.isFile() &&
      !stats.isSymbolicLink() &&
      sameStableNodeIdentity(identity, stableNodeIdentity(stats))
    ) {
      await unlink(artifactPath)
    }
  } catch {
    // Never remove a path that cannot be proven to belong to this invocation.
  }
}

async function closePreparedOutputs(outputs: readonly PreparedOutput[]): Promise<void> {
  for (const output of outputs) {
    await output.fileHandle.close().catch(() => undefined)
    await output.directoryHandle.close().catch(() => undefined)
  }
}

function classifyPublishConflict(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EEXIST') fail('OUTPUT_EXISTS')
  fail('OUTPUT_WRITE_FAILED')
}

export async function writeAuxiliaryAcceptanceReports(
  options: Pick<AuxiliaryAcceptanceOptions, 'liveMcpOutput' | 'privacyLifecycleOutput'>,
  reports: AuxiliaryAcceptanceReports,
  beforeCommit?: () => Promise<void>
): Promise<void> {
  if (path.resolve(options.liveMcpOutput) === path.resolve(options.privacyLifecycleOutput)) {
    fail('OUTPUT_PATH_COLLISION')
  }
  await assertOutputTargetAvailable(options.liveMcpOutput)
  await assertOutputTargetAvailable(options.privacyLifecycleOutput)

  const contents = [
    [options.liveMcpOutput, `${JSON.stringify(reports.liveMcp, null, 2)}\n`],
    [options.privacyLifecycleOutput, `${JSON.stringify(reports.privacyLifecycle, null, 2)}\n`]
  ] as const
  const prepared: PreparedOutput[] = []

  try {
    for (const [targetPath, content] of contents) {
      prepared.push(await prepareOutput(targetPath, content))
    }
    await beforeCommit?.()
    for (const output of prepared) {
      await assertPreparedDirectoryStable(output)
      try {
        await link(output.temporaryPath, output.targetPath)
      } catch (error) {
        classifyPublishConflict(error)
      }
      output.published = true
      await assertOwnedArtifact(output.targetPath, output.fileIdentity)
    }
    await beforeCommit?.()
    for (const output of prepared) {
      await assertPreparedDirectoryStable(output)
      await assertOwnedArtifact(output.targetPath, output.fileIdentity)
      await assertOwnedArtifact(output.temporaryPath, output.fileIdentity)
      await unlink(output.temporaryPath)
      await output.directoryHandle.sync()
    }
    await closePreparedOutputs(prepared)
  } catch (error) {
    for (const output of prepared) {
      try {
        await output.fileHandle.truncate(0)
        await output.fileHandle.sync()
      } catch {
        // Invalidating the owned inode is best effort when the filesystem is failing.
      }
    }
    for (const output of prepared) {
      const cleanupDirectory = await resolvePreparedDirectoryForCleanup(output)
      if (output.published) {
        await unlinkOwnedArtifact(
          cleanupDirectory,
          path.basename(output.targetPath),
          output.fileIdentity
        )
      }
      await unlinkOwnedArtifact(
        cleanupDirectory,
        path.basename(output.temporaryPath),
        output.fileIdentity
      )
      await output.directoryHandle.sync().catch(() => undefined)
    }
    await closePreparedOutputs(prepared)
    if (error instanceof AuxiliaryAcceptanceError) throw error
    fail('OUTPUT_WRITE_FAILED')
  }
}

function resolveDependencyOverrides(
  overrides: Partial<AuxiliaryAcceptanceDependencies>
): AuxiliaryAcceptanceDependencies {
  return { ...defaultDependencies(), ...overrides }
}

async function resolvePotentialRealPath(inputPath: string): Promise<string> {
  let existingPath = path.resolve(inputPath)
  const missingSegments: string[] = []
  while (true) {
    try {
      const resolvedExistingPath = await realpath(existingPath)
      return path.join(resolvedExistingPath, ...missingSegments)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('OUTPUT_WRITE_FAILED')
      const parent = path.dirname(existingPath)
      if (parent === existingPath) fail('OUTPUT_WRITE_FAILED')
      missingSegments.unshift(path.basename(existingPath))
      existingPath = parent
    }
  }
}

function isPathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function assertOutputPathsOutsideRoot(
  options: Pick<AuxiliaryAcceptanceOptions, 'liveMcpOutput' | 'privacyLifecycleOutput'>,
  rootPath: string
): Promise<void> {
  const canonicalRoot = await realpath(rootPath).catch(() => path.resolve(rootPath))
  const outputs = await Promise.all([
    resolvePotentialRealPath(options.liveMcpOutput),
    resolvePotentialRealPath(options.privacyLifecycleOutput)
  ])
  if (
    outputs.some(
      (outputPath) => outputPath === canonicalRoot || isPathWithin(outputPath, canonicalRoot)
    )
  ) {
    fail('OUTPUT_WRITE_FAILED')
  }
}

export async function runAuxiliaryAcceptance(
  options: AuxiliaryAcceptanceOptions,
  dependencyOverrides: Partial<AuxiliaryAcceptanceDependencies> = {}
): Promise<AuxiliaryAcceptanceReports> {
  const dependencies = resolveDependencyOverrides(dependencyOverrides)
  await assertOutputTargetAvailable(options.liveMcpOutput)
  await assertOutputTargetAvailable(options.privacyLifecycleOutput)
  if (path.resolve(options.liveMcpOutput) === path.resolve(options.privacyLifecycleOutput)) {
    fail('OUTPUT_PATH_COLLISION')
  }

  const appAsar = await resolveAppAsar(options.appBundle)
  await assertOutputPathsOutsideRoot(options, options.appBundle)
  let snapshot: AppAsarSnapshot | undefined
  let snapshotCleaned = false
  try {
    try {
      snapshot = await dependencies.prepareAppAsarSnapshot(appAsar)
    } catch (error) {
      if (error instanceof AuxiliaryAcceptanceError) throw error
      fail('APP_ASAR_SNAPSHOT_FAILED')
    }
    await assertOutputPathsOutsideRoot(options, snapshot.directory)
    await assertOutputPathsOutsideRoot(options, snapshot.snapshotPath)

    let version: string
    try {
      version = await dependencies.readBundleVersion(options.appBundle)
    } catch {
      fail('APP_IDENTITY_INVALID')
    }
    const app = validateIdentity(version, snapshot.hash)
    const electronExecutable = dependencies.resolveElectronExecutable()
    const launcher = await dependencies.resolveMcpLauncher()
    if (
      !SHA256_PATTERN.test(launcher.nodeHash) ||
      !SHA256_PATTERN.test(launcher.npxHash) ||
      !path.isAbsolute(launcher.nodeExecutable) ||
      !path.isAbsolute(launcher.npxCli) ||
      !launcher.safePath
    ) {
      fail('WORKSPACE_NPX_INVALID')
    }
    const childRuntimeRoot = path.join(snapshot.directory, 'child-runtime')
    const childHome = path.join(childRuntimeRoot, 'home')
    const childTemp = path.join(childRuntimeRoot, 'tmp')
    const npmCache = path.join(childRuntimeRoot, 'npm-cache')
    await Promise.all([
      mkdir(childHome, { recursive: true }),
      mkdir(childTemp, { recursive: true }),
      mkdir(npmCache, { recursive: true })
    ])
    const isolatedChildEnv: NodeJS.ProcessEnv = {
      PATH: launcher.safePath,
      HOME: childHome,
      USERPROFILE: childHome,
      TMPDIR: childTemp,
      TMP: childTemp,
      TEMP: childTemp,
      npm_config_cache: npmCache,
      npm_config_userconfig: path.join(childRuntimeRoot, 'npmrc')
    }
    const liveMcpEntrypoint = path.join(snapshot.snapshotPath, 'out', 'main', 'live-mcp-smoke.js')
    const privacySmokeEntrypoint = path.join(
      snapshot.snapshotPath,
      'out',
      'main',
      'privacy-lifecycle-smoke.js'
    )

    await dependencies.verifyAppAsarSnapshot(snapshot)
    const liveMcpProcessMarker = randomUUID()
    const liveMcpResult = await executeChild(
      dependencies,
      {
        executable: electronExecutable,
        args: [liveMcpEntrypoint],
        cwd: snapshot.directory,
        env: buildAuxiliaryChildEnv(process.env, {
          ...isolatedChildEnv,
          [PROCESS_MARKER_ENV]: liveMcpProcessMarker,
          TUFF_MCP_SMOKE: '1',
          TUFF_MCP_SMOKE_NODE_EXECUTABLE: launcher.nodeExecutable,
          TUFF_MCP_SMOKE_NODE_SHA256: launcher.nodeHash,
          TUFF_MCP_SMOKE_NPX_CLI: launcher.npxCli,
          TUFF_MCP_SMOKE_NPX_CLI_SHA256: launcher.npxHash
        }),
        timeoutMs: LIVE_MCP_TIMEOUT_MS,
        maxStdoutBytes: MAX_CHILD_OUTPUT_BYTES,
        maxStderrBytes: MAX_CHILD_OUTPUT_BYTES,
        processMarker: liveMcpProcessMarker
      },
      'LIVE_MCP_PROCESS_FAILED'
    )
    assertChildSucceeded(liveMcpResult, {
      timeout: 'LIVE_MCP_TIMEOUT',
      outputLimit: 'LIVE_MCP_OUTPUT_LIMIT_EXCEEDED',
      processFailed: 'LIVE_MCP_PROCESS_FAILED'
    })
    const liveMcpChecks = parseLiveMcpSmokeOutput(liveMcpResult.stdout, launcher)
    await dependencies.verifyAppAsarSnapshot(snapshot)

    const privacyProcessMarker = randomUUID()
    const privacySmokeResult = await executeChild(
      dependencies,
      {
        executable: electronExecutable,
        args: [privacySmokeEntrypoint],
        cwd: snapshot.directory,
        env: buildAuxiliaryChildEnv(process.env, {
          ...isolatedChildEnv,
          [PROCESS_MARKER_ENV]: privacyProcessMarker,
          TUFF_PRIVACY_SMOKE_EXPECTED_ENTRYPOINT: privacySmokeEntrypoint
        }),
        timeoutMs: PRIVACY_SMOKE_TIMEOUT_MS,
        maxStdoutBytes: MAX_CHILD_OUTPUT_BYTES,
        maxStderrBytes: MAX_CHILD_OUTPUT_BYTES,
        processMarker: privacyProcessMarker
      },
      'PRIVACY_SMOKE_PROCESS_FAILED'
    )
    assertChildSucceeded(privacySmokeResult, {
      timeout: 'PRIVACY_SMOKE_TIMEOUT',
      outputLimit: 'PRIVACY_SMOKE_OUTPUT_LIMIT_EXCEEDED',
      processFailed: 'PRIVACY_SMOKE_PROCESS_FAILED'
    })
    const privacyChecks = parsePrivacySmokeOutput(privacySmokeResult.stdout)
    await dependencies.verifyAppAsarSnapshot(snapshot)

    const checkedAtDate = dependencies.now()
    if (!Number.isFinite(checkedAtDate.getTime())) fail('AUXILIARY_ACCEPTANCE_FAILED')
    const checkedAt = checkedAtDate.toISOString()
    const reports: AuxiliaryAcceptanceReports = {
      liveMcp: {
        schema: LIVE_MCP_ACCEPTANCE_SCHEMA,
        ok: true,
        checkedAt,
        app,
        launcher: {
          nodeSha256: launcher.nodeHash,
          npxCliSha256: launcher.npxHash
        },
        checks: liveMcpChecks,
        failures: []
      },
      privacyLifecycle: {
        schema: PRIVACY_LIFECYCLE_ACCEPTANCE_SCHEMA,
        ok: true,
        checkedAt,
        app,
        gateProvenance: 'packaged-app-asar',
        checks: privacyChecks,
        failures: []
      }
    }

    await dependencies.cleanupAppAsarSnapshot(snapshot)
    snapshotCleaned = true
    await dependencies.writeReports(options, reports, async () => {
      await dependencies.verifyAppAsarSource(snapshot!)
    })
    return reports
  } finally {
    if (snapshot && !snapshotCleaned) {
      try {
        await dependencies.cleanupAppAsarSnapshot(snapshot)
      } catch {
        fail('APP_ASAR_SNAPSHOT_FAILED')
      }
    }
  }
}

function printUsage(): void {
  process.stdout.write(
    'Usage: coreapp-packaged-ai-auxiliary-acceptance --appBundle <path.app> --liveMcpOutput <json> --privacyLifecycleOutput <json>\n'
  )
}

export function parseAuxiliaryAcceptanceArgs(
  argv: readonly string[],
  cwd = process.cwd()
): AuxiliaryAcceptanceOptions | null {
  const values: Partial<Record<'appBundle' | 'liveMcpOutput' | 'privacyLifecycleOutput', string>> =
    {}
  const flags = new Map([
    ['--appBundle', 'appBundle'],
    ['--liveMcpOutput', 'liveMcpOutput'],
    ['--privacyLifecycleOutput', 'privacyLifecycleOutput']
  ] as const)

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--help' || argument === '-h') {
      printUsage()
      return null
    }
    const key = flags.get(argument)
    const value = argv[index + 1]
    if (!key || !value || value.startsWith('--') || values[key] !== undefined) {
      fail('ARGUMENT_INVALID')
    }
    values[key] = path.resolve(cwd, value)
    index += 1
  }

  if (!values.appBundle || !values.liveMcpOutput || !values.privacyLifecycleOutput) {
    fail('ARGUMENT_INVALID')
  }
  if (values.liveMcpOutput === values.privacyLifecycleOutput) fail('OUTPUT_PATH_COLLISION')
  return values as AuxiliaryAcceptanceOptions
}

async function main(): Promise<void> {
  const options = parseAuxiliaryAcceptanceArgs(process.argv.slice(2))
  if (!options) return
  await runAuxiliaryAcceptance(options)
  process.stdout.write('AUXILIARY_ACCEPTANCE_PASSED\n')
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entrypoint === import.meta.url) {
  void main().catch((error) => {
    const code =
      error instanceof AuxiliaryAcceptanceError
        ? error.code
        : ('AUXILIARY_ACCEPTANCE_FAILED' as const)
    process.stderr.write(`${code}\n`)
    process.exitCode = 1
  })
}
