import type { PluginIssue } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import type { TouchPlugin } from './plugin'
import type { PluginRuntimeDriftResult } from './runtime/plugin-runtime-repair'
import { PLUGIN_RUNTIME_DRIFT_CODE } from './runtime/plugin-runtime-repair'

export interface PluginPreflightSync {
  syncDeclaredPermissions: (plugin: TouchPlugin) => void
  rememberIssueSnapshot: (plugin: TouchPlugin) => void
}

export interface PluginPreflightFailure {
  issue: PluginIssue
  loadError: {
    code: string
    message: string
  }
  lifecycleErrorMessage: string
}

export function applyLoadedPluginPreflightState(plugin: TouchPlugin): boolean {
  const firstError = plugin.issues.find((issue) => issue.type === 'error')
  if (!firstError) {
    plugin.setLoadState('ready')
    plugin.status = PluginStatus.DISABLED
    return false
  }

  plugin.setLoadState('load_failed', {
    code: firstError.code || 'PLUGIN_LOAD_FAILED',
    message: firstError.message || 'Plugin metadata validation failed.'
  })
  plugin.status = PluginStatus.LOAD_FAILED
  return true
}

export function broadcastPluginPreflightState(
  transport: ITuffTransportMain,
  plugin: TouchPlugin,
  broadcastName = plugin.name
): void {
  transport.broadcast(PluginEvents.push.stateChanged, {
    type: 'updated',
    name: broadcastName,
    changes: plugin.toJSONObject()
  })
}

export function buildRuntimeDriftPreflightFailure(
  runtimeDrift: PluginRuntimeDriftResult
): PluginPreflightFailure {
  const message = `Plugin runtime drift detected: ${runtimeDrift.driftReasons.join(', ')}`

  return {
    issue: {
      type: 'error',
      message,
      source: 'runtime',
      code: PLUGIN_RUNTIME_DRIFT_CODE,
      suggestion:
        'Rebuild or reinstall this plugin runtime bundle. Runtime assets must be repaired by packaging, not at load time.',
      meta: {
        reasons: runtimeDrift.driftReasons,
        manifestVersion: runtimeDrift.targetManifestVersion,
        packageVersion: runtimeDrift.targetPackageVersion
      },
      timestamp: Date.now()
    },
    loadError: {
      code: PLUGIN_RUNTIME_DRIFT_CODE,
      message
    },
    lifecycleErrorMessage: '[Lifecycle] load failed: runtime drift detected'
  }
}

export function buildLoaderFatalPreflightFailure(error: unknown): PluginPreflightFailure {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const stack = error instanceof Error ? error.stack : undefined

  return {
    issue: {
      type: 'error',
      message: `A fatal error occurred while creating the plugin loader: ${message}`,
      source: 'plugin-loader',
      code: 'LOADER_FATAL',
      meta: { error: stack },
      timestamp: Date.now()
    },
    loadError: {
      code: 'LOADER_FATAL',
      message
    },
    lifecycleErrorMessage: '[Lifecycle] load failed'
  }
}

export function applyPluginPreflightFailure(
  plugin: TouchPlugin,
  failure: PluginPreflightFailure,
  context: {
    transport: ITuffTransportMain
    sync: PluginPreflightSync
    broadcastName?: string
    loggerError?: Error
  }
): void {
  plugin.issues.push(failure.issue)
  plugin.setLoadState('load_failed', failure.loadError)
  plugin.status = PluginStatus.LOAD_FAILED
  if (context.loggerError) {
    plugin.logger.error(failure.lifecycleErrorMessage, context.loggerError)
  } else {
    plugin.logger.error(failure.lifecycleErrorMessage)
  }

  context.sync.syncDeclaredPermissions(plugin)
  context.sync.rememberIssueSnapshot(plugin)
  broadcastPluginPreflightState(context.transport, plugin, context.broadcastName)
}
