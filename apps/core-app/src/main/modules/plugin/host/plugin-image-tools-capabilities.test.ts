import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createPluginImageToolsCapabilities,
  type PluginImageToolsImageMetadata,
  type PluginImageToolsRenderer
} from './plugin-image-tools-capabilities'

const roots: string[] = []
const image = Buffer.from('host-only-image-fixture')
const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-image',
  pluginInstanceId: 'image-tools-instance',
  activationGeneration: 1,
  key: 'image-tools-key'
})
const capabilityError = (code: string) => expect.objectContaining({ code })

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ root: string; source: string; output: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-image-tools-capability-'))
  roots.push(root)
  const source = path.join(root, 'source.png')
  await fs.writeFile(source, image)
  return { root, source, output: path.join(root, 'export.webp') }
}

function fileQuery(source: string): unknown {
  return {
    text: '64x64 q82',
    inputs: [
      {
        type: 'files',
        content: JSON.stringify([source]),
        metadata: { name: 'portrait.png' },
        rawContent: 'child-never-sees-this',
        thumbnail: 'child-never-sees-this',
        path: source
      }
    ]
  }
}

function dataQuery(): unknown {
  return {
    inputs: [
      {
        type: 'image',
        content: `data:image/png;base64,${image.toString('base64')}`,
        metadata: { name: 'portrait.png' },
        rawContent: 'child-never-sees-this',
        thumbnail: 'child-never-sees-this'
      }
    ]
  }
}

async function harness(
  options: {
    readAllowed?: boolean
    writeAllowed?: boolean
    renderer?: Partial<PluginImageToolsRenderer>
    dialog?: (
      request: { defaultName: string; format: string },
      signal: AbortSignal
    ) => Promise<{ cancelled: boolean; filePath?: string }>
    filesystem?: Parameters<typeof createPluginImageToolsCapabilities>[0]['filesystem']
    now?: () => number
  } = {}
) {
  const files = await fixture()
  let current: PluginActivationIdentity | undefined = activation
  let readAllowed = options.readAllowed ?? true
  let writeAllowed = options.writeAllowed ?? true
  const watches = new Map<string, Set<() => void>>()
  const renderer: PluginImageToolsRenderer = {
    async inspect(): Promise<PluginImageToolsImageMetadata> {
      return { format: 'png', width: 2, height: 2 }
    },
    async render(_source, request) {
      return {
        data: Buffer.from(`rendered:${request.format}`),
        width: request.width ?? 2,
        height: request.height ?? 2
      }
    },
    ...options.renderer
  }
  const capability = createPluginImageToolsCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => 7,
    authorizeRead: () => readAllowed,
    authorizeWrite: () => writeAllowed,
    watchReadPermissionRevoked: (_pluginName, listener) => {
      const listeners = watches.get('fs.read') ?? new Set<() => void>()
      listeners.add(listener)
      watches.set('fs.read', listeners)
      return () => listeners.delete(listener)
    },
    watchWritePermissionRevoked: (_pluginName, listener) => {
      const listeners = watches.get('fs.write') ?? new Set<() => void>()
      listeners.add(listener)
      watches.set('fs.write', listeners)
      return () => listeners.delete(listener)
    },
    filesystem: options.filesystem,
    nativeSaveDialog: {
      save: async (request, signal) =>
        options.dialog
          ? await options.dialog(request, signal)
          : { cancelled: false, filePath: files.output }
    },
    imageRenderer: renderer,
    now: options.now
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'image-tools-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: (_pluginName, permission) => permission === 'fs.read' && readAllowed,
    watchPermissionRevoked: (_pluginName, permission, listener) => {
      const listeners = watches.get(permission) ?? new Set<() => void>()
      listeners.add(listener)
      watches.set(permission, listeners)
      return () => listeners.delete(listener)
    },
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0]!)
  return {
    ...files,
    capability,
    registry,
    renderer,
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-image-tools-key' }
    },
    revoke(permission: 'fs.read' | 'fs.write') {
      if (permission === 'fs.read') readAllowed = false
      else writeAllowed = false
      for (const listener of [...(watches.get(permission) ?? [])]) listener()
    }
  }
}

function tokenFrom(query: unknown): string {
  const token = (query as { inputs?: Array<{ content?: unknown }> }).inputs?.[0]?.content
  if (typeof token !== 'string') throw new Error('IMAGE_TOOLS_TOKEN_MISSING')
  return token
}

describe('media.image-tools isolated capability', () => {
  it('replaces one approved data-url or file input with an opaque image token and redacted metadata', async () => {
    const h = await harness()
    const data = await h.capability.prepareLifecycleQuery(dataQuery())
    const fromFile = await h.capability.prepareLifecycleQuery(fileQuery(h.source))

    for (const sanitized of [data, fromFile]) {
      const serialized = JSON.stringify(sanitized)
      expect(tokenFrom(sanitized)).toMatch(/^img_[A-Za-z0-9_-]{32}$/)
      expect(sanitized).toMatchObject({
        inputs: [{ type: 'image', metadata: { name: 'portrait.png' } }]
      })
      expect(serialized).not.toContain(h.source)
      expect(serialized).not.toContain(image.toString('base64'))
      expect(serialized).not.toMatch(/rawContent|thumbnail|"path"/)
    }

    await h.registry.close()
    await h.capability.close()
  })

  it('normalizes zero, multiple, and unsupported lifecycle inputs into non-privileged safe queries', async () => {
    const h = await harness()
    await expect(
      h.capability.prepareLifecycleQuery({ text: 'x'.repeat(300), inputs: [] })
    ).resolves.toEqual({
      text: 'x'.repeat(256),
      inputs: []
    })
    await expect(
      h.capability.prepareLifecycleQuery({
        text: 'multi',
        inputs: [
          { type: 'image', content: 'data:image/png;base64,AA==' },
          { type: 'files', content: JSON.stringify([h.source]) }
        ]
      })
    ).resolves.toEqual({
      text: 'multi',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'source-invalid' } }]
    })
    await expect(
      h.capability.prepareLifecycleQuery({
        text: 'text-only',
        inputs: [{ type: 'text', content: 'not an image' }]
      })
    ).resolves.toEqual({ text: 'text-only', inputs: [] })

    await h.registry.close()
    await h.capability.close()
  })

  it('expires data-url authority at five minutes and clears replacement, revocation, and close timers', async () => {
    vi.useFakeTimers()
    const expired = await harness()
    const first = tokenFrom(await expired.capability.prepareLifecycleQuery(dataQuery()))
    expect(vi.getTimerCount()).toBe(1)
    const second = tokenFrom(await expired.capability.prepareLifecycleQuery(dataQuery()))
    expect(vi.getTimerCount()).toBe(1)
    expect(first).not.toBe(second)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    await expect(
      expired.registry.dispatch('media.image-tools', { token: second, format: 'png' })
    ).resolves.toEqual({
      status: 'blocked',
      reason: 'token-invalid'
    })
    expect(vi.getTimerCount()).toBe(0)

    const revoked = await harness()
    await revoked.capability.prepareLifecycleQuery(dataQuery())
    expect(vi.getTimerCount()).toBe(1)
    revoked.revoke('fs.read')
    expect(vi.getTimerCount()).toBe(0)

    const closed = await harness()
    await closed.capability.prepareLifecycleQuery(dataQuery())
    expect(vi.getTimerCount()).toBe(1)
    await closed.capability.close()
    expect(vi.getTimerCount()).toBe(0)

    for (const h of [expired, revoked, closed]) {
      await h.registry.close()
      await h.capability.close()
    }
  })

  it('grants the capability only to touch-image and refuses stale or denied activation authority', async () => {
    const h = await harness()
    await expect(
      h.registry.dispatch('media.image-tools', {
        token: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        format: 'png'
      })
    ).resolves.toEqual({ status: 'blocked', reason: 'token-invalid' })
    expect(() =>
      createPluginImageToolsCapabilities({
        activation: { ...activation, name: 'not-touch-image' },
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeRead: () => true,
        authorizeWrite: () => true,
        watchReadPermissionRevoked: () => () => undefined,
        watchWritePermissionRevoked: () => () => undefined,
        nativeSaveDialog: { save: async () => ({ cancelled: true }) },
        imageRenderer: h.renderer
      })
    ).toThrow(capabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))

    h.rotate()
    await expect(h.capability.prepareLifecycleQuery(fileQuery(h.source))).rejects.toMatchObject(
      capabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    )
    const denied = await harness({ writeAllowed: false })
    await expect(
      denied.capability.prepareLifecycleQuery(fileQuery(denied.source))
    ).resolves.toEqual({
      text: '64x64 q82',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'permission-denied' } }]
    })
    await expect(
      denied.registry.dispatch('media.image-tools', {
        token: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        format: 'png'
      })
    ).rejects.toMatchObject(capabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))

    await h.registry.close()
    await h.capability.close()
    await denied.registry.close()
    await denied.capability.close()
  })

  it('rejects malformed tokens and dimensions or quality outside the export contract', async () => {
    const h = await harness()
    const definition = h.capability.definitions[0]!
    const valid = tokenFrom(await h.capability.prepareLifecycleQuery(fileQuery(h.source)))
    for (const request of [
      { token: 'img_short', format: 'png' },
      { token: valid, format: 'svg' },
      { token: valid, format: 'png', width: 0 },
      { token: valid, format: 'png', width: 64 },
      { token: valid, format: 'png', height: 64 },
      { token: valid, format: 'png', height: 8193 },
      { token: valid, format: 'png', width: 8192, height: 8192 },
      { token: valid, format: 'webp', quality: 0 },
      { token: valid, format: 'jpeg', quality: 101 },
      { token: valid, format: 'png', quality: 82 },
      { token: valid, format: 'ico', quality: 82 },
      { token: valid, format: 'ico', width: 32, height: 48 },
      { token: valid, format: 'png', width: 1.5 }
    ]) {
      expect(() => definition.validateRequest(request)).toThrow()
    }

    await h.registry.close()
    await h.capability.close()
  })

  it('refuses symlinked, replaced, over-limit, unsupported, and animated source images before export', async () => {
    const linked = await harness()
    const link = path.join(linked.root, 'source-link.png')
    await fs.symlink(linked.source, link)
    await expect(linked.capability.prepareLifecycleQuery(fileQuery(link))).resolves.toEqual({
      text: '64x64 q82',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'source-invalid' } }]
    })

    const replaced = await harness()
    const token = tokenFrom(
      await replaced.capability.prepareLifecycleQuery(fileQuery(replaced.source))
    )
    const original = `${replaced.source}.original`
    await fs.rename(replaced.source, original)
    await fs.writeFile(replaced.source, image)
    await expect(
      replaced.registry.dispatch('media.image-tools', { token, format: 'png' })
    ).resolves.toEqual({
      status: 'blocked',
      reason: 'source-replaced'
    })

    const oversized = await harness({
      filesystem: {
        async lstat(filePath) {
          const stat = await fs.lstat(filePath)
          return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
            size: 32 * 1024 * 1024 + 1
          }) as never
        }
      }
    })
    await expect(
      oversized.capability.prepareLifecycleQuery(fileQuery(oversized.source))
    ).resolves.toEqual({
      text: '64x64 q82',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'source-too-large' } }]
    })
    const unsupported = await harness({
      renderer: { inspect: async () => ({ format: 'svg', width: 2, height: 2 }) }
    })
    await expect(unsupported.capability.prepareLifecycleQuery(dataQuery())).resolves.toEqual({
      text: '',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'source-unsupported' } }]
    })
    const animated = await harness({
      renderer: {
        inspect: async () => ({ format: 'gif', width: 2, height: 2, pages: 2, animated: true })
      }
    })
    await expect(animated.capability.prepareLifecycleQuery(dataQuery())).resolves.toEqual({
      text: '',
      inputs: [{ type: 'image', content: '', metadata: { reason: 'source-animated' } }]
    })

    for (const h of [linked, replaced, oversized, unsupported, animated]) {
      await h.registry.close()
      await h.capability.close()
    }
  })

  it('cancels native save selection and cleans an uncommitted atomic stage after write failure', async () => {
    const cancelled = await harness({ dialog: async () => ({ cancelled: true }) })
    const token = tokenFrom(
      await cancelled.capability.prepareLifecycleQuery(fileQuery(cancelled.source))
    )
    await expect(
      cancelled.registry.dispatch('media.image-tools', { token, format: 'png' })
    ).resolves.toEqual({ status: 'cancelled' })
    await expect(fs.access(cancelled.output)).rejects.toMatchObject({ code: 'ENOENT' })

    const cleanup = await harness({
      filesystem: {
        async rename() {
          throw new Error('synthetic rename failure')
        }
      }
    })
    const cleanupToken = tokenFrom(
      await cleanup.capability.prepareLifecycleQuery(fileQuery(cleanup.source))
    )
    await expect(
      cleanup.registry.dispatch('media.image-tools', {
        token: cleanupToken,
        format: 'webp',
        quality: 82
      })
    ).resolves.toEqual({
      status: 'failed',
      reason: 'write-failed'
    })
    expect(
      (await fs.readdir(cleanup.root)).some(
        (entry) => entry.includes('.img-') && entry.endsWith('.tmp')
      )
    ).toBe(false)

    for (const h of [cancelled, cleanup]) {
      await h.registry.close()
      await h.capability.close()
    }
  })

  it('stops before commit on abort or permission revocation, but tells the truth after atomic commit', async () => {
    let renderStarted!: () => void
    let releaseRender!: () => void
    const renderStartedPromise = new Promise<void>((resolve) => {
      renderStarted = resolve
    })
    const renderBarrier = new Promise<void>((resolve) => {
      releaseRender = resolve
    })
    const aborted = await harness({
      renderer: {
        async render(_source, request, signal) {
          renderStarted()
          await Promise.race([
            renderBarrier,
            new Promise<void>((resolve) =>
              signal.addEventListener('abort', () => resolve(), { once: true })
            )
          ])
          if (signal.aborted) throw Object.freeze({ code: 'cancelled' })
          return {
            data: Buffer.from('rendered'),
            width: request.width ?? 2,
            height: request.height ?? 2
          }
        }
      }
    })
    const abortToken = tokenFrom(
      await aborted.capability.prepareLifecycleQuery(fileQuery(aborted.source))
    )
    const controller = new AbortController()
    const pending = aborted.registry.dispatch(
      'media.image-tools',
      { token: abortToken, format: 'png' },
      controller.signal
    )
    await renderStartedPromise
    controller.abort()
    releaseRender()
    await expect(pending).rejects.toMatchObject(capabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    await expect(fs.access(aborted.output)).rejects.toMatchObject({ code: 'ENOENT' })

    const lateController = new AbortController()
    const committed = await harness({
      filesystem: {
        async rename(from, to) {
          await fs.rename(from, to)
          lateController.abort()
        }
      }
    })
    const committedToken = tokenFrom(
      await committed.capability.prepareLifecycleQuery(fileQuery(committed.source))
    )
    await expect(
      committed.registry.dispatch(
        'media.image-tools',
        { token: committedToken, format: 'png' },
        lateController.signal
      )
    ).resolves.toMatchObject({ status: 'saved', format: 'png', width: 2, height: 2 })
    await expect(fs.readFile(committed.output)).resolves.toEqual(Buffer.from('rendered:png'))

    for (const h of [aborted, committed]) {
      await h.registry.close()
      await h.capability.close()
    }
  })

  it('revocation aborts a pending save, clears the token, and close tears down all future access', async () => {
    let started!: () => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const h = await harness({
      dialog: async (_request, signal) => {
        started()
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        )
        return { cancelled: true }
      }
    })
    const token = tokenFrom(await h.capability.prepareLifecycleQuery(fileQuery(h.source)))
    const pending = h.registry.dispatch('media.image-tools', { token, format: 'png' })
    await began
    h.revoke('fs.write')
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
    await expect(
      h.registry.dispatch('media.image-tools', { token, format: 'png' })
    ).rejects.toMatchObject(capabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))

    await h.capability.close()
    await expect(h.capability.prepareLifecycleQuery(fileQuery(h.source))).rejects.toMatchObject(
      capabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    )
    await h.registry.close()
  })
})
