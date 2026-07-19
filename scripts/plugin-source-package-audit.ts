import type { PluginPublisherSigningBundle } from '../packages/tuff-cli-core/src/plugin-signer'
import type { TpexSecurityScanInput } from '../packages/tuff-cli-core/src/tpex-security-reader'
import type { PluginSecurityScanReport } from '../packages/utils/plugin/security-scan'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface AuditRuntime {
  createPluginPublisherSignature: (
    packagePath: string,
    channel: 'RELEASE',
    options: { privateKeyPem?: string, keyId?: string },
  ) => PluginPublisherSigningBundle
  scanBuiltPluginPackage: (input: { packagePath: string }) => PluginSecurityScanReport
  readTpexSecurityScanInput: (packagePath: string) => TpexSecurityScanInput
}

interface CommandSpec {
  command: string
  args: string[]
}

interface NotApplicableGate {
  notApplicable: true
  reason: string
}

interface PluginReleaseTarget {
  pluginName: string
  packageName: string
  root: string
  manifest: string
  bundledProjection?: string
  gates: {
    build: CommandSpec
    test: CommandSpec | NotApplicableGate
    typecheck: CommandSpec | NotApplicableGate
    lint: CommandSpec | NotApplicableGate
  }
}

interface CommandRecord {
  id: string
  label: string
  status: 'passed' | 'failed' | 'not-applicable'
  exitCode: number | null
  durationMs: number
  reason?: string
}

interface InventoryEntry {
  path: string
  size: number
  sha256: string
}

interface TargetRunRecord {
  run: number
  artifactPath: string
  artifactSha256: string
  artifactSize: number
  inventorySha256: string
  entryCount: number
  expandedBytes: number
  policyVersion: string
  scan: {
    decision: PluginSecurityScanReport['decision']
    reportSha256: string
    scannerVersion: string
    ruleSetVersion: string
    findingCount: number
  }
  signature: {
    algorithm: string
    keyId: string
    payloadSha256: string
    mode: 'configured' | 'ephemeral-local'
  }
  projection: {
    configured: boolean
    matched: boolean | null
    inventorySha256: string | null
  }
  commands: CommandRecord[]
}

interface TargetAuditRecord {
  pluginName: string
  packageName: string
  sourceRoot: string
  manifest: string
  identity: {
    id: string
    name: string
    version: string
  }
  gates: Record<'build' | 'test' | 'typecheck' | 'lint', {
    required: boolean
    reason?: string
  }>
  runs: TargetRunRecord[]
  reproducibility: {
    normalizedInventory: 'passed' | 'failed' | 'not-run'
    artifactContainer: 'identical' | 'different' | 'not-run'
  }
  status: 'passed' | 'failed'
  blockers: string[]
}

interface SourceAuditReport {
  contractVersion: 'talex.plugin-source-audit/v1'
  generatedAt: string
  evidenceLevel: 'local' | 'release-candidate'
  sourceRevision: string
  dirty: boolean
  dirtyAllowed: boolean
  toolchain: {
    node: string
    pnpm: string
    sourceDateEpoch: string
  }
  selectedTargets: string[]
  artifactPathBase: 'report-directory'
  prerequisiteCommands: CommandRecord[]
  targets: TargetAuditRecord[]
  status: 'passed' | 'failed'
  blockers: string[]
}

interface AuditOptions {
  targets: string[]
  outputPath: string
  allowDirty: boolean
  ephemeralSigning: boolean
  skipPrerequisites: boolean
  repeat: number
  artifactDirectory: string
}

interface SigningOptions {
  mode: 'configured' | 'ephemeral-local'
  privateKeyPem?: string
  keyId?: string
}

const currentFile = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(currentFile), '..')
const require = createRequire(import.meta.url)
const {
  PLUGIN_RELEASE_PREREQUISITES,
  PLUGIN_RELEASE_TARGETS,
} = require('./lib/plugin-release-targets.cjs') as {
  PLUGIN_RELEASE_PREREQUISITES: readonly string[]
  PLUGIN_RELEASE_TARGETS: readonly PluginReleaseTarget[]
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(argv: string[]): AuditOptions {
  const targets: string[] = []
  let outputPath = path.join(
    repoRoot,
    '.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json',
  )
  let allowDirty = false
  let ephemeralSigning = false
  let skipPrerequisites = false
  let repeat = 2

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--target') {
      const target = argv[index + 1]?.trim()
      if (!target)
        throw new Error('--target requires a plugin name.')
      targets.push(target)
      index += 1
    }
    else if (value === '--output') {
      const next = argv[index + 1]?.trim()
      if (!next)
        throw new Error('--output requires a path.')
      outputPath = path.resolve(repoRoot, next)
      index += 1
    }
    else if (value === '--allow-dirty') {
      allowDirty = true
    }
    else if (value === '--ephemeral-signing') {
      ephemeralSigning = true
    }
    else if (value === '--skip-prerequisites') {
      skipPrerequisites = true
    }
    else if (value === '--repeat') {
      const parsed = Number(argv[index + 1])
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2)
        throw new Error('--repeat must be 1 or 2.')
      repeat = parsed
      index += 1
    }
    else {
      throw new Error(`Unknown argument: ${value}`)
    }
  }

  return {
    targets,
    outputPath,
    allowDirty,
    ephemeralSigning,
    skipPrerequisites,
    repeat,
    artifactDirectory: path.join(path.dirname(outputPath), 'artifacts'),
  }
}

function commandExecutable(command: string): string {
  if (command !== 'pnpm')
    return command
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function runCommand(
  id: string,
  spec: CommandSpec,
  cwd: string,
  logicalCwd: string,
  logDir: string,
): CommandRecord {
  const startedAt = Date.now()
  const logPath = path.join(logDir, `${id.replace(/[^\w.-]/g, '_')}.log`)
  const logFd = fs.openSync(logPath, 'w')
  let result
  try {
    result = spawnSync(commandExecutable(spec.command), spec.args, {
      cwd,
      env: process.env,
      stdio: ['ignore', logFd, logFd],
    })
  }
  finally {
    fs.closeSync(logFd)
  }
  const exitCode = result.status ?? (result.error ? 1 : 0)
  const record: CommandRecord = {
    id,
    label: `${spec.command} ${spec.args.join(' ')} @ ${logicalCwd}`,
    status: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    durationMs: Date.now() - startedAt,
  }
  if (record.status === 'failed') {
    if (result.error) {
      record.reason = result.error.name
    }
    else {
      const bounded = fs.readFileSync(logPath, 'utf8')
        .slice(-1600)
        .replaceAll(cwd, `<${logicalCwd}>`)
        .replaceAll(repoRoot, '<repo>')
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, '<redacted-key>')
        .replace(/(token|secret|password)\s*[=:]\s*\S+/gi, '$1=<redacted>')
        .replace(/\s+/g, ' ')
        .trim()
      record.reason = bounded.slice(0, 1200) || 'Command exited non-zero.'
    }
  }
  return record
}

function notApplicableRecord(id: string, gate: NotApplicableGate): CommandRecord {
  return {
    id,
    label: id,
    status: 'not-applicable',
    exitCode: null,
    durationMs: 0,
    reason: gate.reason,
  }
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

function sourceRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
}
function sourceCommitEpoch(): string {
  const epoch = execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
  if (!/^\d+$/.test(epoch))
    throw new Error('Unable to resolve source commit epoch.')
  return epoch
}

function sourceDirty(targets: readonly PluginReleaseTarget[]): boolean {
  const scopes = [
    ...targets.map(target => target.root),
    'packages/tuff-cli-core',
    'packages/utils/plugin',
    'scripts/lib/plugin-release-targets.cjs',
    'scripts/plugin-source-package-audit.ts',
  ]
  const output = execFileSync('git', ['status', '--porcelain', '--', ...scopes], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return Boolean(output.trim())
}

function pnpmVersion(): string {
  return execFileSync(commandExecutable('pnpm'), ['--version'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
}

async function copyPluginSource(sourceRoot: string, targetRoot: string): Promise<void> {
  await fsp.cp(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source)
      if (!relative)
        return true
      const segments = relative.split(path.sep)
      if (segments.includes('node_modules') || segments.includes('dist'))
        return false
      return !relative.toLowerCase().endsWith('.tpex')
    },
  })
  const sourceNodeModules = path.join(sourceRoot, 'node_modules')
  if (fs.existsSync(sourceNodeModules)) {
    await fsp.symlink(
      sourceNodeModules,
      path.join(targetRoot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
}

async function createStagingWorkspace(target: PluginReleaseTarget, run: number): Promise<{
  root: string
  pluginRoot: string
  logs: string
}> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), `tuff-plugin-audit-${target.pluginName}-${run}-`))
  const pluginRoot = path.join(root, target.root)
  const logs = path.join(root, 'logs')
  await fsp.mkdir(path.dirname(pluginRoot), { recursive: true })
  await fsp.mkdir(logs, { recursive: true })
  await copyPluginSource(path.join(repoRoot, target.root), pluginRoot)
  await fsp.symlink(
    path.join(repoRoot, 'packages'),
    path.join(root, 'packages'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await fsp.symlink(
    path.join(repoRoot, 'node_modules'),
    path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  return { root, pluginRoot, logs }
}

async function collectFiles(root: string, relative = ''): Promise<InventoryEntry[]> {
  const current = path.join(root, relative)
  const entries = await fsp.readdir(current, { withFileTypes: true })
  const files: InventoryEntry[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name
    if (entry.isSymbolicLink())
      throw new Error(`Symlink is not allowed in audited projection: ${childRelative}`)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, childRelative))
    }
    else if (entry.isFile()) {
      if (entry.name === 'package.json' || entry.name === 'manifest.json' || entry.name === 'key.talex' || entry.name.endsWith('.tpex'))
        continue
      const content = await fsp.readFile(path.join(root, childRelative))
      files.push({
        path: childRelative.split(path.sep).join('/'),
        size: content.length,
        sha256: sha256(content),
      })
    }
  }
  return files
}

function inventoryDigest(entries: readonly InventoryEntry[]): string {
  const normalized = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path, 'en'))
    .map(entry => ({ path: entry.path, size: entry.size, sha256: entry.sha256 }))
  return sha256(JSON.stringify(normalized))
}

async function findArtifact(pluginRoot: string, pluginName: string, version: string): Promise<string> {
  const candidates: string[] = []
  for (const directory of [path.join(pluginRoot, 'dist', 'build'), path.join(pluginRoot, 'dist')]) {
    if (!fs.existsSync(directory))
      continue
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.tpex'))
        candidates.push(path.join(directory, entry.name))
    }
  }
  const expectedName = `${pluginName}-${version}.tpex`
  const matches = candidates.filter(candidate => path.basename(candidate) === expectedName)
  if (matches.length !== 1 || candidates.length !== 1) {
    throw new Error(`Expected exactly one clean ${expectedName} artifact; found ${candidates.length}.`)
  }
  return matches[0]!
}

function resolveSigningOptions(ephemeralSigning: boolean): SigningOptions {
  const configuredKey = process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM?.trim()
    || (process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE?.trim()
      ? fs.readFileSync(process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE, 'utf8').trim()
      : '')
  if (configuredKey)
    return { mode: 'configured' }
  if (!ephemeralSigning) {
    throw new Error(
      'Publisher signing key is unavailable. Configure TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM/FILE or use --ephemeral-signing for local-only evidence.',
    )
  }
  const pair = generateKeyPairSync('ed25519')
  return {
    mode: 'ephemeral-local',
    privateKeyPem: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    keyId: 'ephemeral-local-audit',
  }
}

function createSigningBundle(
  runtime: AuditRuntime,
  artifactPath: string,
  signing: SigningOptions,
): PluginPublisherSigningBundle {
  return runtime.createPluginPublisherSignature(artifactPath, 'RELEASE', {
    ...(signing.privateKeyPem ? { privateKeyPem: signing.privateKeyPem } : {}),
    ...(signing.keyId ? { keyId: signing.keyId } : {}),
  })
}
async function persistAuditedArtifact(
  artifactPath: string,
  artifactSha256: string,
  target: PluginReleaseTarget,
  version: string,
  run: number,
  options: AuditOptions,
): Promise<string> {
  const targetDirectory = path.join(options.artifactDirectory, target.pluginName)
  await fsp.mkdir(targetDirectory, { recursive: true })
  const destination = path.join(
    targetDirectory,
    `${target.pluginName}-${version}-run-${run}-${artifactSha256}.tpex`,
  )
  await fsp.copyFile(artifactPath, destination)

  const reportDirectory = path.dirname(options.outputPath)
  const relative = path.relative(reportDirectory, destination)
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..'))
    throw new Error('Audited artifact output must stay inside the report directory.')
  return relative.split(path.sep).join('/')
}

function gateSummary(target: PluginReleaseTarget): TargetAuditRecord['gates'] {
  const summarize = (gate: CommandSpec | NotApplicableGate) => 'notApplicable' in gate
    ? { required: false, reason: gate.reason }
    : { required: true }
  return {
    build: { required: true },
    test: summarize(target.gates.test),
    typecheck: summarize(target.gates.typecheck),
    lint: summarize(target.gates.lint),
  }
}

async function auditTargetRun(
  runtime: AuditRuntime,
  target: PluginReleaseTarget,
  run: number,
  signing: SigningOptions,
  options: AuditOptions,
): Promise<TargetRunRecord> {
  const staging = await createStagingWorkspace(target, run)
  const commands: CommandRecord[] = []
  try {
    const packageJson = readJson(path.join(staging.pluginRoot, 'package.json'))
    const manifest = readJson(path.join(staging.pluginRoot, target.manifest))
    const version = typeof packageJson.version === 'string' ? packageJson.version : ''
    if (!version || manifest.version !== version || manifest.name !== target.pluginName) {
      throw new Error('Manifest/package identity or version mismatch.')
    }

    for (const gateName of ['test', 'typecheck', 'lint'] as const) {
      const gate = target.gates[gateName]
      if ('notApplicable' in gate) {
        commands.push(notApplicableRecord(`${target.pluginName}:${gateName}`, gate))
      }
      else {
        const record = runCommand(
          `${target.pluginName}:${gateName}`,
          gate,
          staging.pluginRoot,
          target.root,
          staging.logs,
        )
        commands.push(record)
        if (record.status === 'failed')
          throw new Error(`${record.id} failed: ${record.reason ?? 'unknown error'}`)
      }
    }

    const buildRecord = runCommand(
      `${target.pluginName}:build`,
      target.gates.build,
      staging.pluginRoot,
      target.root,
      staging.logs,
    )
    commands.push(buildRecord)
    if (buildRecord.status === 'failed') {
      let scanDetail = ''
      try {
        const rejectedArtifact = await findArtifact(staging.pluginRoot, target.pluginName, version)
        const rejectedScan = runtime.scanBuiltPluginPackage({ packagePath: rejectedArtifact })
        scanDetail = rejectedScan.findings
          .filter(finding => !finding.waiver)
          .slice(0, 5)
          .map(finding => `${finding.code}:${finding.location.path}`)
          .join(', ')
      }
      catch {}
      throw new Error(
        `${buildRecord.id} failed: ${buildRecord.reason ?? 'unknown error'}${
          scanDetail ? ` Findings: ${scanDetail}` : ''}`,
      )
    }

    const artifactPath = await findArtifact(staging.pluginRoot, target.pluginName, version)
    const archive = runtime.readTpexSecurityScanInput(artifactPath)
    if (archive.policy.ok === false) {
      const first = archive.policy.violations[0]
      throw new Error(first ? `${first.code} at ${first.location}` : 'Package Policy rejected artifact.')
    }
    if (!archive.integrityPassed)
      throw new Error('Artifact file-map integrity failed.')
    const scan = runtime.scanBuiltPluginPackage({ packagePath: artifactPath })
    if (scan.decision === 'blocked' || scan.decision === 'unavailable') {
      throw new Error(`Security scan ${scan.decision}.`)
    }
    const signingBundle = createSigningBundle(runtime, artifactPath, signing)
    const archiveInventory: InventoryEntry[] = archive.files
      .filter(file => file.path !== 'manifest.json' && file.path !== 'key.talex')
      .map(file => ({ path: String(file.path), size: Number(file.size), sha256: String(file.sha256) }))
    const normalizedInventorySha256 = inventoryDigest(archiveInventory)

    let projectionDigest: string | null = null
    let projectionMatched: boolean | null = null
    if (target.bundledProjection) {
      const projectionRoot = path.join(repoRoot, target.bundledProjection)
      if (!fs.existsSync(projectionRoot))
        throw new Error('Bundled projection is missing.')
      const projectionFiles = await collectFiles(projectionRoot)
      projectionDigest = inventoryDigest(projectionFiles)
      projectionMatched = projectionDigest === normalizedInventorySha256
      if (!projectionMatched) {
        const canonicalByPath = new Map<string, string>(archiveInventory.map(entry => [entry.path, entry.sha256]))
        const projectionByPath = new Map<string, string>(projectionFiles.map(entry => [entry.path, entry.sha256]))
        const missing = [...canonicalByPath.keys()].filter(file => !projectionByPath.has(file)).slice(0, 8)
        const extra = [...projectionByPath.keys()].filter(file => !canonicalByPath.has(file)).slice(0, 8)
        const changed = [...canonicalByPath.entries()]
          .filter(([file, digest]) => projectionByPath.has(file) && projectionByPath.get(file) !== digest)
          .map(([file]) => file)
          .slice(0, 8)
        throw new Error(
          `Bundled projection content is stale: missing=[${missing.join(',')}], extra=[${extra.join(',')}], changed=[${changed.join(',')}].`,
        )
      }
    }

    const persistedArtifactPath = await persistAuditedArtifact(
      artifactPath,
      archive.artifactSha256,
      target,
      version,
      run,
      options,
    )

    return {
      run,
      artifactPath: persistedArtifactPath,
      artifactSha256: archive.artifactSha256,
      artifactSize: fs.statSync(artifactPath).size,
      inventorySha256: normalizedInventorySha256,
      entryCount: archive.policy.inventory.entryCount,
      expandedBytes: archive.policy.inventory.expandedBytes,
      policyVersion: archive.policy.policyVersion,
      scan: {
        decision: scan.decision,
        reportSha256: sha256(JSON.stringify(scan)),
        scannerVersion: scan.scannerVersion,
        ruleSetVersion: scan.ruleSetVersion,
        findingCount: scan.findings.length,
      },
      signature: {
        algorithm: signingBundle.envelope.algorithm,
        keyId: signingBundle.envelope.keyId,
        payloadSha256: signingBundle.envelope.payloadSha256,
        mode: signing.mode,
      },
      projection: {
        configured: Boolean(target.bundledProjection),
        matched: projectionMatched,
        inventorySha256: projectionDigest,
      },
      commands,
    }
  }
  finally {
    await fsp.rm(staging.root, { recursive: true, force: true })
  }
}

async function auditTarget(
  target: PluginReleaseTarget,
  options: AuditOptions,
  signing: SigningOptions,
  runtime: AuditRuntime,
): Promise<TargetAuditRecord> {
  const packageJson = readJson(path.join(repoRoot, target.root, 'package.json'))
  const manifest = readJson(path.join(repoRoot, target.root, target.manifest))
  const record: TargetAuditRecord = {
    pluginName: target.pluginName,
    packageName: target.packageName,
    sourceRoot: target.root,
    manifest: path.join(target.root, target.manifest).split(path.sep).join('/'),
    identity: {
      id: typeof manifest.id === 'string' ? manifest.id : '',
      name: typeof manifest.name === 'string' ? manifest.name : '',
      version: typeof packageJson.version === 'string' ? packageJson.version : '',
    },
    gates: gateSummary(target),
    runs: [],
    reproducibility: {
      normalizedInventory: 'not-run',
      artifactContainer: 'not-run',
    },
    status: 'passed',
    blockers: [],
  }

  try {
    for (let run = 1; run <= options.repeat; run += 1)
      record.runs.push(await auditTargetRun(runtime, target, run, signing, options))
    if (record.runs.length === 2) {
      record.reproducibility.normalizedInventory = record.runs[0]!.inventorySha256 === record.runs[1]!.inventorySha256
        ? 'passed'
        : 'failed'
      record.reproducibility.artifactContainer = record.runs[0]!.artifactSha256 === record.runs[1]!.artifactSha256
        ? 'identical'
        : 'different'
      if (record.reproducibility.normalizedInventory === 'failed')
        throw new Error('Normalized package inventory is not reproducible.')
    }
  }
  catch (error) {
    record.status = 'failed'
    record.blockers.push(error instanceof Error ? error.message : 'Unknown target audit failure.')
  }
  return record
}

async function loadAuditRuntime(): Promise<AuditRuntime> {
  // A clean checkout has no dist entry; prerequisites must build CLI core before loading this runtime.
  const runtime = await import('../packages/tuff-cli-core/dist/index.js')
  if (
    typeof runtime.createPluginPublisherSignature !== 'function'
    || typeof runtime.scanBuiltPluginPackage !== 'function'
    || typeof runtime.readTpexSecurityScanInput !== 'function'
  ) {
    throw new TypeError('Built Tuff CLI core does not expose the source-audit runtime contract.')
  }
  return {
    createPluginPublisherSignature: runtime.createPluginPublisherSignature,
    scanBuiltPluginPackage: runtime.scanBuiltPluginPackage,
    readTpexSecurityScanInput: runtime.readTpexSecurityScanInput,
  }
}

async function writeReport(outputPath: string, report: SourceAuditReport): Promise<void> {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true })
  await fsp.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const selectedTargets = options.targets.length
    ? PLUGIN_RELEASE_TARGETS.filter(target => options.targets.includes(target.pluginName))
    : [...PLUGIN_RELEASE_TARGETS]
  if (selectedTargets.length === 0 || selectedTargets.length !== (options.targets.length || selectedTargets.length))
    throw new Error('One or more requested plugin release targets are not registered.')

  const dirty = sourceDirty(selectedTargets)
  const revision = sourceRevision()
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH?.trim() || sourceCommitEpoch()
  process.env.SOURCE_DATE_EPOCH = sourceDateEpoch
  const report: SourceAuditReport = {
    contractVersion: 'talex.plugin-source-audit/v1',
    generatedAt: new Date().toISOString(),
    evidenceLevel: options.ephemeralSigning ? 'local' : 'release-candidate',
    sourceRevision: revision,
    dirty,
    dirtyAllowed: options.allowDirty,
    toolchain: {
      node: process.version,
      pnpm: pnpmVersion(),
      sourceDateEpoch,
    },
    selectedTargets: selectedTargets.map(target => target.pluginName),
    artifactPathBase: 'report-directory',
    prerequisiteCommands: [],
    targets: [],
    status: 'passed',
    blockers: [],
  }

  if (dirty && !options.allowDirty) {
    report.status = 'failed'
    report.blockers.push('Relevant source or build tooling is dirty; pass --allow-dirty only for local evidence.')
    await writeReport(options.outputPath, report)
    process.exitCode = 1
    return
  }

  const prerequisiteLogRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'tuff-plugin-audit-prerequisites-'))
  try {
    if (!options.skipPrerequisites) {
      for (const packageName of PLUGIN_RELEASE_PREREQUISITES) {
        const command = runCommand(
          `prerequisite:${packageName}`,
          { command: 'pnpm', args: ['--filter', packageName, 'run', 'build'] },
          repoRoot,
          '.',
          prerequisiteLogRoot,
        )
        report.prerequisiteCommands.push(command)
        if (command.status === 'failed') {
          report.status = 'failed'
          report.blockers.push(`${command.id} failed: ${command.reason ?? 'unknown error'}`)
          await writeReport(options.outputPath, report)
          process.exitCode = 1
          return
        }
      }
    }

    const runtime = await loadAuditRuntime()
    const signing = resolveSigningOptions(options.ephemeralSigning)
    for (const target of selectedTargets) {
      const targetRecord = await auditTarget(target, options, signing, runtime)
      report.targets.push(targetRecord)
      if (targetRecord.status === 'failed') {
        report.status = 'failed'
        report.blockers.push(`${target.pluginName}: ${targetRecord.blockers.join('; ')}`)
        break
      }
    }
  }
  catch (error) {
    report.status = 'failed'
    report.blockers.push(error instanceof Error ? error.message : 'Unknown source audit failure.')
  }
  finally {
    await fsp.rm(prerequisiteLogRoot, { recursive: true, force: true })
  }

  await writeReport(options.outputPath, report)
  if (report.status !== 'passed')
    process.exitCode = 1
}

export {
  collectFiles,
  copyPluginSource,
  inventoryDigest,
  parseArgs,
  runCommand,
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unknown source audit failure.')
    process.exitCode = 1
  })
}
