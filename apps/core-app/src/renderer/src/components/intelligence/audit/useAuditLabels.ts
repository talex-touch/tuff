/**
 * `audit-labels.ts`, wired to the live lists: channel configs and capabilities from the
 * Intelligence settings, installed plugins from the plugin store.
 */
import type { ITuffIcon } from '@talex-touch/utils'
import type { AuditCallerLabel, AuditChannelLabel } from './audit-labels'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ICON
} from '~/modules/intelligence/nexus-provider'
import { getProviderChannelType } from '~/modules/intelligence/provider-channel-type'
import { resolveProviderIcon } from '~/modules/intelligence/provider-icon-override'
import { providerIconFor, providerIconForId } from '~/modules/intelligence/provider-icons'
import { usePluginStore } from '~/stores/plugin'
import {
  buildPluginCallerNames,
  findChannel,
  resolveCallerLabel,
  resolveCapabilityLabel,
  resolveChannelLabel
} from './audit-labels'

export interface AuditChannelView extends AuditChannelLabel {
  /** `null` when the id names no channel: the template draws its own placeholder glyph. */
  icon: ITuffIcon | null
}

export interface AuditLabels {
  channel: (id: string) => AuditChannelView
  caller: (caller: string, operation?: string | null) => AuditCallerLabel
  capability: (id: string) => string
}

export function useAuditLabels(): AuditLabels {
  const { t } = useI18n()
  const { providers, capabilities } = useIntelligenceManager()
  const pluginStore = usePluginStore()

  const pluginNames = computed(() => buildPluginCallerNames(pluginStore.plugins.values()))

  function channel(id: string): AuditChannelView {
    const label = resolveChannelLabel(id, providers.value, t)
    const config = findChannel(id, providers.value)
    if (config) {
      return {
        ...label,
        // The same marks the channels page draws, so a channel cannot look like one adapter
        // there and another here.
        icon: isNexusManagedProvider(config)
          ? TUFF_NEXUS_PROVIDER_ICON
          : resolveProviderIcon(config, getProviderChannelType(config))
      }
    }
    if (label.builtin) {
      // A CLI gets its own mark; system OCR the local server glyph.
      return {
        ...label,
        icon: providerIconForId(id, id === 'local-system-ocr' ? 'local' : 'custom')
      }
    }
    return { ...label, icon: label.legacyType ? providerIconFor(id) : null }
  }

  function caller(key: string, operation?: string | null): AuditCallerLabel {
    return resolveCallerLabel(key, operation, pluginNames.value, t)
  }

  function capability(id: string): string {
    return resolveCapabilityLabel(id, capabilities.value)
  }

  return { channel, caller, capability }
}
