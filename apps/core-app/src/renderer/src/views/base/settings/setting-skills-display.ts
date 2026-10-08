import type {
  IntelligenceCapabilityConfig,
  IntelligenceCapabilityProviderBinding
} from '@talex-touch/tuff-intelligence'
import type {
  SkillInventoryRow,
  SkillStorageKind
} from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'

/**
 * The skills page's rules, kept out of the components so they can be tested as rules: how the
 * built-in skills are ordered and summarised, which rows a search and an agent filter leave, what a
 * storage location is called, and how a built-in skill's drawer draft sits on top of the stored
 * configuration until 保存 writes it.
 */

/* ─── built-in skills ─── */

/** The order people reach for the built-in skills in; anything unlisted is ranked by keyword. */
export const BUILTIN_SKILL_ORDER = [
  'text.chat',
  'text.translate',
  'text.summarize',
  'intent.detect',
  'keywords.extract',
  'content.extract',
  'sentiment.analyze',
  'code.generate',
  'code.explain',
  'code.review',
  'vision.ocr',
  'image.caption',
  'image.analyze',
  'image.translate.e2e',
  'audio.asr',
  'audio.stt',
  'audio.transcribe'
] as const

const BUILTIN_RANK = new Map<string, number>(BUILTIN_SKILL_ORDER.map((id, index) => [id, index]))

export function builtinSkillRank(capability: IntelligenceCapabilityConfig): number {
  const exactRank = BUILTIN_RANK.get(capability.id)
  if (exactRank !== undefined) return exactRank

  const searchable = `${capability.id} ${capability.label || ''}`.toLowerCase()
  if (searchable.includes('chat') || searchable.includes('对话')) return 0.5
  if (searchable.includes('translate') || searchable.includes('翻译')) return 1.5
  if (searchable.includes('summar') || searchable.includes('摘要')) return 2.5
  if (searchable.includes('intent') || searchable.includes('意图')) return 3.5
  if (searchable.includes('code') || searchable.includes('代码')) return 7.5
  if (searchable.includes('image') || searchable.includes('vision') || searchable.includes('图像'))
    return 10.5
  if (searchable.includes('audio') || searchable.includes('音频')) return 14.5
  return 1000
}

/** The built-in skills in the order the page has always listed them. */
export function sortBuiltinSkills(
  capabilities: readonly IntelligenceCapabilityConfig[]
): IntelligenceCapabilityConfig[] {
  return [...capabilities].sort((left, right) => {
    const rankDiff = builtinSkillRank(left) - builtinSkillRank(right)
    if (rankDiff !== 0) return rankDiff
    return (left.label || left.id).localeCompare(right.label || right.id)
  })
}

export function filterBuiltinSkills(
  capabilities: readonly IntelligenceCapabilityConfig[],
  query: string
): IntelligenceCapabilityConfig[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...capabilities]
  return capabilities.filter((capability) =>
    [capability.id, capability.label ?? '', capability.description ?? ''].some((text) =>
      text.toLocaleLowerCase().includes(needle)
    )
  )
}

export interface BuiltinSkillChannelSummary {
  /** The first channel in priority order. */
  channel: string
  /** Its first model, when the binding names one. */
  model: string | null
  /** Further channels behind it. */
  more: number
}

/**
 * "Channel · model" for a built-in skill's row: its first enabled binding in priority order, and how
 * many more there are. Null when nothing is bound. The program-owned on-device dictation channel is
 * counted like any other: it is what serves dictation, and leaving it out would report a working
 * skill as not configured.
 */
export function builtinSkillChannelSummary(
  capability: IntelligenceCapabilityConfig,
  channelName: (providerId: string) => string
): BuiltinSkillChannelSummary | null {
  const enabled = (capability.providers ?? [])
    .filter((binding) => binding.enabled !== false)
    .slice()
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  const first = enabled[0]
  if (!first) return null
  return {
    channel: channelName(first.providerId),
    model: first.models?.find((model) => model.trim()) ?? null,
    more: enabled.length - 1
  }
}

/* ─── local skills ─── */

/** Where a skill file lives, as the row's label says it. */
export const STORAGE_LABEL_KEYS: Readonly<Record<SkillStorageKind, string>> = Object.freeze({
  'cc-switch': 'settings.skillsPage.storage.ccSwitch',
  'agents-shared': 'settings.skillsPage.storage.agentsShared',
  local: 'settings.skillsPage.storage.local',
  'tuff-import': 'settings.skillsPage.storage.tuffImport',
  other: 'settings.skillsPage.storage.other'
})

/** The agents that have a skill in their own directory, once each, in scan order. */
export function skillAgentIds(row: SkillInventoryRow): AiAgentId[] {
  return [...new Set(row.sources.map((source) => source.agentId))]
}

export interface SkillRowFilter {
  query: string
  agentId: AiAgentId | null
  agentLabel: (agentId: AiAgentId) => string
  storageLabel: (kind: SkillStorageKind) => string
}

/**
 * The local skills a search and an agent filter leave, in main's order. The search reads what the
 * row shows: name, description, the agents' names and where the file is stored.
 */
export function filterSkillRows(
  rows: readonly SkillInventoryRow[],
  filter: SkillRowFilter
): SkillInventoryRow[] {
  const needle = filter.query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (filter.agentId && !row.sources.some((source) => source.agentId === filter.agentId))
      return false
    if (!needle) return true
    return [
      row.name,
      row.description,
      filter.storageLabel(row.storage),
      ...skillAgentIds(row).map((agentId) => filter.agentLabel(agentId))
    ].some((text) => text.toLocaleLowerCase().includes(needle))
  })
}

export function enabledSkillCount(rows: readonly SkillInventoryRow[]): number {
  return rows.filter((row) => row.enabledInTuff).length
}

/** The directory holding a path, on either separator; the path itself when it has no parent. */
export function parentDirectory(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut > 0 ? trimmed.slice(0, cut) : trimmed
}

/** Names that more than one row carries: two files that only share a name stay two rows. */
export function sharedNames(rows: readonly SkillInventoryRow[]): Set<string> {
  const seen = new Set<string>()
  const shared = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.name)) shared.add(row.name)
    seen.add(row.name)
  }
  return shared
}

/**
 * What a row's storage label stands for, shown on hover. A name several rows share gets each row's
 * real path, since "本地" twice tells the rows apart only by which agent marks are lit; "其他位置"
 * always gets the directory holding the skill, since "elsewhere" alone does not say where. Null
 * when the label says enough on its own.
 */
export function storageHint(
  row: SkillInventoryRow,
  nameShared: boolean,
  keptInTuff: string
): string | null {
  if (nameShared) return row.realPath ?? row.storageRoot ?? keptInTuff
  if (row.storage === 'other' && row.realPath) return parentDirectory(row.realPath)
  return null
}

/* ─── the built-in skill drawer's draft ─── */

/**
 * What the drawer changed and has not written yet. The stored configuration stays untouched until
 * 保存: the settings store persists every write on its own a moment later, so an edit that went
 * there would be saved whether or not the user chose to.
 *
 * Binding or unbinding a channel arrives as a new binding list, the same as a reorder — that is how
 * the channel list reports both — so it is recorded as the user's order, as it always was.
 */
export interface BuiltinSkillDraft {
  providers?: IntelligenceCapabilityProviderBinding[]
  promptTemplate?: string
  userReordered?: true
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([left], [right]) => left.localeCompare(right))
        )
      : inner
  )
}

/** The stored skill with the draft laid over it: what the drawer shows. */
export function mergeBuiltinDraft(
  capability: IntelligenceCapabilityConfig,
  draft: BuiltinSkillDraft
): IntelligenceCapabilityConfig {
  return {
    ...capability,
    ...(draft.providers ? { providers: draft.providers } : {}),
    ...(draft.promptTemplate !== undefined ? { promptTemplate: draft.promptTemplate } : {}),
    ...(draft.userReordered
      ? { metadata: { ...(capability.metadata ?? {}), userReordered: true } }
      : {})
  }
}

/**
 * Drops every part of the draft that equals what is stored, so changing something and changing it
 * back leaves nothing to save — and nothing to ask about on close.
 */
export function normalizeBuiltinDraft(
  capability: IntelligenceCapabilityConfig,
  draft: BuiltinSkillDraft
): BuiltinSkillDraft {
  const next: BuiltinSkillDraft = {}
  if (draft.providers && stable(draft.providers) !== stable(capability.providers ?? []))
    next.providers = draft.providers
  if (
    draft.promptTemplate !== undefined &&
    draft.promptTemplate !== (capability.promptTemplate ?? '')
  )
    next.promptTemplate = draft.promptTemplate
  const storedReordered =
    (capability.metadata as { userReordered?: unknown } | undefined)?.userReordered === true
  // The user's order means something only next to the order it describes: a channel switched on and
  // back off leaves the bindings as stored, and nothing to save.
  if (draft.userReordered && !storedReordered && next.providers) next.userReordered = true
  return next
}

export function builtinDraftDirty(draft: BuiltinSkillDraft): boolean {
  return (
    draft.providers !== undefined ||
    draft.promptTemplate !== undefined ||
    draft.userReordered === true
  )
}

function withBinding(
  bindings: readonly IntelligenceCapabilityProviderBinding[],
  providerId: string,
  patch: Partial<IntelligenceCapabilityProviderBinding>
): IntelligenceCapabilityProviderBinding[] {
  const next = [...bindings]
  const index = next.findIndex((binding) => binding.providerId === providerId)
  if (index === -1) next.push({ providerId, enabled: true, priority: next.length + 1, ...patch })
  else next[index] = { ...next[index]!, ...patch }
  return next
}

export function draftSetModels(
  capability: IntelligenceCapabilityConfig,
  draft: BuiltinSkillDraft,
  providerId: string,
  models: readonly string[]
): BuiltinSkillDraft {
  const current = mergeBuiltinDraft(capability, draft).providers ?? []
  const normalized = models.map((model) => model.trim()).filter(Boolean)
  return { ...draft, providers: withBinding(current, providerId, { models: normalized }) }
}

export function draftReorder(
  draft: BuiltinSkillDraft,
  bindings: IntelligenceCapabilityProviderBinding[]
): BuiltinSkillDraft {
  return { ...draft, providers: bindings, userReordered: true }
}

export function draftPrompt(draft: BuiltinSkillDraft, prompt: string): BuiltinSkillDraft {
  return { ...draft, promptTemplate: prompt }
}

/* ─── saving the draft ─── */

/** Writes to one built-in skill in the settings store: its bindings, and the fields patched. */
export interface BuiltinStoreWrite {
  providers?: IntelligenceCapabilityProviderBinding[]
  patch?: Partial<Pick<IntelligenceCapabilityConfig, 'promptTemplate' | 'metadata'>>
}

function plain<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** What a save writes: only the fields the draft changed, as plain values. */
export function builtinSaveWrite(
  capability: IntelligenceCapabilityConfig,
  draft: BuiltinSkillDraft
): BuiltinStoreWrite {
  const write: BuiltinStoreWrite = {}
  if (draft.providers) write.providers = plain(draft.providers)
  const patch: NonNullable<BuiltinStoreWrite['patch']> = {}
  if (draft.promptTemplate !== undefined) patch.promptTemplate = draft.promptTemplate
  if (draft.userReordered)
    patch.metadata = { ...plain(capability.metadata ?? {}), userReordered: true }
  if (Object.keys(patch).length > 0) write.patch = patch
  return write
}

/**
 * What puts back the fields a failed save replaced. A field is put back only while the store still
 * holds what that save wrote: one that changed since — a reload after a conflict, another page —
 * belongs to whoever changed it and is left alone.
 */
export function builtinRevertWrite(
  before: IntelligenceCapabilityConfig,
  applied: BuiltinStoreWrite,
  current: IntelligenceCapabilityConfig
): BuiltinStoreWrite {
  const revert: BuiltinStoreWrite = {}
  if (applied.providers && stable(current.providers ?? []) === stable(applied.providers))
    revert.providers = plain(before.providers ?? [])
  const patch: NonNullable<BuiltinStoreWrite['patch']> = {}
  if (
    applied.patch &&
    'promptTemplate' in applied.patch &&
    (current.promptTemplate ?? '') === (applied.patch.promptTemplate ?? '')
  )
    patch.promptTemplate = before.promptTemplate
  if (applied.patch?.metadata && stable(current.metadata) === stable(applied.patch.metadata))
    patch.metadata = plain(before.metadata)
  if (Object.keys(patch).length > 0) revert.patch = patch
  return revert
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * The sentence a failed save shows. Every reason the storage layer can produce gets its own:
 * collapsing them into one "storage service returned a failure" is what made a busy-event-loop IPC
 * timeout read as a backend outage, and sent the reader looking at a service that does not exist.
 */
export function builtinSaveErrorText(error: unknown, t: Translate): string {
  const details =
    error && typeof error === 'object'
      ? (error as { details?: { reason?: string; version?: number } }).details
      : undefined
  const message = error instanceof Error ? error.message : String(error || '')
  const version = details?.version ?? '-'

  switch (details?.reason) {
    case 'transport-uninitialized':
      return t('settings.intelligence.capabilitySaveErrorTransport')
    case 'transport':
      return t('settings.intelligence.capabilitySaveErrorTransportLost')
    case 'conflict':
      return t('settings.intelligence.capabilitySaveErrorConflict', { version })
    case 'conflict-reload-failed':
      return t('settings.intelligence.capabilitySaveErrorConflictReload', { version })
    case 'credential-rejected':
      return t('settings.intelligence.capabilitySaveErrorCredential')
    case 'persist-failed':
      return t('settings.intelligence.capabilitySaveErrorPersist', { version })
    case 'invalid-key':
    case 'rejected':
      return t('settings.intelligence.capabilitySaveErrorRejected', { version })
    default:
      return message || t('settings.intelligence.capabilitySaveErrorUnknown')
  }
}
