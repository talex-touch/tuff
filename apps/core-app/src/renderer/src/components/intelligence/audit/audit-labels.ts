/**
 * Names for the ids the usage ledger stores: channels, callers and capabilities.
 *
 * The ledger keeps ids only — a channel config id, an opaque caller, a capability id — and the
 * page has to say what each one is. Pure functions over the lists they need, so the mapping rules
 * are testable without a store; `useAuditLabels` wires them to the live lists.
 *
 * Callers are opaque identifiers (`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`): they are
 * matched whole against names built from what is installed, never split on a separator.
 */
import {
  INTELLIGENCE_CONVERSATION_TITLE_OPERATION,
  INTELLIGENCE_HOME_OPENING_OPERATION,
  INTELLIGENCE_HOME_SURFACE,
  IntelligenceProviderType,
  PI_CLI_PROVIDER_ID
} from '@talex-touch/utils/types/intelligence'

export type AuditTranslate = (key: string, params?: Record<string, unknown>) => string

/** The slice of a channel config the labels read. */
export interface AuditChannelSource {
  id: string
  name?: string
  type: string
}

export interface AuditChannelLabel {
  /** The id as stored, for a tooltip and for exports. */
  id: string
  name: string
  /** The id names no channel any more (and is not a bare channel type either). */
  deleted: boolean
  /** Only a type was recorded: rows written before audit rows carried the channel id. */
  legacyType: boolean
  /** A channel the main process adds at run time (system OCR, a local CLI). */
  builtin?: boolean
}

/**
 * Channels the main process adds at run time and never stores (`intelligence-config.ts`): system
 * OCR and the local AI CLIs. They are missing from the stored channel list, so without this table
 * every call they answered — every Pi, Codex or Claude Code turn — would read as a deleted channel.
 */
export const BUILTIN_CHANNEL_LABEL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'local-system-ocr': 'intelligenceAudit.channels.systemOcr',
  [PI_CLI_PROVIDER_ID]: 'intelligenceAudit.channels.piCli',
  'omp-cli': 'intelligenceAudit.channels.ompCli',
  'codex-cli': 'intelligenceAudit.channels.codexCli',
  'claude-cli': 'intelligenceAudit.channels.claudeCli'
})

/**
 * Channel types older rows recorded in place of the channel id (parent PRD, data quality).
 * Their labels are the channel-type names the channels page already shows.
 */
const LEGACY_TYPE_LABEL_KEYS: Record<string, string> = {
  [IntelligenceProviderType.OPENAI]: 'settings.intelligence.providerTypeOptions.openai',
  [IntelligenceProviderType.ANTHROPIC]: 'settings.intelligence.providerTypeOptions.anthropic',
  [IntelligenceProviderType.DEEPSEEK]: 'settings.intelligence.providerTypeOptions.deepseek',
  [IntelligenceProviderType.SILICONFLOW]: 'settings.intelligence.providerTypeOptions.siliconflow',
  [IntelligenceProviderType.LOCAL]: 'settings.intelligence.providerTypeOptions.local',
  [IntelligenceProviderType.CUSTOM]: 'settings.intelligence.custom'
}

/**
 * A channel config id as the reader knows it: the name they gave the channel. An id that is a
 * bare channel type names the type; anything else no longer exists.
 */
export function resolveChannelLabel(
  id: string,
  channels: readonly AuditChannelSource[],
  t: AuditTranslate
): AuditChannelLabel {
  const channel = channels.find((candidate) => candidate.id === id)
  if (channel) {
    return { id, name: channel.name || channel.id, deleted: false, legacyType: false }
  }
  const builtinKey = Object.hasOwn(BUILTIN_CHANNEL_LABEL_KEYS, id)
    ? BUILTIN_CHANNEL_LABEL_KEYS[id]
    : undefined
  if (builtinKey)
    return { id, name: t(builtinKey), deleted: false, legacyType: false, builtin: true }
  const typeKey = Object.hasOwn(LEGACY_TYPE_LABEL_KEYS, id) ? LEGACY_TYPE_LABEL_KEYS[id] : undefined
  if (typeKey) return { id, name: t(typeKey), deleted: false, legacyType: true }
  return { id, name: t('intelligenceAudit.channels.deleted'), deleted: true, legacyType: false }
}

/** The channel config itself, when the id still names one — for its icon. */
export function findChannel<T extends AuditChannelSource>(
  id: string,
  channels: readonly T[]
): T | undefined {
  return channels.find((candidate) => candidate.id === id)
}

/**
 * Built-in callers, by their whole id (parent design §1.4). `system` is the capability test the
 * settings page runs, not "the system": it predates `core.intelligence.capability-test`.
 */
export const CORE_CALLER_LABEL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'core.home.conversation': 'intelligenceAudit.callers.homeConversation',
  'core.home.opening': 'intelligenceAudit.callers.homeOpening',
  'core.home.conversation-title': 'intelligenceAudit.callers.conversationTitle',
  'core.corebox.context-action': 'intelligenceAudit.callers.coreboxContextAction',
  'core.ocr.clipboard': 'intelligenceAudit.callers.clipboardOcr',
  'core.ocr.embedding': 'intelligenceAudit.callers.ocrEmbedding',
  'core.files.embedding': 'intelligenceAudit.callers.fileEmbedding',
  'core.app.tts': 'intelligenceAudit.callers.appSpeech',
  'core.app.chat': 'intelligenceAudit.callers.appChat',
  'core.voice.dictate': 'intelligenceAudit.callers.voiceDictate',
  'core.voice.file-transcription': 'intelligenceAudit.callers.voiceFileTranscription',
  'core.voice.buffered-asr': 'intelligenceAudit.callers.voiceBufferedAsr',
  'core.voice.speak': 'intelligenceAudit.callers.voiceSpeak',
  'core.assistant.screenshot-translate': 'intelligenceAudit.callers.screenshotTranslate',
  'core.recommendation.semantic-embedding': 'intelligenceAudit.callers.recommendationEmbedding',
  'core.recommendation.semantic-rerank': 'intelligenceAudit.callers.recommendationRerank',
  'core.intelligence.capability-test': 'intelligenceAudit.callers.capabilityTest',
  system: 'intelligenceAudit.callers.capabilityTest',
  'omni-panel': 'intelligenceAudit.callers.omniPanel',
  'ai-cli-orchestrator': 'intelligenceAudit.callers.agentRuntime',
  'intelligence.orchestrator': 'intelligenceAudit.callers.orchestrator',
  'host:core-app': 'intelligenceAudit.callers.hostApp'
})

/**
 * Rows without a caller predate the `core.*` callers; Home's own calls still say which Home
 * surface made them through `metadata.operation`, which the ledger groups them by.
 */
export const HOME_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  [INTELLIGENCE_HOME_SURFACE]: 'intelligenceAudit.callers.homeConversation',
  [INTELLIGENCE_CONVERSATION_TITLE_OPERATION]: 'intelligenceAudit.callers.conversationTitle',
  [INTELLIGENCE_HOME_OPENING_OPERATION]: 'intelligenceAudit.callers.homeOpening'
})

export type AuditCallerKind = 'plugin' | 'core' | 'home' | 'in-app' | 'unknown'

export interface AuditCallerLabel {
  label: string
  kind: AuditCallerKind
}

/** `plugin:<manifest name>` → the plugin's display name, built from what is installed. */
export function buildPluginCallerNames(
  plugins: Iterable<{ name: string; displayName?: string }>
): Map<string, string> {
  const names = new Map<string, string>()
  for (const plugin of plugins) {
    if (!plugin?.name) continue
    // The host binds a plugin's calls to exactly this string (`plugin-intelligence-capabilities`).
    names.set(`plugin:${plugin.name}`, plugin.displayName || plugin.name)
  }
  return names
}

/**
 * A caller as the reader knows it.
 *
 * - `''` (no caller) with a Home operation → that Home surface; any other `''` → 应用内其他.
 * - A built-in id → its name; `system` → 能力测试; `ai-cli-orchestrator` → Agent 运行时.
 * - An installed plugin, matched on the whole `plugin:<name>` the host binds → its display name.
 * - Anything else is shown as stored. It is not taken apart to guess a plugin name: an
 *   uninstalled plugin and an id that merely looks like one are indistinguishable from here.
 */
export function resolveCallerLabel(
  caller: string,
  operation: string | null | undefined,
  pluginNames: ReadonlyMap<string, string>,
  t: AuditTranslate
): AuditCallerLabel {
  if (caller === '') {
    const homeKey =
      operation && Object.hasOwn(HOME_OPERATION_LABEL_KEYS, operation)
        ? HOME_OPERATION_LABEL_KEYS[operation]
        : undefined
    return homeKey
      ? { label: t(homeKey), kind: 'home' }
      : { label: t('intelligenceAudit.callers.inApp'), kind: 'in-app' }
  }
  const coreKey = Object.hasOwn(CORE_CALLER_LABEL_KEYS, caller)
    ? CORE_CALLER_LABEL_KEYS[caller]
    : undefined
  if (coreKey) return { label: t(coreKey), kind: 'core' }
  const plugin = pluginNames.get(caller)
  if (plugin) return { label: plugin, kind: 'plugin' }
  return { label: caller, kind: 'unknown' }
}

/** The slice of a capability config the labels read. */
export interface AuditCapabilitySource {
  label?: string
}

export function resolveCapabilityLabel(
  id: string,
  capabilities: Readonly<Record<string, AuditCapabilitySource | undefined>>
): string {
  const capability = Object.hasOwn(capabilities, id) ? capabilities[id] : undefined
  return capability?.label || id
}

/** The usage limits' names live in an alias-free module the Node-run diagnostics can load too. */
export { USAGE_LIMIT_LABEL_KEYS, usageLimitLabelKey } from './usage-limit-labels'
