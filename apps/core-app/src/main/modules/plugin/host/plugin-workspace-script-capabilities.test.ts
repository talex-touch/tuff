import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginWorkspaceScriptHost,
  createPluginWorkspaceScriptCapabilities,
  createPluginWorkspaceScriptProcess,
  PLUGIN_WORKSPACE_SCRIPT_TOKEN_TTL_MS,
  resolvePluginWorkspacePackageManagerPath,
  type PluginWorkspaceScriptProcess
} from './plugin-workspace-script-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-workspace-scripts',
  pluginInstanceId: 'workspace-scripts-instance',
  activationGeneration: 1,
  key: 'workspace-scripts-key'
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function completedProcess(code = 0): PluginWorkspaceScriptProcess {
  return Object.freeze({
    started: async () => undefined,
    wait: async () => ({ code }),
    kill: async () => undefined
  })
}

function controlledProcess() {
  const started = deferred<void>()
  const exit = deferred<{ code: number | null }>()
  const process: PluginWorkspaceScriptProcess = Object.freeze({
    started: vi.fn(() => started.promise),
    wait: vi.fn(() => exit.promise),
    kill: vi.fn(async () => {
      await exit.promise
    })
  })
  return { exit, process, started }
}

function createWorkspace(scripts: Record<string, string> = { lint: 'eslint .', test: 'vitest' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-script-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts }))
  return fs.realpathSync(root)
}

function createHarness(
  options: {
    root?: string | null
    readAllowed?: boolean
    shellAllowed?: boolean
    confirmed?: boolean
    platform?: NodeJS.Platform
    environment?: NodeJS.ProcessEnv
    packageManagerPath?: string | null
    onConfirm?: () => void
    onSpawn?: () => void
    processFactory?: () => PluginWorkspaceScriptProcess
  } = {}
) {
  const root = options.root === undefined ? createWorkspace() : options.root
  let current: PluginActivationIdentity | undefined = activation
  let hostGeneration = 7
  let readAllowed = options.readAllowed ?? true
  let shellAllowed = options.shellAllowed ?? true
  const readWatchers = new Set<() => void>()
  const shellWatchers = new Set<() => void>()
  const spawn = vi.fn(() => {
    options.onSpawn?.()
    return options.processFactory?.() ?? completedProcess()
  })
  const selectWorkspace = vi.fn(async () => root)
  const confirmRun = vi.fn(async () => {
    options.onConfirm?.()
    return options.confirmed ?? true
  })
  const platform = options.platform ?? process.platform
  const packageManagerPath =
    options.packageManagerPath === undefined
      ? platform === 'win32'
        ? 'C:\\Trusted\\pnpm.cmd'
        : '/trusted/bin/pnpm'
      : options.packageManagerPath
  const resolvePackageManager = vi.fn(
    (_platform: NodeJS.Platform, _environment: Readonly<Record<string, string>>) =>
      packageManagerPath
  )
  const host = createFixedPluginWorkspaceScriptHost({
    platform,
    environment: options.environment ?? process.env,
    resolvePackageManager,
    selectWorkspace,
    confirmRun,
    spawn
  })
  const capability = createPluginWorkspaceScriptCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    authorizeRead: () => readAllowed,
    authorizeShell: () => shellAllowed,
    watchReadPermissionRevoked: (_pluginName, onRevoke) => {
      readWatchers.add(onRevoke)
      return () => readWatchers.delete(onRevoke)
    },
    watchShellPermissionRevoked: (_pluginName, onRevoke) => {
      shellWatchers.add(onRevoke)
      return () => shellWatchers.delete(onRevoke)
    },
    host
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'workspace-script-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => true,
    watchPermissionRevoked: () => () => undefined,
    isActive: () => true,
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0])
  return {
    capability,
    confirmRun,
    host,
    registry,
    resolvePackageManager,
    selectWorkspace,
    spawn,
    root,
    denyRead() {
      readAllowed = false
    },
    denyShell() {
      shellAllowed = false
    },
    revokeRead() {
      readAllowed = false
      for (const watcher of [...readWatchers]) watcher()
    },
    revokeShell() {
      shellAllowed = false
      for (const watcher of [...shellWatchers]) watcher()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-key' }
    },
    rotateHost() {
      hostGeneration = 8
    }
  }
}

async function selectAndList(harness: ReturnType<typeof createHarness>) {
  const selected = (await harness.registry.dispatch('process.workspace-scripts', {
    operation: 'select-workspace'
  })) as {
    status: string
    workspace: { token: string; name: string }
  }
  if (!selected.workspace) throw new Error(`unexpected select result: ${JSON.stringify(selected)}`)
  const listed = (await harness.registry.dispatch('process.workspace-scripts', {
    operation: 'list-scripts',
    workspaceToken: selected.workspace.token
  })) as {
    status: string
    scripts: Array<{ token: string; name: string }>
    workspace: { token: string; name: string }
  }
  return { listed, selected }
}

describe('isolated workspace script capability', () => {
  beforeEach(() => vi.useRealTimers())

  it('selects and lists only bounded display names plus opaque tokens', async () => {
    const harness = createHarness()
    const { listed, selected } = await selectAndList(harness)

    expect(selected).toMatchObject({
      operation: 'select-workspace',
      status: 'selected',
      workspace: { name: path.basename(harness.root as string) }
    })
    expect(selected.workspace.token).toMatch(/^ws_[A-Za-z0-9_-]{32}$/)
    expect(listed).toMatchObject({
      operation: 'list-scripts',
      status: 'available',
      scripts: [{ name: 'lint' }, { name: 'test' }]
    })
    expect(listed.scripts.every((script) => /^wss_[A-Za-z0-9_-]{32}$/.test(script.token))).toBe(
      true
    )
    expect(JSON.stringify({ selected, listed })).not.toContain(harness.root)
    expect(JSON.stringify({ selected, listed })).not.toMatch(
      /eslint|vitest|command|cwd|path|args|env/i
    )
  })

  it.each([
    { operation: 'select-workspace', path: '/private' },
    {
      operation: 'list-scripts',
      workspaceToken: 'ws_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      cwd: '/tmp'
    },
    {
      operation: 'run-script',
      scriptToken: 'wss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      command: 'rm -rf /'
    },
    {
      operation: 'run-script',
      scriptToken: 'wss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      executable: 'cmd.exe'
    },
    {
      operation: 'run-script',
      scriptToken: 'wss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      args: ['/c', 'calc']
    },
    {
      operation: 'run-script',
      scriptToken: 'wss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      env: { PATH: '.' }
    },
    { operation: 'run-script', scriptToken: 'wss_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', shell: true }
  ])('rejects hostile child authority fields %#', async (request) => {
    const harness = createHarness()
    await expect(
      harness.registry.dispatch('process.workspace-scripts', request as never)
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(harness.selectWorkspace).not.toHaveBeenCalled()
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('rotates list epochs, consumes script tokens once and expires them exactly at TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T00:00:00Z'))
    const harness = createHarness()
    const first = await selectAndList(harness)
    const staleToken = first.listed.scripts[0].token
    const second = (await harness.registry.dispatch('process.workspace-scripts', {
      operation: 'list-scripts',
      workspaceToken: first.selected.workspace.token
    })) as { scripts: Array<{ token: string; name: string }> }
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: staleToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })

    const currentToken = second.scripts[0].token
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: currentToken
      })
    ).resolves.toMatchObject({ status: 'started', scriptName: 'lint' })
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: currentToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })

    const third = (await harness.registry.dispatch('process.workspace-scripts', {
      operation: 'list-scripts',
      workspaceToken: first.selected.workspace.token
    })) as { scripts: Array<{ token: string }> }
    vi.advanceTimersByTime(PLUGIN_WORKSPACE_SCRIPT_TOKEN_TTL_MS)
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: third.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-expired' })
  })

  it('rejects symlink workspaces, package replacement and script digest drift', async () => {
    const realRoot = createWorkspace()
    const linkRoot = `${realRoot}-link`
    fs.symlinkSync(realRoot, linkRoot, process.platform === 'win32' ? 'junction' : 'dir')
    const symlinked = createHarness({ root: linkRoot })
    await expect(
      symlinked.registry.dispatch('process.workspace-scripts', {
        operation: 'select-workspace'
      })
    ).resolves.toMatchObject({ status: 'failed', reason: 'workspace-invalid' })

    const replaced = createHarness()
    const selected = await selectAndList(replaced)
    const packagePath = path.join(replaced.root as string, 'package.json')
    fs.renameSync(packagePath, `${packagePath}.old`)
    fs.writeFileSync(packagePath, JSON.stringify({ scripts: { lint: 'eslint .' } }))
    await expect(
      replaced.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: selected.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'package-replaced' })
    expect(replaced.confirmRun).not.toHaveBeenCalled()
    expect(replaced.spawn).not.toHaveBeenCalled()

    const drifted = createHarness()
    const driftTokens = await selectAndList(drifted)
    fs.writeFileSync(
      path.join(drifted.root as string, 'package.json'),
      JSON.stringify({ scripts: { lint: 'eslint --fix .', test: 'vitest' } })
    )
    await expect(
      drifted.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: driftTokens.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'script-changed' })
    expect(drifted.spawn).not.toHaveBeenCalled()
  })

  it('checks fs.read and system.shell around confirmation and fixed spawn', async () => {
    const harness = createHarness()
    const { listed } = await selectAndList(harness)
    const token = listed.scripts[0].token
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: token
      })
    ).resolves.toMatchObject({ status: 'started', scriptName: 'lint' })
    expect(harness.confirmRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptName: 'lint',
        workspaceName: path.basename(harness.root as string)
      }),
      expect.any(AbortSignal)
    )
    expect(harness.spawn).toHaveBeenCalledExactlyOnceWith(
      process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/trusted/bin/pnpm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', '""C:\\Trusted\\pnpm.cmd" run lint"']
        : ['run', 'lint'],
      expect.objectContaining({
        cwd: harness.root,
        shell: false,
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsVerbatimArguments: process.platform === 'win32'
      })
    )

    const denied = createHarness({ shellAllowed: false })
    const deniedTokens = await selectAndList(denied)
    await expect(
      denied.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: deniedTokens.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(denied.confirmRun).not.toHaveBeenCalled()
    expect(denied.spawn).not.toHaveBeenCalled()
  })

  it('uses a fixed Windows command host without child-selected command-line fields', async () => {
    const harness = createHarness({ platform: 'win32' })
    const selected = await selectAndList(harness)
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: selected.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'started' })
    expect(harness.spawn).toHaveBeenCalledExactlyOnceWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', '""C:\\Trusted\\pnpm.cmd" run lint"'],
      expect.objectContaining({
        shell: false,
        cwd: harness.root,
        windowsVerbatimArguments: true
      })
    )

    const unsafeManager = createHarness({
      platform: 'win32',
      packageManagerPath: 'C:\\Trusted\\%PATH%\\pnpm.cmd'
    })
    const unsafeTokens = await selectAndList(unsafeManager)
    await expect(
      unsafeManager.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: unsafeTokens.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'failed', reason: 'execution-failed' })
    expect(unsafeManager.spawn).not.toHaveBeenCalled()
  })

  it('resolves pnpm only from absolute main-owned PATH entries', () => {
    const trustedBin = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-pnpm-bin-'))
    const executableName = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const executable = path.join(trustedBin, executableName)
    fs.writeFileSync(executable, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')
    if (process.platform !== 'win32') fs.chmodSync(executable, 0o700)

    expect(
      resolvePluginWorkspacePackageManagerPath(process.platform, {
        PATH: ['.', 'relative-bin', trustedBin].join(path.delimiter)
      })
    ).toBe(fs.realpathSync(executable))
    expect(resolvePluginWorkspacePackageManagerPath(process.platform, { PATH: '.' })).toBeNull()
  })

  it('drops relative PATH entries and package-manager environment overrides', async () => {
    const absoluteEntries =
      process.platform === 'win32'
        ? ['C:\\Trusted', 'C:\\Windows\\System32']
        : ['/trusted/bin', '/usr/bin']
    const harness = createHarness({
      environment: {
        PATH: ['.', 'relative-bin', ...absoluteEntries].join(path.delimiter),
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        PNPM_HOME: '/attacker/pnpm'
      }
    })
    const selected = await selectAndList(harness)
    await harness.registry.dispatch('process.workspace-scripts', {
      operation: 'run-script',
      scriptToken: selected.listed.scripts[0].token
    })

    expect(harness.resolvePackageManager).toHaveBeenCalledWith(
      process.platform,
      expect.objectContaining({ PATH: absoluteEntries.join(path.delimiter) })
    )
    const resolvedEnvironment = harness.resolvePackageManager.mock.calls[0][1]
    expect(resolvedEnvironment).not.toHaveProperty('PATHEXT')
    expect(resolvedEnvironment).not.toHaveProperty('PNPM_HOME')
  })

  it('blocks identity replacement during confirmation and through spawn', async () => {
    const confirmationRoot = createWorkspace()
    const confirmationPackage = path.join(confirmationRoot, 'package.json')
    const confirmationHarness = createHarness({
      root: confirmationRoot,
      onConfirm() {
        fs.renameSync(confirmationPackage, `${confirmationPackage}.old`)
        fs.writeFileSync(
          confirmationPackage,
          JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest' } })
        )
      }
    })
    const confirmationTokens = await selectAndList(confirmationHarness)
    await expect(
      confirmationHarness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: confirmationTokens.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'package-replaced' })
    expect(confirmationHarness.spawn).not.toHaveBeenCalled()

    const spawnRoot = createWorkspace()
    const process = controlledProcess()
    process.started.resolve()
    const spawnHarness = createHarness({
      root: spawnRoot,
      processFactory: () => process.process,
      onSpawn() {
        fs.renameSync(spawnRoot, `${spawnRoot}-old`)
        fs.mkdirSync(spawnRoot)
        fs.writeFileSync(
          path.join(spawnRoot, 'package.json'),
          JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest' } })
        )
      }
    })
    const spawnTokens = await selectAndList(spawnHarness)
    const pending = spawnHarness.registry.dispatch('process.workspace-scripts', {
      operation: 'run-script',
      scriptToken: spawnTokens.listed.scripts[0].token
    })
    await vi.waitFor(() => expect(process.process.kill).toHaveBeenCalledOnce())
    process.exit.resolve({ code: null })
    await expect(pending).resolves.toMatchObject({
      status: 'blocked',
      reason: 'workspace-replaced'
    })
  })

  it('rejects stale activation and host generations before dialog, filesystem or spawn work', async () => {
    const stale = createHarness()
    stale.rotate()
    await expect(
      stale.registry.dispatch('process.workspace-scripts', { operation: 'select-workspace' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(stale.selectWorkspace).not.toHaveBeenCalled()

    const wrongHost = createHarness()
    wrongHost.rotateHost()
    await expect(
      wrongHost.registry.dispatch('process.workspace-scripts', { operation: 'select-workspace' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
  })

  it('rejects root identity replacement before confirmation or spawn', async () => {
    const harness = createHarness()
    const selected = await selectAndList(harness)
    const originalRoot = harness.root as string
    const movedRoot = `${originalRoot}-old`
    fs.renameSync(originalRoot, movedRoot)
    fs.mkdirSync(originalRoot)
    fs.writeFileSync(
      path.join(originalRoot, 'package.json'),
      JSON.stringify({ scripts: { lint: 'eslint .' } })
    )

    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: selected.listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'workspace-replaced' })
    expect(harness.confirmRun).not.toHaveBeenCalled()
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('consumes a denied confirmation token and never starts a process', async () => {
    const harness = createHarness({ confirmed: false })
    const selected = await selectAndList(harness)
    const token = selected.listed.scripts[0].token
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'confirmation-denied' })
    expect(harness.confirmRun).toHaveBeenCalledOnce()
    expect(harness.spawn).not.toHaveBeenCalled()
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })
  })

  it('caller cancellation and shell revoke kill once and wait for the true exit barrier', async () => {
    const cancelledProcess = controlledProcess()
    const cancelled = createHarness({ processFactory: () => cancelledProcess.process })
    const cancelledTokens = await selectAndList(cancelled)
    const controller = new AbortController()
    const pendingCancel = cancelled.registry.dispatch(
      'process.workspace-scripts',
      {
        operation: 'run-script',
        scriptToken: cancelledTokens.listed.scripts[0].token
      },
      controller.signal
    )
    await vi.waitFor(() => expect(cancelledProcess.process.started).toHaveBeenCalledOnce())
    const cancelledExpectation = expect(pendingCancel).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CANCELLED'
    })
    controller.abort()
    await cancelledExpectation
    await vi.waitFor(() => expect(cancelledProcess.process.kill).toHaveBeenCalledOnce())
    const cancelledClose = cancelled.capability.close()
    let closeSettled = false
    void cancelledClose.then(() => {
      closeSettled = true
    })
    await Promise.resolve()
    expect(closeSettled).toBe(false)
    cancelledProcess.exit.resolve({ code: null })
    await cancelledClose
    expect(cancelledProcess.process.kill).toHaveBeenCalledOnce()

    const revokedProcess = controlledProcess()
    const revoked = createHarness({ processFactory: () => revokedProcess.process })
    const revokedTokens = await selectAndList(revoked)
    const pendingRevoke = revoked.registry.dispatch('process.workspace-scripts', {
      operation: 'run-script',
      scriptToken: revokedTokens.listed.scripts[0].token
    })
    await vi.waitFor(() => expect(revokedProcess.process.started).toHaveBeenCalledOnce())
    revoked.revokeShell()
    await vi.waitFor(() => expect(revokedProcess.process.kill).toHaveBeenCalledOnce())
    revokedProcess.exit.resolve({ code: null })
    await expect(pendingRevoke).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    await revoked.capability.close()
    expect(revokedProcess.process.kill).toHaveBeenCalledOnce()
  })

  it('kills once and awaits real exit on cancellation, revoke and close', async () => {
    const controlled = controlledProcess()
    controlled.started.resolve()
    const harness = createHarness({ processFactory: () => controlled.process })
    const { listed } = await selectAndList(harness)
    await expect(
      harness.registry.dispatch('process.workspace-scripts', {
        operation: 'run-script',
        scriptToken: listed.scripts[0].token
      })
    ).resolves.toMatchObject({ status: 'started' })

    const closing = harness.capability.close()
    await vi.waitFor(() => expect(controlled.process.kill).toHaveBeenCalledOnce())
    let settled = false
    void closing.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    controlled.exit.resolve({ code: null })
    await closing
    expect(controlled.process.kill).toHaveBeenCalledOnce()
  })

  it('rejects structural host copies at construction', () => {
    const harness = createHarness()
    expect(() =>
      createPluginWorkspaceScriptCapabilities({
        activation,
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeRead: () => true,
        authorizeShell: () => true,
        watchReadPermissionRevoked: () => () => undefined,
        watchShellPermissionRevoked: () => () => undefined,
        host: { ...harness.host } as never
      })
    ).toThrow()
  })

  it('adapts spawn acknowledgement, kill request and real exit as separate barriers', async () => {
    const child = new EventEmitter() as ChildProcess
    Object.assign(child, {
      pid: undefined,
      kill: vi.fn(() => true),
      removeListener: EventEmitter.prototype.removeListener
    })
    const processAdapter = createPluginWorkspaceScriptProcess(child)
    let started = false
    void processAdapter.started().then(() => {
      started = true
    })
    await Promise.resolve()
    expect(started).toBe(false)
    child.emit('spawn')
    await processAdapter.started()

    const killing = Promise.resolve(processAdapter.kill())
    let exited = false
    void killing.then(() => {
      exited = true
    })
    await Promise.resolve()
    expect(child.kill).toHaveBeenCalledOnce()
    expect(exited).toBe(false)
    child.emit('exit', null)
    await killing
    expect(exited).toBe(true)
  })
})
