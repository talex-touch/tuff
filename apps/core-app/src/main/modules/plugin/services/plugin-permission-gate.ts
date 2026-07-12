import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { generatePermissionIssue } from '@talex-touch/utils/permission'
import { getPermissionModule } from '../../permission'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { PermissionEvents } from '@talex-touch/utils/transport/events'

const PERMISSION_MISSING_ISSUE_CODE = 'PERMISSION_MISSING'

export function syncPermissionMissingIssue(plugin: ITouchPlugin): boolean {
  if (!plugin.declaredPermissions) return false

  const permissionModule = getPermissionModule()
  if (!permissionModule) return false

  const declared = {
    required: [...(plugin.declaredPermissions.required || [])],
    optional: [...(plugin.declaredPermissions.optional || [])]
  }
  const status = permissionModule
    .getStore()
    .getPluginPermissionStatus(plugin.name, plugin.sdkapi, declared)
  const computedIssue = generatePermissionIssue(status)
  const nextPermissionIssue =
    computedIssue?.code === PERMISSION_MISSING_ISSUE_CODE
      ? {
          type: computedIssue.type,
          message: computedIssue.message,
          source: 'manifest.json',
          code: computedIssue.code,
          suggestion: computedIssue.suggestion,
          meta: {
            required: declared.required,
            optional: declared.optional,
            enforcePermissions: status.enforcePermissions
          },
          timestamp: Date.now()
        }
      : null

  const previousIssue = plugin.issues.find((issue) => issue.code === PERMISSION_MISSING_ISSUE_CODE)
  const shouldUpdateIssue =
    Boolean(previousIssue) !== Boolean(nextPermissionIssue) ||
    (previousIssue?.message ?? '') !== (nextPermissionIssue?.message ?? '') ||
    (previousIssue?.suggestion ?? '') !== (nextPermissionIssue?.suggestion ?? '')

  if (!shouldUpdateIssue) return false

  const retainedIssues = plugin.issues.filter(
    (issue) => issue.code !== PERMISSION_MISSING_ISSUE_CODE
  )
  plugin.issues = nextPermissionIssue ? [...retainedIssues, nextPermissionIssue] : retainedIssues
  return true
}

export interface PluginPermissionGateContext {
  pluginName: string
  plugin: ITouchPlugin
  transport: ITuffTransportMain
  mainWindowId: number
  pendingPermissionPlugins: Map<string, { pluginName: string; autoRetry: boolean }>
  log: {
    info: (message: string, details?: unknown) => void
    warn: (message: string) => void
  }
}

/** Requests declared permissions and records the plugin for lifecycle-driven retry. */
export function requestPluginPermissionConfirmation(context: PluginPermissionGateContext): boolean {
  const { pluginName, plugin, transport, mainWindowId, pendingPermissionPlugins, log } = context
  if (!plugin.declaredPermissions) return false

  const permissionModule = getPermissionModule()
  if (!permissionModule) return false

  const declared = {
    required: plugin.declaredPermissions.required || [],
    optional: plugin.declaredPermissions.optional || []
  }
  if (!permissionModule.needsPermissionConfirmation(pluginName, plugin.sdkapi, declared)) {
    return false
  }

  const missing = permissionModule.getMissingPermissions(pluginName, plugin.sdkapi, declared)
  log.info(
    `Plugin ${pluginName} needs permission confirmation: ${missing.required.length} required, ${missing.optional.length} optional`
  )
  void transport
    .sendToWindow(mainWindowId, PermissionEvents.push.startupRequest, {
      pluginId: pluginName,
      pluginName: plugin.name,
      sdkapi: plugin.sdkapi,
      required: missing.required,
      optional: missing.optional,
      reasons: plugin.declaredPermissions.reasons || {}
    })
    .catch(() => {
      log.warn(`Main window not available for permission request: ${pluginName}`)
    })

  pendingPermissionPlugins.set(pluginName, {
    pluginName: plugin.name,
    autoRetry: true
  })
  log.info(`Plugin enable blocked: missing required permissions [${missing.required.join(', ')}]`, {
    meta: { plugin: pluginName }
  })
  return true
}
