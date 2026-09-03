import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import type { PluginAiSessionsCapabilities } from './host/plugin-ai-sessions-capabilities'
import type { PluginBrowserDataCapabilities } from './host/plugin-browser-data-capabilities'
import type { PluginBrowserOpenCapabilities } from './host/plugin-browser-open-capabilities'
import type { PluginHostCapabilityDefinition } from './host/plugin-host-capabilities'
import type { PluginHostCapability } from './host/plugin-host-wire'
import type { PluginHostsCapabilities } from './host/plugin-hosts-capabilities'
import type { PluginImageToolsCapabilities } from './host/plugin-image-tools-capabilities'
import type { PluginIntelligenceCapabilities } from './host/plugin-intelligence-capabilities'
import type { PluginIntelligenceContextCapabilities } from './host/plugin-intelligence-context-capabilities'
import type { PluginOrcaCapabilities } from './host/plugin-orca-capabilities'
import type { PluginSnipasteProcessCapability } from './host/plugin-process-capabilities'
import type { PluginRuntimeService } from './host/plugin-runtime-service'
import type { PluginSystemActionCapabilities } from './host/plugin-system-capabilities'
import type { PluginVscodeProjectsCapabilities } from './host/plugin-vscode-projects-capabilities'
import type { PluginWindowManagerCapabilities } from './host/plugin-window-manager-capabilities'
import type { PluginWindowPresetCapabilities } from './host/plugin-window-preset-capabilities'
import type { PluginWorkspaceScriptCapabilities } from './host/plugin-workspace-script-capabilities'
import { isPrivilegedPluginFor } from './privileged-plugins'

/** Everything plugin-module installs on TouchPlugin for one module generation. */
export interface TouchPluginRuntimeCapabilities {
  runtimeService: PluginRuntimeService | null
  snipasteProcess:
    | ((activation: PluginActivationIdentity) => PluginSnipasteProcessCapability)
    | null
  systemAction: ((activation: PluginActivationIdentity) => PluginSystemActionCapabilities) | null
  browserOpen: ((activation: PluginActivationIdentity) => PluginBrowserOpenCapabilities) | null
  browserData: ((activation: PluginActivationIdentity) => PluginBrowserDataCapabilities) | null
  translation: ((activation: PluginActivationIdentity) => PluginIntelligenceCapabilities) | null
  intelligenceContext:
    | ((activation: PluginActivationIdentity) => PluginIntelligenceContextCapabilities)
    | null
  windowManager: ((activation: PluginActivationIdentity) => PluginWindowManagerCapabilities) | null
  windowPreset: ((activation: PluginActivationIdentity) => PluginWindowPresetCapabilities) | null
  workspaceScript:
    | ((activation: PluginActivationIdentity) => PluginWorkspaceScriptCapabilities)
    | null
  hosts: ((activation: PluginActivationIdentity) => PluginHostsCapabilities) | null
  vscodeProjects:
    | ((activation: PluginActivationIdentity) => PluginVscodeProjectsCapabilities)
    | null
  orca: ((activation: PluginActivationIdentity) => PluginOrcaCapabilities) | null
  aiSessions: ((activation: PluginActivationIdentity) => PluginAiSessionsCapabilities) | null
  imageTools: ((activation: PluginActivationIdentity) => PluginImageToolsCapabilities) | null
}

/** A complete empty capability set for tests and teardown-safe initialization. */
export function emptyTouchPluginRuntimeCapabilities(): TouchPluginRuntimeCapabilities {
  return {
    runtimeService: null,
    snipasteProcess: null,
    systemAction: null,
    browserOpen: null,
    browserData: null,
    translation: null,
    intelligenceContext: null,
    windowManager: null,
    windowPreset: null,
    workspaceScript: null,
    hosts: null,
    vscodeProjects: null,
    orca: null,
    aiSessions: null,
    imageTools: null
  }
}

const TRANSLATION_RUNTIME_CAPABILITIES = Object.freeze([
  'feature.items.push',
  'feature.items.widget.push',
  'feature.items.clear',
  'clipboard.write',
  'intelligence.invoke'
] as const satisfies readonly PluginHostCapability[])

const INTELLIGENCE_RUNTIME_CAPABILITIES = Object.freeze([
  'permission.check',
  'feature.registry.add',
  'feature.registry.remove',
  'feature.registry.list',
  'feature.items.push',
  'feature.items.widget.push',
  'feature.items.clear',
  'storage.file.read',
  'storage.file.write',
  'storage.file.list',
  'clipboard.write',
  'clipboard.copy-and-paste',
  'intelligence.context.invoke',
  'intelligence.stream'
] as const satisfies readonly PluginHostCapability[])

export function resolvePluginRuntimeCapabilityAllowlist(
  pluginName: string
): readonly PluginHostCapability[] | undefined {
  if (pluginName === 'touch-translation') return TRANSLATION_RUNTIME_CAPABILITIES
  if (isPrivilegedPluginFor('intelligenceContext', pluginName))
    return INTELLIGENCE_RUNTIME_CAPABILITIES
  return undefined
}

type ClassicUtilityCapabilityName =
  | 'hosts'
  | 'vscodeProjects'
  | 'orca'
  | 'aiSessions'
  | 'imageTools'

type ClassicUtilityRuntimeFactories = Pick<
  TouchPluginRuntimeCapabilities,
  ClassicUtilityCapabilityName
>

interface ClosablePluginCapability {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close: () => Promise<void>
}

export interface PluginClassicUtilityCapabilityBundle {
  readonly imageTools: PluginImageToolsCapabilities | null
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close: () => Promise<void>
}

function createCapability<T extends ClosablePluginCapability>(
  pluginName: string,
  capability: ClassicUtilityCapabilityName,
  factory: ((activation: PluginActivationIdentity) => T) | null | undefined,
  unavailableCode: string,
  activation: PluginActivationIdentity
): T | null {
  if (!isPrivilegedPluginFor(capability, pluginName)) return null
  if (!factory) {
    throw Object.assign(new Error(unavailableCode), { code: unavailableCode })
  }
  return factory(activation)
}

export function createPluginClassicUtilityCapabilityBundle(
  pluginName: string,
  activation: PluginActivationIdentity,
  factories: ClassicUtilityRuntimeFactories | null
): PluginClassicUtilityCapabilityBundle | null {
  const hosts = createCapability(
    pluginName,
    'hosts',
    factories?.hosts,
    'PLUGIN_HOSTS_CAPABILITY_UNAVAILABLE',
    activation
  )
  const vscodeProjects = createCapability(
    pluginName,
    'vscodeProjects',
    factories?.vscodeProjects,
    'PLUGIN_VSCODE_PROJECTS_CAPABILITY_UNAVAILABLE',
    activation
  )
  const orca = createCapability(
    pluginName,
    'orca',
    factories?.orca,
    'PLUGIN_ORCA_CAPABILITY_UNAVAILABLE',
    activation
  )
  const aiSessions = createCapability(
    pluginName,
    'aiSessions',
    factories?.aiSessions,
    'PLUGIN_AI_SESSIONS_CAPABILITY_UNAVAILABLE',
    activation
  )
  const imageTools = createCapability(
    pluginName,
    'imageTools',
    factories?.imageTools,
    'PLUGIN_IMAGE_TOOLS_CAPABILITY_UNAVAILABLE',
    activation
  )
  const resources: readonly ClosablePluginCapability[] = [
    hosts,
    vscodeProjects,
    orca,
    aiSessions,
    imageTools
  ].filter((resource): resource is ClosablePluginCapability => resource !== null)

  if (resources.length === 0) return null

  return {
    imageTools,
    definitions: Object.freeze(resources.flatMap((resource) => resource.definitions)),
    async close(): Promise<void> {
      const failures: unknown[] = []
      for (const resource of resources) {
        try {
          await resource.close()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'PLUGIN_ACTIVATION_RESOURCE_CLOSE_FAILED')
      }
    }
  }
}
