import type { IExecuteArgs, TuffItem } from '@talex-touch/utils'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ProviderContext } from '../../box-tool/search-engine/types'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_ENTITY_ACTION_IDS as actions,
  PLUGIN_ENTITY_ACTION_FAILED,
  PLUGIN_ENTITY_PERMISSION_REQUIRED,
  readPluginEntitySnapshot
} from '../../../../shared/plugin-entity'
import { PluginEntityProvider } from './plugin-entity-provider'

const boundary = vi.hoisted(() => ({
  plugins: new Map<string, ITouchPlugin>(),
  pending: new Map<string, unknown>(),
  enable: vi.fn(),
  disable: vi.fn(),
  reload: vi.fn(),
  broadcast: vi.fn(),
  openPath: vi.fn(),
  open: vi.fn(),
  openPlugin: vi.fn()
}))
vi.mock('electron', () => ({ app: {}, shell: { openPath: boundary.openPath } }))
vi.mock('../plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: boundary.plugins,
      pendingPermissionPlugins: boundary.pending,
      enablePlugin: boundary.enable,
      disablePlugin: boundary.disable,
      reloadPlugin: boundary.reload
    }
  }
}))
vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: () => ({
    transport: { broadcast: boundary.broadcast }
  })
}))
vi.mock('../../../utils/i18n-helper', () => ({ t: (key: string) => key }))
vi.mock('../../app-destination/app-destination-navigation', () => ({
  getAppDestinationNavigationService: () => ({
    open: boundary.open,
    openPlugin: boundary.openPlugin
  })
}))
// Keep the real feature projector and enable/broadcast service; isolate unrelated native hosts.
vi.mock('../view/plugin-view-loader', () => ({ PluginViewLoader: {} }))
vi.mock('../../box-tool/search-engine/execute-recorder', () => ({
  recordAcceptedExecute: vi.fn(),
  resolveExecuteEventId: vi.fn()
}))
vi.mock('../../box-tool/search-engine/utils/resolve-clipboard-inputs', () => ({
  resolveClipboardInputs: vi.fn()
}))
vi.mock('../../../service/official-plugin.service', () => ({ getOfficialPlugins: vi.fn() }))
vi.mock('../../../hooks/use-electron-guard', () => ({
  useAliveTarget: vi.fn(),
  useAliveWebContents: vi.fn()
}))
vi.mock('../../box-tool/core-box/view-cache', () => ({ viewCacheManager: {} }))
vi.mock('../plugin-content-installer', () => ({
  installPluginContentPackageToLocalPlugin: vi.fn()
}))
vi.mock('../plugin', () => ({ TouchPlugin: class {} }))
vi.mock('../runtime/plugin-runtime-tracker', () => ({ pluginRuntimeTracker: {} }))
vi.mock('../widget/widget-manager', () => ({ widgetManager: {} }))

function plugin(
  name: string,
  status = PluginStatus.ENABLED,
  extra: Partial<ITouchPlugin> = {}
): ITouchPlugin {
  const feature = {
    id: 'write',
    name: 'Write',
    desc: 'Write a note',
    commands: [],
    platform: ['darwin', 'win32', 'linux'],
    push: false,
    priority: 0,
    icon: { type: 'emoji', value: 'N' },
    interaction: { type: 'webcontent', showInput: true }
  } as IPluginFeature
  const value = {
    name,
    displayName: name,
    desc: 'A private notebook',
    version: '1.2.3',
    status,
    pluginPath: `/plugins/${name}`,
    meta: {},
    getFeatures: () => [feature],
    ...extra
  } as ITouchPlugin
  boundary.plugins.set(name, value)
  return value
}
function execute(item: TuffItem, actionId?: string): IExecuteArgs {
  return { item, actionId } as IExecuteArgs
}
async function rows(provider: PluginEntityProvider, text = '插件') {
  return (await provider.onSearch({ text, inputs: [] }, new AbortController().signal)).items
}

beforeEach(() => {
  boundary.plugins.clear()
  boundary.pending.clear()
  vi.clearAllMocks()
  boundary.openPath.mockResolvedValue('')
  boundary.openPlugin.mockReturnValue({ status: 'opened' })
  boundary.enable.mockImplementation(async (name: string) => {
    boundary.plugins.get(name)!.status = PluginStatus.ENABLED
    return true
  })
  boundary.disable.mockImplementation(async (name: string) => {
    boundary.plugins.get(name)!.status = PluginStatus.DISABLED
    return true
  })
  boundary.reload.mockImplementation(async (name: string) => {
    boundary.plugins.get(name)!.status = PluginStatus.ENABLED
  })
})

describe('installed plugin provider', () => {
  it.each(['插件', '插件列表', 'plugins'])(
    'lists installed plugins for %s but never internal plugins',
    async (text) => {
      plugin('enabled')
      plugin('disabled', PluginStatus.DISABLED)
      plugin('internal', PluginStatus.ENABLED, {
        meta: { internal: true }
      } as Partial<ITouchPlugin>)
      const result = await rows(new PluginEntityProvider(), text)
      expect(result.map((item) => item.id)).toEqual([
        'plugin-entity:enabled',
        'plugin-entity:disabled'
      ])
      expect(result.map((item) => readPluginEntitySnapshot(item)?.state)).toEqual([
        'enabled',
        'disabled'
      ])
    }
  )

  it.each(['touch-notes', '笔记', 'biji', 'notebook'])(
    'finds a plugin by name, display name, pinyin or description: %s',
    async (text) => {
      plugin('touch-notes', PluginStatus.ENABLED, { displayName: '笔记', desc: 'A notebook' })
      plugin('unrelated', PluginStatus.DISABLED, { desc: 'Calculate numbers' })
      expect((await rows(new PluginEntityProvider(), text)).map((item) => item.id)).toEqual([
        'plugin-entity:touch-notes'
      ])
    }
  )

  it('finds the new pinyin name after an installed plugin changes its display name', async () => {
    const installed = plugin('touch-notes', PluginStatus.ENABLED, { displayName: '笔记' })
    const provider = new PluginEntityProvider()
    expect((await rows(provider, 'biji')).map((item) => item.id)).toEqual([
      'plugin-entity:touch-notes'
    ])
    installed.displayName = '翻译'
    expect(await rows(provider, 'biji')).toEqual([])
    expect((await rows(provider, 'fanyi')).map((item) => item.id)).toEqual([
      'plugin-entity:touch-notes'
    ])
  })

  it('does not crowd ordinary one-character searches or return an aborted search', async () => {
    plugin('touch-notes')
    const provider = new PluginEntityProvider()
    expect(await rows(provider, 't')).toEqual([])
    const controller = new AbortController()
    controller.abort()
    expect(
      (await provider.onSearch({ text: '插件', inputs: [] }, controller.signal)).items
    ).toEqual([])
  })

  it('updates available actions and runnable features when enable and disable change the plugin', async () => {
    plugin('notes', PluginStatus.DISABLED)
    const provider = new PluginEntityProvider()
    const [disabled] = await rows(provider)
    expect(disabled.actions?.map((action) => action.id)).toEqual([
      actions.enable,
      actions.reload,
      actions.openFolder,
      actions.openDetail
    ])
    expect(disabled.actions?.filter((action) => action.primary).map((action) => action.id)).toEqual(
      [actions.enable]
    )
    expect(readPluginEntitySnapshot(disabled)?.features[0].item).toBeUndefined()
    expect(disabled.meta?.keepCoreBoxOpen).toBe(true)
    await provider.onExecute(execute(disabled))
    const [enabled] = await rows(provider)
    expect(readPluginEntitySnapshot(enabled)).toMatchObject({
      state: 'enabled',
      primaryAction: actions.runFeature,
      features: [{ item: { kind: 'feature', meta: { pluginName: 'notes', featureId: 'write' } } }]
    })
    expect(enabled.meta?.keepCoreBoxOpen).toBe(false)
    expect(enabled.actions?.map((action) => action.id)).toEqual([
      actions.runFeature,
      actions.disable,
      actions.reload,
      actions.openFolder,
      actions.openDetail
    ])
    expect(boundary.broadcast.mock.calls.map(([, payload]) => payload)).toEqual([
      { type: 'status-changed', name: 'notes', status: PluginStatus.ENABLED }
    ])
    expect(boundary.broadcast.mock.calls[0][0]).toBe(PluginEvents.push.stateChanged)
    await provider.onExecute(execute(enabled, actions.disable))
    expect(readPluginEntitySnapshot((await rows(provider))[0])?.state).toBe('disabled')
    expect(boundary.broadcast.mock.calls[1][1]).toEqual({
      type: 'status-changed',
      name: 'notes',
      status: PluginStatus.DISABLED
    })
  })

  it('offers reload for a failed load even when runtime status says enabled, and never offers reload while loading', async () => {
    plugin('failed', PluginStatus.ENABLED, {
      loadState: 'load_failed',
      loadError: { message: ' Broken manifest ' }
    } as Partial<ITouchPlugin>)
    plugin('loading', PluginStatus.LOADING)
    const provider = new PluginEntityProvider()
    const result = await rows(provider)
    const failed = result.find((item) => item.id.endsWith(':failed'))!
    expect(readPluginEntitySnapshot(failed)).toMatchObject({
      state: 'failed',
      problem: { type: 'error', message: 'Broken manifest' },
      primaryAction: actions.reload
    })
    expect(failed.meta?.keepCoreBoxOpen).toBe(true)
    expect(
      result.find((item) => item.id.endsWith(':loading'))!.actions?.map((action) => action.id)
    ).toEqual([actions.openDetail, actions.openFolder])
  })

  it('reloads a crashed plugin into an executable feature result', async () => {
    plugin('crashed', PluginStatus.CRASHED)
    const provider = new PluginEntityProvider()
    const [item] = await rows(provider)
    expect(readPluginEntitySnapshot(item)?.primaryAction).toBe(actions.reload)
    await provider.onExecute(execute(item))
    expect(readPluginEntitySnapshot((await rows(provider))[0])).toMatchObject({
      state: 'enabled',
      primaryAction: actions.runFeature,
      features: [{ item: { id: 'crashed/write' } }]
    })
  })

  it('distinguishes permission-required enable from failure without announcing a successful state change', async () => {
    plugin('notes', PluginStatus.DISABLED)
    const provider = new PluginEntityProvider()
    await provider.onLoad({ touchApp: {} } as ProviderContext)
    const [item] = await rows(provider)
    boundary.enable.mockResolvedValue(false)
    boundary.pending.set('notes', {})
    await expect(provider.onExecute(execute(item))).rejects.toThrow(
      PLUGIN_ENTITY_PERMISSION_REQUIRED
    )
    expect(boundary.open.mock.calls.map(([destination]) => destination)).toEqual(['main-window'])
    expect(boundary.broadcast).not.toHaveBeenCalled()
    boundary.pending.clear()
    boundary.open.mockClear()
    await expect(provider.onExecute(execute(item))).rejects.toThrow(PLUGIN_ENTITY_ACTION_FAILED)
    expect(boundary.open).not.toHaveBeenCalled()
    expect(readPluginEntitySnapshot((await rows(provider))[0])?.state).toBe('disabled')
  })

  it('does not mistake a rejected disable for a permission request even when a permission card exists', async () => {
    plugin('notes')
    boundary.pending.set('notes', {})
    boundary.disable.mockResolvedValue(false)
    const provider = new PluginEntityProvider()
    await provider.onLoad({ touchApp: {} } as ProviderContext)
    const [item] = await rows(provider)
    await expect(provider.onExecute(execute(item, actions.disable))).rejects.toThrow(
      PLUGIN_ENTITY_ACTION_FAILED
    )
    expect(boundary.open).not.toHaveBeenCalled()
    expect(boundary.broadcast).not.toHaveBeenCalled()
    expect(readPluginEntitySnapshot((await rows(provider))[0])?.state).toBe('enabled')
  })

  it('treats Electron openPath error strings and unavailable detail navigation as action failures', async () => {
    plugin('notes')
    const provider = new PluginEntityProvider()
    await provider.onLoad({ touchApp: {} } as ProviderContext)
    const [item] = await rows(provider)
    boundary.openPath.mockResolvedValue('Permission denied')
    await expect(provider.onExecute(execute(item, actions.openFolder))).rejects.toThrow(
      PLUGIN_ENTITY_ACTION_FAILED
    )
    boundary.openPlugin.mockReturnValue({ status: 'unavailable' })
    await expect(provider.onExecute(execute(item, actions.openDetail))).rejects.toThrow(
      PLUGIN_ENTITY_ACTION_FAILED
    )
  })

  it.each(['app:notes', 'plugin-entity:missing', 'plugin-entity:internal'])(
    'rejects foreign, removed and internal results: %s',
    async (id) => {
      plugin('notes')
      plugin('internal', PluginStatus.ENABLED, {
        meta: { internal: true }
      } as Partial<ITouchPlugin>)
      await expect(
        new PluginEntityProvider().onExecute(execute({ id } as TuffItem, actions.disable))
      ).rejects.toThrow('PLUGIN_ENTITY_NOT_FOUND')
      expect(boundary.plugins.get('notes')?.status).toBe(PluginStatus.ENABLED)
      expect(boundary.broadcast).not.toHaveBeenCalled()
    }
  )
})
