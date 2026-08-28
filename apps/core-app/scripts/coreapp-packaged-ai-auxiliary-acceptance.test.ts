import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuxiliaryAcceptanceError,
  buildAuxiliaryChildEnv,
  LIVE_MCP_ACCEPTANCE_SCHEMA,
  parseAuxiliaryAcceptanceArgs,
  parseLiveMcpSmokeOutput,
  parsePrivacySmokeOutput,
  PRIVACY_GATE_KEYS,
  PRIVACY_LIFECYCLE_ACCEPTANCE_SCHEMA,
  runAuxiliaryAcceptance,
  runBoundedChild,
  writeAuxiliaryAcceptanceReports,
  type AppAsarSnapshot,
  type AuxiliaryAcceptanceDependencies,
  type AuxiliaryAcceptanceErrorCode,
  type AuxiliaryAcceptanceOptions,
  type ChildCommand,
  type ChildResult,
  type LiveMcpAcceptanceReport,
  type McpLauncherIdentity,
  type PrivacyLifecycleAcceptanceReport
} from './coreapp-packaged-ai-auxiliary-acceptance'

const APP_BYTES = 'physical-app-asar'
const APP_HASH = 'a'.repeat(64)
const DRIFTED_HASH = 'b'.repeat(64)
const NODE_HASH = 'c'.repeat(64)
const NPX_HASH = 'd'.repeat(64)
const APP_VERSION = '2.5.0-beta.1'
const CHECKED_AT = new Date('2026-08-27T12:00:00.000Z')
const ELECTRON_EXECUTABLE = '/workspace/electron'
const NODE_EXECUTABLE = '/workspace/node/bin/node'
const NPX_CLI = '/workspace/node/lib/node_modules/npm/bin/npx-cli.js'
const SAFE_PATH = ['/workspace/node/bin', '/usr/bin', '/bin'].join(path.delimiter)
const PROCESS_MARKER = '11111111-1111-4111-8111-111111111111'
const temporaryRoots: string[] = []

const MCP_LAUNCHER = Object.freeze({
  nodeExecutable: NODE_EXECUTABLE,
  nodeHash: NODE_HASH,
  npxCli: NPX_CLI,
  npxHash: NPX_HASH,
  safePath: SAFE_PATH
}) satisfies McpLauncherIdentity

const LIVE_MCP_CHECKS = Object.freeze({
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
} as const)

const PRIVACY_CHECKS = Object.freeze({
  typedDeletePreview: true,
  authorityBoundOneShotDelete: true,
  terminalRunDeletion: true,
  activeRunProtected: true,
  automaticRetention: true,
  keysetPagination: true,
  cancellationPartialCommit: true,
  cascadeDelete: true,
  journaledMigration: true,
  utf8ByteAccounting: true,
  productionSmoke: true
} as const)

interface AcceptanceFixture {
  root: string
  appBundle: string
  appAsar: string
  options: AuxiliaryAcceptanceOptions
}

function successfulChild(stdout: string): ChildResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: '',
    timedOut: false,
    outputExceeded: false,
    spawnFailed: false,
    descendantsDetected: false
  }
}

function singleLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

function createLiveMcpOutput(
  evidenceOverrides: Record<string, unknown> = {},
  launcherOverrides: Record<string, unknown> = {},
  rootOverrides: Record<string, unknown> = {}
): string {
  return singleLine({
    ok: true,
    launcher: {
      nodeSha256: NODE_HASH,
      npxCliSha256: NPX_HASH,
      ...launcherOverrides
    },
    evidence: {
      explicitOptIn: true,
      realStdio: true,
      launcherIdentityBound: true,
      nodeHashMatched: true,
      npxHashMatched: true,
      pathShimExcluded: true,
      initializeHandshake: true,
      toolsListed: true,
      readTextFileCalled: true,
      roundTripCanaryMatched: true,
      isolatedProfileRemoved: true,
      ...evidenceOverrides
    },
    ...rootOverrides
  })
}

function createPackagedPrivacyGates(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...Object.fromEntries(PRIVACY_GATE_KEYS.map((key) => [key, true])),
    ...overrides
  }
}

function createPrivacySmokeOutput(
  options: {
    evidenceOverrides?: Record<string, unknown>
    packagedPrivacyGates?: Record<string, unknown>
    rootOverrides?: Record<string, unknown>
  } = {}
): string {
  return singleLine({
    ok: true,
    evidence: {
      builtEntrypoint: true,
      isolatedUserData: true,
      artifactsUnderIsolatedProfile: true,
      handlerRegistrationExact: true,
      handlerInvocationExact: true,
      policy: true,
      policyUpdate: true,
      summary: true,
      cleanupPreview: true,
      cleanup: true,
      deletePreviewProven: true,
      deleteRunProven: true,
      orchestratorRunDeleteProven: true,
      exported: true,
      exportFormat: true,
      exportDialogOwned: true,
      providerDisclosure: true,
      disclosureRedacted: true,
      backupPreview: true,
      backup: true,
      restore: true,
      restored: true,
      restoreDialogOwned: true,
      noReports: true,
      syntheticOnly: true,
      handlerTeardown: true,
      runArtifactsRemoved: true,
      isolatedProfileRemoved: true,
      packagedPrivacyGates: options.packagedPrivacyGates ?? createPackagedPrivacyGates(),
      handlerCount: 19,
      ownerDeleteCalls: 2,
      reports: [],
      ...options.evidenceOverrides
    },
    ...options.rootOverrides
  })
}

async function createFixture(): Promise<AcceptanceFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-auxiliary-acceptance-test-'))
  temporaryRoots.push(root)
  const appBundle = path.join(root, 'tuff.app')
  const resources = path.join(appBundle, 'Contents', 'Resources')
  await mkdir(resources, { recursive: true })
  const appAsar = path.join(resources, 'app.asar')
  await writeFile(appAsar, APP_BYTES)
  await writeFile(path.join(appBundle, 'Contents', 'Info.plist'), 'plist-fixture')
  return {
    root,
    appBundle,
    appAsar,
    options: {
      appBundle,
      liveMcpOutput: path.join(root, 'evidence', 'live-mcp.json'),
      privacyLifecycleOutput: path.join(root, 'evidence', 'privacy-lifecycle.json')
    }
  }
}

function createSnapshot(fixture: AcceptanceFixture): AppAsarSnapshot {
  const directory = path.join(fixture.root, 'snapshot')
  return Object.freeze({
    sourcePath: fixture.appAsar,
    snapshotPath: path.join(directory, 'app.asar'),
    directory,
    sourceIdentity: Object.freeze({
      dev: '1',
      ino: '10',
      size: APP_BYTES.length,
      mtimeNs: '100',
      ctimeNs: '100'
    }),
    snapshotIdentity: Object.freeze({
      dev: '1',
      ino: '11',
      size: APP_BYTES.length,
      mtimeNs: '100',
      ctimeNs: '100'
    }),
    hash: APP_HASH,
    unpackedFiles: Object.freeze([])
  })
}

function createDependencies(
  fixture: AcceptanceFixture,
  childResults: readonly ChildResult[] = [
    successfulChild(createLiveMcpOutput()),
    successfulChild(createPrivacySmokeOutput())
  ]
) {
  const snapshot = createSnapshot(fixture)
  const pendingResults = [...childResults]
  const dependencies = {
    readBundleVersion: vi.fn(async () => APP_VERSION),
    prepareAppAsarSnapshot: vi.fn(async () => snapshot),
    verifyAppAsarSnapshot: vi.fn(async () => undefined),
    verifyAppAsarSource: vi.fn(async () => undefined),
    cleanupAppAsarSnapshot: vi.fn(async () => undefined),
    resolveElectronExecutable: vi.fn(() => ELECTRON_EXECUTABLE),
    resolveMcpLauncher: vi.fn(async () => MCP_LAUNCHER),
    runChild: vi.fn(async (_command: ChildCommand) => {
      const result = pendingResults.shift()
      if (!result) throw new Error('unexpected child call')
      return result
    }),
    now: vi.fn(() => CHECKED_AT),
    writeReports: writeAuxiliaryAcceptanceReports
  } satisfies AuxiliaryAcceptanceDependencies
  return { dependencies, snapshot }
}

function createExactReports(): {
  liveMcp: LiveMcpAcceptanceReport
  privacyLifecycle: PrivacyLifecycleAcceptanceReport
} {
  const app = { version: APP_VERSION, hash: APP_HASH }
  return {
    liveMcp: {
      schema: LIVE_MCP_ACCEPTANCE_SCHEMA,
      ok: true,
      checkedAt: CHECKED_AT.toISOString(),
      app,
      launcher: {
        nodeSha256: NODE_HASH,
        npxCliSha256: NPX_HASH
      },
      checks: LIVE_MCP_CHECKS,
      failures: []
    },
    privacyLifecycle: {
      schema: PRIVACY_LIFECYCLE_ACCEPTANCE_SCHEMA,
      ok: true,
      checkedAt: CHECKED_AT.toISOString(),
      app,
      gateProvenance: 'packaged-app-asar',
      checks: PRIVACY_CHECKS,
      failures: []
    }
  }
}

async function expectCode(
  operation: () => unknown | Promise<unknown>,
  code: AuxiliaryAcceptanceErrorCode
): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: 'AuxiliaryAcceptanceError',
    code,
    message: code
  })
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('packaged AI auxiliary acceptance runner', () => {
  it('requires each CLI path exactly once and resolves it from the caller cwd', () => {
    expect(
      parseAuxiliaryAcceptanceArgs(
        [
          '--appBundle',
          'dist/tuff.app',
          '--liveMcpOutput',
          'evidence/live.json',
          '--privacyLifecycleOutput',
          'evidence/privacy.json'
        ],
        '/workspace/core-app'
      )
    ).toEqual({
      appBundle: '/workspace/core-app/dist/tuff.app',
      liveMcpOutput: '/workspace/core-app/evidence/live.json',
      privacyLifecycleOutput: '/workspace/core-app/evidence/privacy.json'
    })
    expect(() => parseAuxiliaryAcceptanceArgs(['--appBundle', 'tuff.app'])).toThrowError(
      new AuxiliaryAcceptanceError('ARGUMENT_INVALID')
    )
    expect(() =>
      parseAuxiliaryAcceptanceArgs([
        '--appBundle',
        'tuff.app',
        '--appBundle',
        'other.app',
        '--liveMcpOutput',
        'live.json',
        '--privacyLifecycleOutput',
        'privacy.json'
      ])
    ).toThrowError(new AuxiliaryAcceptanceError('ARGUMENT_INVALID'))
  })

  it('inherits only non-sensitive locale and platform environment values', () => {
    const isolatedHome = '/isolated/home'
    const env = buildAuxiliaryChildEnv(
      {
        LANG: 'en_US.UTF-8',
        LC_ALL: 'C',
        PGPASSWORD: 'database-secret',
        DATABASE_URL: 'postgres://user:secret@example.invalid/db',
        HTTP_PROXY: 'http://user:secret@example.invalid',
        CI_JOB_JWT: 'ci-jwt-secret',
        API_TOKEN: 'api-token-secret',
        HOME: '/real/home',
        PATH: '/untrusted/bin',
        NODE_OPTIONS: '--require=/tmp/untrusted.js'
      },
      {
        HOME: isolatedHome,
        PATH: SAFE_PATH
      }
    )

    expect(env).toMatchObject({ LANG: 'en_US.UTF-8', LC_ALL: 'C', HOME: isolatedHome })
    expect(env.PATH).toBe(SAFE_PATH)
    for (const key of [
      'PGPASSWORD',
      'DATABASE_URL',
      'HTTP_PROXY',
      'CI_JOB_JWT',
      'API_TOKEN',
      'NODE_OPTIONS'
    ]) {
      expect(env[key]).toBeUndefined()
    }
    expect(JSON.stringify(env)).not.toContain('/real/home')
    expect(JSON.stringify(env)).not.toContain('/untrusted/bin')
  })

  it('requires the exact all-true v2 Live MCP raw contract', () => {
    expect(parseLiveMcpSmokeOutput(createLiveMcpOutput(), MCP_LAUNCHER)).toEqual(LIVE_MCP_CHECKS)
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({ realStdio: false }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_EVIDENCE_FAILED'))
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({ extra: true }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_OUTPUT_INVALID'))
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({}, { extra: true }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_OUTPUT_INVALID'))
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({}, {}, { extra: true }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_OUTPUT_INVALID'))
  })

  it('rejects a valid but mismatched Live MCP launcher hash', () => {
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({}, { nodeSha256: DRIFTED_HASH }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_EVIDENCE_FAILED'))
    expect(() =>
      parseLiveMcpSmokeOutput(createLiveMcpOutput({}, { npxCliSha256: DRIFTED_HASH }), MCP_LAUNCHER)
    ).toThrowError(new AuxiliaryAcceptanceError('LIVE_MCP_EVIDENCE_FAILED'))
  })

  it('requires every packaged Privacy smoke positive control', () => {
    expect(parsePrivacySmokeOutput(createPrivacySmokeOutput())).toEqual(PRIVACY_CHECKS)
    expect(() =>
      parsePrivacySmokeOutput(
        createPrivacySmokeOutput({ evidenceOverrides: { ownerDeleteCalls: 1 } })
      )
    ).toThrowError(new AuxiliaryAcceptanceError('PRIVACY_SMOKE_OUTPUT_INVALID'))
  })

  it.each(PRIVACY_GATE_KEYS)('rejects false or missing packaged Privacy gate %s', (key) => {
    expect(() =>
      parsePrivacySmokeOutput(
        createPrivacySmokeOutput({
          packagedPrivacyGates: createPackagedPrivacyGates({ [key]: false })
        })
      )
    ).toThrowError(new AuxiliaryAcceptanceError('PRIVACY_SMOKE_EVIDENCE_FAILED'))

    const missingGate = createPackagedPrivacyGates()
    delete missingGate[key]
    expect(() =>
      parsePrivacySmokeOutput(createPrivacySmokeOutput({ packagedPrivacyGates: missingGate }))
    ).toThrowError(new AuxiliaryAcceptanceError('PRIVACY_SMOKE_OUTPUT_INVALID'))
  })

  it('does not publish when the source ASAR inode changes even if its bytes are restored', async () => {
    const fixture = await createFixture()
    const initialIdentity = await lstat(fixture.appAsar, { bigint: true })
    const { dependencies } = createDependencies(fixture)
    let childCall = 0
    dependencies.runChild.mockImplementation(async () => {
      childCall += 1
      if (childCall === 1) return successfulChild(createLiveMcpOutput())
      await rename(fixture.appAsar, `${fixture.appAsar}.replaced`)
      await writeFile(fixture.appAsar, APP_BYTES)
      return successfulChild(createPrivacySmokeOutput())
    })
    dependencies.verifyAppAsarSource.mockImplementation(async () => {
      const currentIdentity = await lstat(fixture.appAsar, { bigint: true })
      if (
        currentIdentity.dev !== initialIdentity.dev ||
        currentIdentity.ino !== initialIdentity.ino
      ) {
        throw new AuxiliaryAcceptanceError('APP_ASAR_CHANGED')
      }
    })

    await expectCode(
      () => runAuxiliaryAcceptance(fixture.options, dependencies),
      'APP_ASAR_CHANGED'
    )

    const replacedIdentity = await lstat(fixture.appAsar, { bigint: true })
    expect(replacedIdentity.ino).not.toBe(initialIdentity.ino)
    await expect(readFile(fixture.appAsar, 'utf8')).resolves.toBe(APP_BYTES)
    await expectMissing(fixture.options.liveMcpOutput)
    await expectMissing(fixture.options.privacyLifecycleOutput)
    expect(dependencies.verifyAppAsarSource).toHaveBeenCalledTimes(1)
    expect(dependencies.cleanupAppAsarSnapshot).toHaveBeenCalledTimes(1)
  })

  it('projects a rejected child without retaining its raw error', async () => {
    const fixture = await createFixture()
    const rawError = 'credential=raw-canary at /Users/example/private/profile'
    const { dependencies } = createDependencies(fixture)
    dependencies.runChild.mockRejectedValueOnce(new Error(rawError))

    try {
      await runAuxiliaryAcceptance(fixture.options, dependencies)
      throw new Error('expected acceptance failure')
    } catch (error) {
      expect(error).toEqual(new AuxiliaryAcceptanceError('LIVE_MCP_PROCESS_FAILED'))
      expect(JSON.stringify(error)).not.toContain(rawError)
      expect(String(error)).not.toContain('/Users/example')
    }
    expect(dependencies.cleanupAppAsarSnapshot).toHaveBeenCalledTimes(1)
  })

  it('terminates a timed-out child and waits for process settlement', async () => {
    const startedAt = Date.now()
    const result = await runBoundedChild({
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: { ...process.env, TUFF_AUXILIARY_PROCESS_MARKER: PROCESS_MARKER },
      timeoutMs: 30,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
      processMarker: PROCESS_MARKER
    })

    expect(result).toMatchObject({
      timedOut: true,
      spawnFailed: false,
      descendantsDetected: false
    })
    expect(result.exitCode === null || result.exitCode === 0).toBe(true)
    expect(result.signal).not.toBeNull()
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })

  it.skipIf(process.platform === 'win32')(
    'cleans the process group when a successful root leaves a descendant behind',
    async () => {
      const rootScript = [
        "const { spawn } = require('node:child_process')",
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })",
        'process.stdout.write(String(child.pid))',
        'child.unref()'
      ].join(';')
      let descendantPid = 0
      try {
        const result = await runBoundedChild({
          executable: process.execPath,
          args: ['-e', rootScript],
          cwd: process.cwd(),
          env: { ...process.env, TUFF_AUXILIARY_PROCESS_MARKER: PROCESS_MARKER },
          timeoutMs: 5_000,
          maxStdoutBytes: 1024,
          maxStderrBytes: 1024,
          processMarker: PROCESS_MARKER
        })
        descendantPid = Number(result.stdout)

        expect(Number.isSafeInteger(descendantPid) && descendantPid > 0).toBe(true)
        expect(result).toMatchObject({
          exitCode: 0,
          signal: null,
          timedOut: false,
          outputExceeded: false,
          spawnFailed: false,
          descendantsDetected: true
        })
        expect(isProcessAlive(descendantPid)).toBe(false)
      } finally {
        if (descendantPid > 0 && isProcessAlive(descendantPid)) {
          process.kill(descendantPid, 'SIGKILL')
        }
      }
    }
  )

  it('refuses existing and symlink output targets without replacing them', async () => {
    const fixture = await createFixture()
    const reports = createExactReports()
    await mkdir(path.dirname(fixture.options.liveMcpOutput), { recursive: true })
    await writeFile(fixture.options.liveMcpOutput, 'existing')
    await expectCode(
      () => writeAuxiliaryAcceptanceReports(fixture.options, reports),
      'OUTPUT_EXISTS'
    )
    await expect(readFile(fixture.options.liveMcpOutput, 'utf8')).resolves.toBe('existing')

    await rm(fixture.options.liveMcpOutput)
    const symlinkTarget = path.join(fixture.root, 'outside.json')
    await writeFile(symlinkTarget, 'outside')
    await symlink(symlinkTarget, fixture.options.liveMcpOutput)
    await expectCode(
      () => writeAuxiliaryAcceptanceReports(fixture.options, reports),
      'OUTPUT_SYMLINK'
    )
    await expect(readFile(symlinkTarget, 'utf8')).resolves.toBe('outside')
  })

  it('invalidates owned reports and preserves replacements after output directory substitution', async () => {
    const fixture = await createFixture()
    const reports = createExactReports()
    const outputDirectory = path.dirname(fixture.options.liveMcpOutput)
    const renamedDirectory = `${outputDirectory}-owned`
    let commitChecks = 0

    await expectCode(
      () =>
        writeAuxiliaryAcceptanceReports(fixture.options, reports, async () => {
          commitChecks += 1
          if (commitChecks !== 2) return
          await rename(outputDirectory, renamedDirectory)
          await mkdir(outputDirectory, { recursive: true })
          await Promise.all([
            writeFile(fixture.options.liveMcpOutput, 'replacement-live'),
            writeFile(fixture.options.privacyLifecycleOutput, 'replacement-privacy')
          ])
        }),
      'OUTPUT_WRITE_FAILED'
    )

    await expect(readFile(fixture.options.liveMcpOutput, 'utf8')).resolves.toBe('replacement-live')
    await expect(readFile(fixture.options.privacyLifecycleOutput, 'utf8')).resolves.toBe(
      'replacement-privacy'
    )
    await expect(readdir(renamedDirectory)).resolves.toEqual([])
  })

  it('rejects report outputs inside the packaged app bundle', async () => {
    const fixture = await createFixture()
    const { dependencies } = createDependencies(fixture)
    const outputDirectory = path.join(fixture.appBundle, 'Contents', 'Resources', 'acceptance')
    fixture.options.liveMcpOutput = path.join(outputDirectory, 'live.json')
    fixture.options.privacyLifecycleOutput = path.join(outputDirectory, 'privacy.json')

    await expectCode(
      () => runAuxiliaryAcceptance(fixture.options, dependencies),
      'OUTPUT_WRITE_FAILED'
    )
    expect(dependencies.prepareAppAsarSnapshot).not.toHaveBeenCalled()
  })

  it('writes verifier-exact v2 reports after two snapshot-backed smoke commands', async () => {
    const fixture = await createFixture()
    const { dependencies, snapshot } = createDependencies(fixture)
    const reports = await runAuxiliaryAcceptance(fixture.options, dependencies)
    const liveReport = JSON.parse(await readFile(fixture.options.liveMcpOutput, 'utf8')) as Record<
      string,
      unknown
    >
    const privacyReport = JSON.parse(
      await readFile(fixture.options.privacyLifecycleOutput, 'utf8')
    ) as Record<string, unknown>

    expect(reports.liveMcp).toEqual(liveReport)
    expect(reports.privacyLifecycle).toEqual(privacyReport)
    expect(Object.keys(liveReport).sort()).toEqual(
      ['schema', 'ok', 'checkedAt', 'app', 'launcher', 'checks', 'failures'].sort()
    )
    expect(Object.keys(privacyReport).sort()).toEqual(
      ['schema', 'ok', 'checkedAt', 'app', 'gateProvenance', 'checks', 'failures'].sort()
    )
    expect(liveReport).toEqual(createExactReports().liveMcp)
    expect(privacyReport).toEqual(createExactReports().privacyLifecycle)

    expect(dependencies.prepareAppAsarSnapshot).toHaveBeenCalledOnce()
    expect(dependencies.prepareAppAsarSnapshot).toHaveBeenCalledWith(fixture.appAsar)
    expect(dependencies.resolveMcpLauncher).toHaveBeenCalledOnce()
    expect(dependencies.runChild).toHaveBeenCalledTimes(2)
    expect(dependencies.verifyAppAsarSnapshot).toHaveBeenCalledTimes(3)
    expect(dependencies.verifyAppAsarSnapshot).toHaveBeenCalledWith(snapshot)
    expect(dependencies.verifyAppAsarSource).toHaveBeenCalledWith(snapshot)
    expect(dependencies.cleanupAppAsarSnapshot).toHaveBeenCalledOnce()

    const commands = dependencies.runChild.mock.calls.map(([command]) => command)
    expect(commands[0]).toMatchObject({
      executable: ELECTRON_EXECUTABLE,
      args: [path.join(snapshot.snapshotPath, 'out', 'main', 'live-mcp-smoke.js')],
      cwd: snapshot.directory
    })
    expect(commands[1]).toMatchObject({
      executable: ELECTRON_EXECUTABLE,
      args: [path.join(snapshot.snapshotPath, 'out', 'main', 'privacy-lifecycle-smoke.js')],
      cwd: snapshot.directory
    })
    expect(commands[0]?.processMarker).not.toBe(commands[1]?.processMarker)
    for (const command of commands) {
      expect(command.env.TUFF_AUXILIARY_PROCESS_MARKER).toBe(command.processMarker)
      expect(command.env.HOME).toBe(path.join(snapshot.directory, 'child-runtime', 'home'))
      expect(command.env.TMPDIR).toBe(path.join(snapshot.directory, 'child-runtime', 'tmp'))
      expect(command.env.PGPASSWORD).toBeUndefined()
      expect(command.env.DATABASE_URL).toBeUndefined()
      expect(command.env.HTTP_PROXY).toBeUndefined()
      expect(command.env.CI_JOB_JWT).toBeUndefined()
    }
  })

  it('excludes a PATH npx shim and passes only the absolute launcher contract', async () => {
    const fixture = await createFixture()
    const fakeBin = path.join(fixture.root, 'fake-bin')
    const fakeNpx = path.join(fakeBin, 'npx')
    await mkdir(fakeBin, { recursive: true })
    await writeFile(fakeNpx, '#!/bin/sh\nexit 99\n')
    vi.stubEnv('PATH', [fakeBin, process.env.PATH ?? ''].join(path.delimiter))

    const { dependencies, snapshot } = createDependencies(fixture)
    await runAuxiliaryAcceptance(fixture.options, dependencies)
    const liveCommand = dependencies.runChild.mock.calls[0]?.[0]
    expect(liveCommand).toBeDefined()
    expect(liveCommand).toMatchObject({
      executable: ELECTRON_EXECUTABLE,
      args: [path.join(snapshot.snapshotPath, 'out', 'main', 'live-mcp-smoke.js')]
    })
    expect(liveCommand?.env.PATH).toBe(SAFE_PATH)
    expect(liveCommand?.env.PATH).not.toContain(fakeBin)
    expect(liveCommand?.env.TUFF_MCP_SMOKE_NODE_EXECUTABLE).toBe(NODE_EXECUTABLE)
    expect(liveCommand?.env.TUFF_MCP_SMOKE_NODE_SHA256).toBe(NODE_HASH)
    expect(liveCommand?.env.TUFF_MCP_SMOKE_NPX_CLI).toBe(NPX_CLI)
    expect(liveCommand?.env.TUFF_MCP_SMOKE_NPX_CLI_SHA256).toBe(NPX_HASH)
    expect(JSON.stringify(liveCommand)).not.toContain(fakeNpx)
  })
})
