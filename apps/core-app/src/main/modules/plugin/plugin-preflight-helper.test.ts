import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { describe, expect, it, vi } from 'vitest'
import type { TouchPlugin } from './plugin'
import {
  applyLoadedPluginPreflightState,
  applyPluginPreflightFailure,
  broadcastPluginPreflightState,
  buildLoaderFatalPreflightFailure,
  buildRuntimeDriftPreflightFailure
} from './plugin-preflight-helper'
import { PLUGIN_RUNTIME_DRIFT_CODE } from './runtime/plugin-runtime-repair'

function createPluginStub(name = 'touch-translation'): TouchPlugin {
  const plugin = {
    name,
    issues: [],
    status: PluginStatus.LOADING,
    loadState: 'loading',
    loadError: undefined,
    logger: {
      error: vi.fn()
    },
    setLoadState: vi.fn((nextState, loadError) => {
      plugin.loadState = nextState
      plugin.loadError = loadError
    }),
    toJSONObject: vi.fn(() => ({
      name: plugin.name,
      status: plugin.status,
      loadState: plugin.loadState,
      loadError: plugin.loadError,
      issues: plugin.issues
    }))
  } as unknown as TouchPlugin

  return plugin
}

function createTransportStub(): ITuffTransportMain {
  return {
    broadcast: vi.fn()
  } as unknown as ITuffTransportMain
}

function createPreflightSync() {
  return {
    syncDeclaredPermissions: vi.fn(),
    rememberIssueSnapshot: vi.fn()
  }
}

describe('plugin preflight helper', () => {
  it('applies runtime drift as load_failed and broadcasts updated state', () => {
    const plugin = createPluginStub()
    const transport = createTransportStub()
    const sync = createPreflightSync()
    const failure = buildRuntimeDriftPreflightFailure({
      status: 'drifted',
      driftReasons: ['missing-index', 'package-version:1.0.3<1.0.4'],
      targetDir: '/tmp/touch-translation',
      targetManifestVersion: '1.0.4',
      targetPackageVersion: '1.0.3'
    })

    applyPluginPreflightFailure(plugin, failure, { transport, sync, broadcastName: 'folder-name' })

    expect(plugin.status).toBe(PluginStatus.LOAD_FAILED)
    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toEqual({
      code: PLUGIN_RUNTIME_DRIFT_CODE,
      message: 'Plugin runtime drift detected: missing-index, package-version:1.0.3<1.0.4'
    })
    expect(plugin.issues).toHaveLength(1)
    expect(plugin.issues[0]).toMatchObject({
      type: 'error',
      source: 'runtime',
      code: PLUGIN_RUNTIME_DRIFT_CODE,
      meta: {
        reasons: ['missing-index', 'package-version:1.0.3<1.0.4'],
        manifestVersion: '1.0.4',
        packageVersion: '1.0.3'
      }
    })
    expect(plugin.logger.error).toHaveBeenCalledWith(
      '[Lifecycle] load failed: runtime drift detected'
    )
    expect(sync.syncDeclaredPermissions).toHaveBeenCalledWith(plugin)
    expect(sync.rememberIssueSnapshot).toHaveBeenCalledWith(plugin)
    expect(transport.broadcast).toHaveBeenCalledWith(PluginEvents.push.stateChanged, {
      type: 'updated',
      name: 'folder-name',
      changes: plugin.toJSONObject()
    })
  })

  it('keeps sdk gate issues as the canonical load_failed state', () => {
    const plugin = createPluginStub('retired-sdk-plugin')
    plugin.issues.push({
      type: 'error',
      source: 'manifest.json',
      code: 'SDKAPI_BLOCKED',
      message: 'Plugin sdkapi is incompatible with the enforced runtime baseline.'
    })

    expect(applyLoadedPluginPreflightState(plugin)).toBe(true)

    expect(plugin.status).toBe(PluginStatus.LOAD_FAILED)
    expect(plugin.loadError).toEqual({
      code: 'SDKAPI_BLOCKED',
      message: 'Plugin sdkapi is incompatible with the enforced runtime baseline.'
    })
    expect(plugin.issues).toHaveLength(1)
  })

  it('broadcasts fatal loader failures without changing the external event shape', () => {
    const plugin = createPluginStub('broken-plugin')
    const transport = createTransportStub()
    const sync = createPreflightSync()
    const error = new Error('manifest is unreadable')

    applyPluginPreflightFailure(plugin, buildLoaderFatalPreflightFailure(error), {
      transport,
      sync,
      loggerError: error
    })

    expect(plugin.status).toBe(PluginStatus.LOAD_FAILED)
    expect(plugin.loadError).toEqual({
      code: 'LOADER_FATAL',
      message: 'manifest is unreadable'
    })
    expect(plugin.issues[0]).toMatchObject({
      type: 'error',
      source: 'plugin-loader',
      code: 'LOADER_FATAL',
      message: 'A fatal error occurred while creating the plugin loader: manifest is unreadable'
    })
    expect(plugin.logger.error).toHaveBeenCalledWith('[Lifecycle] load failed', error)
    expect(transport.broadcast).toHaveBeenCalledWith(PluginEvents.push.stateChanged, {
      type: 'updated',
      name: 'broken-plugin',
      changes: plugin.toJSONObject()
    })
  })

  it('normalizes clean loaded plugins to ready without broadcasting by itself', () => {
    const plugin = createPluginStub('clean-plugin')
    const transport = createTransportStub()

    expect(applyLoadedPluginPreflightState(plugin)).toBe(false)
    broadcastPluginPreflightState(transport, plugin, 'clean-folder')

    expect(plugin.status).toBe(PluginStatus.DISABLED)
    expect(plugin.loadState).toBe('ready')
    expect(plugin.loadError).toBeUndefined()
    expect(transport.broadcast).toHaveBeenCalledWith(PluginEvents.push.stateChanged, {
      type: 'updated',
      name: 'clean-folder',
      changes: plugin.toJSONObject()
    })
  })
})
