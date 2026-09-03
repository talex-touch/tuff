import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { mkdir, mkdtemp, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'
import {
  createFixedPluginVscodeProjectsService,
  createPluginVscodeProjectsCapabilities,
  type PluginVscodeProjectsSnapshot,
  type TrustedPluginVscodeProjectsService
} from './plugin-vscode-projects-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-vscode-projects',
  pluginInstanceId: 'vscode-instance',
  activationGeneration: 1,
  key: 'vscode-key'
})
const roots: string[] = []
const error = (code: string) => expect.objectContaining({ code })
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

interface VscodeFixture {
  root: string
  home: string
  storage: string
  project: string
}
async function fixture(): Promise<VscodeFixture> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vscode-capability-')))
  roots.push(root)
  const home = path.join(root, 'home')
  const storage = path.join(
    home,
    'Library',
    'Application Support',
    'Code',
    'User',
    'globalStorage',
    'storage.json'
  )
  const project = path.join(root, 'project')
  await mkdir(path.dirname(storage), { recursive: true })
  await mkdir(project, { recursive: true })
  await writeFile(
    storage,
    JSON.stringify({
      openedPathsList: {
        workspaces3: [{ folderUri: `file://${project}` }, { folderUri: `file://${project}` }]
      }
    })
  )
  return { root, home, storage, project }
}

function makeHarness(service: TrustedPluginVscodeProjectsService, allowed = true) {
  let current: PluginActivationIdentity | undefined = activation
  const revoked = new Set<() => void>()
  const watch = (_name: string, onRevoke: () => void) => {
    revoked.add(onRevoke)
    return () => revoked.delete(onRevoke)
  }
  const capability = createPluginVscodeProjectsCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => 7,
    authorizeRead: () => allowed,
    authorizeIndex: () => allowed,
    authorizeShell: () => allowed,
    watchReadPermissionRevoked: watch,
    watchIndexPermissionRevoked: watch,
    watchShellPermissionRevoked: watch,
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'vscode-handle', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => allowed,
    watchPermissionRevoked: (_name, _permission, onRevoke) => watch(_name, onRevoke),
    onFatalViolation: () => undefined
  })
  registry.register(capability.definitions[0]!)
  return {
    capability,
    registry,
    revoke() {
      for (const callback of revoked) callback()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated' }
    }
  }
}

describe('filesystem.vscode-projects capability and fixed service', () => {
  it('deduplicates allowlisted recent folders and issues opaque tokens that open the verified identity', async () => {
    const data = await fixture()
    const opened: Array<{ target: string; dev: string; ino: string }> = []
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: async (target, _kind, _signal, identity) => {
        opened.push({ target, dev: identity.dev, ino: identity.ino })
      }
    })
    const result = await service.list(new AbortController().signal)
    expect(result).toMatchObject({
      status: 'ready',
      projects: [{ label: 'project', kind: 'folder' }]
    })
    expect(result.status === 'ready' ? result.projects : []).toHaveLength(1)
    const token = result.status === 'ready' ? result.projects[0]!.token : ''
    expect(token).toMatch(/^vsp_[A-Za-z0-9_-]{32}$/)
    expect(token).not.toContain(data.project)
    await expect(service.open(token, new AbortController().signal)).resolves.toEqual({
      status: 'started'
    })
    expect(opened).toEqual([
      {
        target: data.project,
        dev: expect.stringMatching(/^\d+$/),
        ino: expect.stringMatching(/^\d+$/)
      }
    ])
  })

  it('keeps the storage edition in the token proof without exposing it or any path in the DTO', async () => {
    const data = await fixture()
    const insidersProject = path.join(data.root, 'insiders-project')
    const insidersStorage = path.join(
      data.home,
      'Library',
      'Application Support',
      'Code - Insiders',
      'User',
      'globalStorage',
      'storage.json'
    )
    await mkdir(insidersProject)
    await mkdir(path.dirname(insidersStorage), { recursive: true })
    await writeFile(
      insidersStorage,
      JSON.stringify({
        openedPathsList: { workspaces3: [{ folderUri: `file://${insidersProject}` }] }
      })
    )
    const opened: Array<{ target: string; channel: 'stable' | 'insiders' }> = []
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: async (target, _kind, _signal, proof) => {
        opened.push({ target, channel: proof.channel })
      }
    })

    const listed = await service.list(new AbortController().signal)
    expect(listed.status).toBe('ready')
    if (listed.status !== 'ready') return
    expect(listed.projects.map(({ label }) => label).sort()).toEqual([
      'insiders-project',
      'project'
    ])
    for (const project of listed.projects) {
      expect(project).not.toHaveProperty('channel')
      expect(project).not.toHaveProperty('path')
      expect(project).not.toHaveProperty('canonicalPath')
      expect(JSON.stringify(project)).not.toContain(data.root)
    }

    const tokenFor = (label: string): string => {
      const project = listed.projects.find((candidate) => candidate.label === label)
      if (!project) throw new Error(`Missing ${label} project`)
      return project.token
    }
    await service.open(tokenFor('project'), new AbortController().signal)
    await service.open(tokenFor('insiders-project'), new AbortController().signal)
    expect(opened).toEqual([
      { target: data.project, channel: 'stable' },
      { target: insidersProject, channel: 'insiders' }
    ])
  })

  it('reads current windowsState and backupWorkspaces folder records without openedPathsList', async () => {
    const data = await fixture()
    await writeFile(
      data.storage,
      JSON.stringify({
        windowsState: {
          lastActiveWindow: { folder: data.project },
          openedWindows: [{ folder: data.project }]
        },
        backupWorkspaces: { folders: [{ folderUri: `file://${data.project}` }] }
      })
    )
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    await expect(service.list(new AbortController().signal)).resolves.toMatchObject({
      status: 'ready',
      projects: [{ label: 'project', kind: 'folder' }]
    })
  })

  it('reports malformed and unreadable storage distinctly and bounds multibyte labels by bytes', async () => {
    const data = await fixture()
    await writeFile(data.storage, '{invalid json')
    const malformed = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    await expect(malformed.list(new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded',
      reason: 'storage-invalid'
    })

    await writeFile(data.storage, JSON.stringify({ openedPathsList: { workspaces3: [] } }))
    const unreadable = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      filesystem: {
        open: async () => {
          throw Object.assign(new Error('denied'), { code: 'EACCES' })
        }
      },
      openPath: vi.fn()
    })
    await expect(unreadable.list(new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded',
      reason: 'read-failed'
    })

    const project = path.join(data.root, '界'.repeat(80))
    await mkdir(project)
    await writeFile(
      data.storage,
      JSON.stringify({ openedPathsList: { workspaces3: [{ folderUri: project }] } })
    )
    const bounded = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    const result = await bounded.list(new AbortController().signal)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(Buffer.byteLength(result.projects[0]!.label, 'utf8')).toBeLessThanOrEqual(128)
    expect(result.projects[0]!.label).not.toContain('�')
  })

  it('sorts all bounded candidates by recency before applying the 100-project limit', async () => {
    const data = await fixture()
    const projects: string[] = []
    for (let index = 0; index < 102; index += 1) {
      const project = path.join(data.root, `project-${String(index).padStart(3, '0')}`)
      await mkdir(project)
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index))
      await utimes(project, timestamp, timestamp)
      projects.push(project)
    }
    await writeFile(
      data.storage,
      JSON.stringify({
        openedPathsList: { workspaces3: projects.map((folderUri) => ({ folderUri })) }
      })
    )
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    const result = await service.list(new AbortController().signal)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.projects).toHaveLength(100)
    expect(result.projects[0]?.label).toBe('project-101')
    expect(result.projects.at(-1)?.label).toBe('project-002')
  })

  it('selects the Linux VS Code storage allowlist without accepting caller paths', async () => {
    const data = await fixture()
    const storage = path.join(data.home, '.config', 'Code', 'User', 'globalStorage', 'storage.json')
    await mkdir(path.dirname(storage), { recursive: true })
    await writeFile(
      storage,
      JSON.stringify({ windowsState: { lastActiveWindow: { folder: data.project } } })
    )
    const service = createFixedPluginVscodeProjectsService({
      platform: 'linux',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    await expect(service.list(new AbortController().signal)).resolves.toMatchObject({
      status: 'ready',
      projects: [{ label: 'project', kind: 'folder' }]
    })
  })

  it('rejects forged tokens and fails closed when a listed project is replaced', async () => {
    const data = await fixture()
    let reuseListedDevAndIno = false
    let listedProjectStats: Awaited<ReturnType<typeof stat>> | undefined
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn(),
      filesystem: {
        async stat(filePath) {
          const current = await stat(filePath)
          if (filePath !== data.project) return current
          if (!reuseListedDevAndIno) {
            listedProjectStats = current
            return current
          }
          if (!listedProjectStats) throw new Error('project identity was not captured during list')
          return Object.assign(Object.create(Object.getPrototypeOf(current)), current, {
            dev: listedProjectStats.dev,
            ino: listedProjectStats.ino,
            birthtimeMs: Number(listedProjectStats.birthtimeMs) + 1
          }) as typeof current
        }
      }
    })
    const result = await service.list(new AbortController().signal)
    const token = result.status === 'ready' ? result.projects[0]!.token : ''
    await expect(service.open(`${token}forged`, new AbortController().signal)).resolves.toEqual({
      status: 'blocked',
      reason: 'project-missing'
    })
    reuseListedDevAndIno = true
    await rm(data.project, { recursive: true })
    await mkdir(data.project)
    await expect(service.open(token, new AbortController().signal)).resolves.toEqual({
      status: 'failed',
      reason: 'project-replaced'
    })
  })

  it('enforces literal holder, authority, permission, request/result normalization and close cleanup', async () => {
    const data = await fixture()
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    const h = makeHarness(service)
    await expect(
      h.registry.dispatch('filesystem.vscode-projects', { operation: 'list' })
    ).resolves.toMatchObject({ status: 'ready' })
    expect(() =>
      createPluginVscodeProjectsCapabilities({
        activation: { ...activation, name: 'other' },
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeRead: () => true,
        authorizeIndex: () => true,
        authorizeShell: () => true,
        watchReadPermissionRevoked: () => () => undefined,
        watchIndexPermissionRevoked: () => () => undefined,
        watchShellPermissionRevoked: () => () => undefined,
        service
      })
    ).toThrow(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    const definition = h.capability.definitions[0]!
    const forged = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
    await expect(
      definition.invoke(
        { ...forged, identity: { ...forged.identity } } as PluginSecurityContext,
        { operation: 'list' },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(() =>
      definition.validateRequest({ operation: 'open', token: 'bad', extra: true })
    ).toThrow()
    expect(() =>
      definition.validateResult({ status: 'ready', projects: [{ token: 'not-opaque' }] })
    ).toThrow()
    h.rotate()
    await expect(
      h.registry.dispatch('filesystem.vscode-projects', { operation: 'list' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'))
    await h.capability.close()
    await expect(service.open('unknown', new AbortController().signal)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CLOSED'
    })
  })

  it('maps denial, revocation and cancellation to stable failures', async () => {
    const data = await fixture()
    const service = createFixedPluginVscodeProjectsService({
      platform: 'darwin',
      homeDirectory: data.home,
      openPath: vi.fn()
    })
    const denied = makeHarness(service, false)
    await expect(
      denied.registry.dispatch('filesystem.vscode-projects', { operation: 'list' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))
    const active = makeHarness(
      createFixedPluginVscodeProjectsService({
        platform: 'darwin',
        homeDirectory: data.home,
        openPath: async (_path, _kind, signal) =>
          await new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true })
          )
      })
    )
    const listed = (await active.registry.dispatch('filesystem.vscode-projects', {
      operation: 'list'
    })) as PluginVscodeProjectsSnapshot
    const token = listed.status === 'ready' ? listed.projects[0]!.token : ''
    const call = active.registry.dispatch('filesystem.vscode-projects', {
      operation: 'open',
      token
    })
    await vi.waitFor(() => expect(active.registry.activeCount).toBe(1))
    active.revoke()
    await expect(call).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))
  })
})
