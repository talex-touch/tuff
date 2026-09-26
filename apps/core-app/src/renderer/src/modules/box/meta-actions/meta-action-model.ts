import type { ITuffIcon, TuffAction, TuffItem } from '@talex-touch/utils'
import type {
  MetaAction,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { ShortcutChord, ShortcutChordEvent } from '~/modules/shortcuts/shortcut-chord'
import type { RendererPlatform } from '~/modules/platform/renderer-platform'
import { isPluginFooterItem } from '~/components/render/coreBoxFooterHints'
import { shortcutChordLabel, shortcutChordMatches } from '~/modules/shortcuts/shortcut-chord'
import { isSameShortcutChord, parseShortcutString } from '~/modules/shortcuts/shortcut-string'
import {
  COREBOX_PRIMARY_ACTION_ID,
  COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID,
  COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID
} from '../../../../../shared/events/corebox-scenes'
import { estimateMetaPanelHeight } from '../../../../../shared/meta-overlay-geometry'
import { CLIPBOARD_HISTORY_SOURCE_ID } from '../adapter/hooks/clipboard-history-item'

/**
 * The ⌘K action model: which actions an item offers, in which order and group, and under which
 * label, icon and key.
 *
 * Pure on purpose. The CoreBox renderer builds it to size the panel before asking main to show
 * it and to run a shortcut on the selected result without opening the panel; the overlay
 * renderer builds the same model from the same request to draw the panel. One function answering
 * both is what keeps a badge in the panel and the key in the result list meaning the same thing.
 *
 * Labels stay i18n keys (or a provider's own text) until a component resolves them, so neither
 * caller needs an i18n instance to ask what an action is.
 */

/** The panel's groups, in display order. The primary group carries no title. */
export type MetaActionSlot = 'primary' | 'open' | 'copy' | 'organize' | 'flow' | 'plugin'

export const META_ACTION_SLOTS: readonly MetaActionSlot[] = [
  'primary',
  'open',
  'copy',
  'organize',
  'flow',
  'plugin'
]

export type MetaActionLabel = { key: string } | { text: string }

/** Fixed glyphs; `MetaActionItem.vue` maps them to icon classes. */
export type MetaActionGlyph =
  | 'enter'
  | 'play'
  | 'external'
  | 'paste'
  | 'copy'
  | 'copy-path'
  | 'copy-name'
  | 'copy-link'
  | 'terminal'
  | 'finder'
  | 'folder-open'
  | 'folder'
  | 'pin'
  | 'unpin'
  | 'flow'
  | 'translate'
  | 'translate-pin'
  | 'navigate'
  | 'preview'
  | 'edit'
  | 'delete'
  | 'share'
  | 'plugin'

/** Host actions draw a fixed glyph; a plugin's own action may bring its own icon. */
export type MetaActionIcon = { glyph: MetaActionGlyph } | { icon: ITuffIcon }

export interface MetaActionRow {
  /** Action id sent to main on execute. The merged primary row uses `COREBOX_PRIMARY_ACTION_ID`. */
  id: string
  origin: 'builtin' | 'item' | 'plugin'
  slot: MetaActionSlot
  /** Key of the section the row is drawn in. */
  section: string
  label: MetaActionLabel
  /** Provider-written detail, shown only when two rows would otherwise read the same. */
  subtitle?: string
  icon: MetaActionIcon
  /** The row's own chord (with the platform command key), or null. */
  chord: ShortcutChord | null
  /** `primary` answers ↵, `secondary` answers Mod↵. */
  role: 'primary' | 'secondary' | null
  /** Whether the chord also runs from the result list with the panel closed. */
  runsFromList: boolean
  disabled: boolean
  danger: boolean
}

export interface MetaActionSection {
  key: string
  slot: MetaActionSlot
  /** Null for the primary section. */
  title: MetaActionLabel | null
  rows: MetaActionRow[]
}

export interface MetaActionModel {
  sections: MetaActionSection[]
  /** Every row, in display order. */
  rows: MetaActionRow[]
}

export interface MetaActionModelOptions {
  platform: RendererPlatform
}

/**
 * Asks the CoreBox renderer to run an action on an item, from a result-list shortcut. The
 * renderer that owns the action pipeline (`useActionPanel`) listens; the keyboard hook only knows
 * which action the key names. Same shape as the existing `corebox:flow-item` bridge.
 */
export const COREBOX_META_ACTION_EVENT = 'corebox:meta-action'

export interface CoreBoxMetaActionEventDetail {
  actionId: string
  item: TuffItem
}

/** Mod↵ — the secondary action's key. */
export const META_SECONDARY_CHORD: ShortcutChord = { code: 'Enter' }

/** A host chord that differs between macOS and the Ctrl platforms (Windows, Linux). */
interface PlatformChord {
  mac: ShortcutChord
  other: ShortcutChord
}

interface HostActionSpec {
  slot: MetaActionSlot
  /** Order inside the slot; lower first. Unknown actions sort after every host action. */
  rank: number
  label: (context: SpecContext) => MetaActionLabel
  glyph: (context: SpecContext) => MetaActionGlyph
  chord?: ShortcutChord | PlatformChord
  /** False when CoreBox already binds the chord in the result list through another path. */
  runsFromList?: boolean
}

interface SpecContext {
  item: TuffItem
  platform: RendererPlatform
}

const key = (value: string) => (): MetaActionLabel => ({ key: value })
const glyph = (value: MetaActionGlyph) => (): MetaActionGlyph => value

function revealLabel({ platform }: SpecContext): MetaActionLabel {
  if (platform === 'darwin') return { key: 'corebox.actions.revealInFinder' }
  if (platform === 'win32') return { key: 'corebox.actions.revealInExplorer' }
  return { key: 'corebox.actions.revealInFileManager' }
}

function isPinned(item: TuffItem): boolean {
  return Boolean(item.meta?.pinned?.isPinned)
}

/** CoreBox's own actions. The chords are the Raycast-aligned set (R6.1) plus the older ones. */
const BUILTIN_SPECS: Readonly<Record<string, HostActionSpec>> = {
  'reveal-in-finder': {
    slot: 'open',
    rank: 10,
    label: revealLabel,
    glyph: ({ platform }) => (platform === 'darwin' ? 'finder' : 'folder-open'),
    chord: { code: 'KeyO' }
  },
  'copy-title': {
    slot: 'copy',
    rank: 20,
    label: key('corebox.actions.copyTitle'),
    glyph: glyph('copy-name'),
    chord: { code: 'KeyC', alt: true }
  },
  'toggle-pin': {
    slot: 'organize',
    rank: 10,
    label: ({ item }) => ({
      key: isPinned(item) ? 'corebox.actions.unpin' : 'corebox.actions.pin'
    }),
    glyph: ({ item }) => (isPinned(item) ? 'unpin' : 'pin'),
    // ⌘. on macOS. Windows and Linux add Shift: Ctrl+. is the Chinese IMEs' punctuation-width
    // toggle (Microsoft Pinyin, Sogou, fcitx), and with one on the page never sees the key.
    chord: { mac: { code: 'Period' }, other: { code: 'Period', shift: true } }
  },
  [COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID]: {
    slot: 'flow',
    rank: 10,
    label: key('corebox.actions.translateImage'),
    glyph: glyph('translate'),
    chord: { code: 'KeyT', shift: true }
  },
  [COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID]: {
    slot: 'flow',
    rank: 11,
    label: key('corebox.actions.translateImagePin'),
    glyph: glyph('translate-pin'),
    chord: { code: 'KeyT', alt: true }
  },
  'flow-transfer': {
    slot: 'flow',
    rank: 20,
    label: key('corebox.actions.flowTransfer'),
    glyph: glyph('flow'),
    chord: { code: 'KeyD', shift: true },
    // Mod⇧D already opens Flow from the result list (`useKeyboard` → `corebox:flow-item`).
    runsFromList: false
  }
}

/**
 * Actions CoreBox's own providers attach to their items, by id. Their labels are written in
 * English (or Chinese) in the main process; the panel shows them in the interface language.
 * Plugin items never go through this table: a plugin's label is shown as the plugin wrote it.
 */
const PROVIDER_ACTION_SPECS: Readonly<Record<string, HostActionSpec>> = {
  // Primary actions. They are merged into the primary row when the request carries one.
  'open-file': {
    slot: 'open',
    rank: 5,
    label: key('corebox.actions.open'),
    glyph: glyph('external')
  },
  'open-app': { slot: 'open', rank: 5, label: key('corebox.actions.open'), glyph: glyph('play') },
  'open-url': {
    slot: 'open',
    rank: 5,
    label: key('corebox.actions.open'),
    glyph: glyph('external')
  },
  open: { slot: 'open', rank: 5, label: key('corebox.actions.open'), glyph: glyph('external') },
  paste: { slot: 'open', rank: 5, label: key('corebox.actions.paste'), glyph: glyph('paste') },
  'preview-copy-primary': {
    slot: 'copy',
    rank: 5,
    label: key('corebox.actions.copyResult'),
    glyph: glyph('copy')
  },
  'open-folder': {
    slot: 'open',
    rank: 20,
    label: key('corebox.actions.openFolder'),
    glyph: glyph('folder')
  },
  'file-copy-path': {
    slot: 'copy',
    rank: 10,
    label: key('corebox.actions.copyPath'),
    glyph: glyph('copy-path'),
    chord: { code: 'KeyC', shift: true }
  },
  copy: { slot: 'copy', rank: 10, label: key('corebox.actions.copy'), glyph: glyph('copy') },
  'copy-url': {
    slot: 'copy',
    rank: 10,
    label: key('corebox.actions.copyLink'),
    glyph: glyph('copy-link')
  },
  'file-copy-shell-path': {
    slot: 'copy',
    rank: 30,
    label: key('corebox.actions.copyShellPath'),
    glyph: glyph('terminal')
  },
  'file-copy-url': {
    slot: 'copy',
    rank: 31,
    label: key('corebox.actions.copyFileUrl'),
    glyph: glyph('copy-link')
  },
  'file-copy-windows-path': {
    slot: 'copy',
    rank: 32,
    label: key('corebox.actions.copyWindowsPath'),
    glyph: glyph('copy-path')
  },
  'file-copy-wsl-path': {
    slot: 'copy',
    rank: 33,
    label: key('corebox.actions.copyWslPath'),
    glyph: glyph('copy-path')
  }
}

/** Provider actions that are the item's primary action without saying so. */
const PRIMARY_ALIAS_IDS = new Set(['preview-copy-primary'])

type ActionType = TuffAction['type']

const TYPE_SLOTS: Readonly<Record<ActionType, MetaActionSlot>> = {
  execute: 'open',
  open: 'open',
  navigate: 'open',
  preview: 'open',
  custom: 'open',
  copy: 'copy',
  edit: 'organize',
  delete: 'organize',
  share: 'flow'
}

const TYPE_GLYPHS: Readonly<Record<ActionType, MetaActionGlyph>> = {
  execute: 'play',
  open: 'external',
  navigate: 'navigate',
  preview: 'preview',
  custom: 'play',
  copy: 'copy',
  edit: 'edit',
  delete: 'delete',
  share: 'share'
}

const TYPE_LABEL_KEYS: Readonly<Record<ActionType, string>> = {
  execute: 'corebox.actions.execute',
  open: 'corebox.actions.open',
  navigate: 'corebox.actions.navigate',
  preview: 'corebox.actions.preview',
  custom: 'corebox.actions.execute',
  copy: 'corebox.actions.copy',
  edit: 'corebox.actions.edit',
  delete: 'corebox.actions.delete',
  share: 'corebox.actions.share'
}

const SLOT_TITLE_KEYS: Readonly<Record<Exclude<MetaActionSlot, 'primary'>, string>> = {
  open: 'corebox.actions.groups.open',
  copy: 'corebox.actions.groups.copy',
  organize: 'corebox.actions.groups.organize',
  flow: 'corebox.actions.groups.flow',
  plugin: 'corebox.actions.groups.plugin'
}

/**
 * Chords a declared (provider or plugin) shortcut may never take. Text editing stays with the
 * CoreBox input and the panel's filter field (so ⌘C copies text), CoreBox's own commands keep
 * their keys (⌘K, ⌘D, ⌘1–0, ⌘←/→, ⌘R), and the app menu's roles keep theirs.
 */
const RESERVED_CHORDS: readonly ShortcutChord[] = [
  { code: 'KeyA' },
  { code: 'KeyC' },
  { code: 'KeyV' },
  { code: 'KeyX' },
  { code: 'KeyZ' },
  { code: 'KeyZ', shift: true },
  { code: 'KeyY' },
  { code: 'Backspace' },
  { code: 'Delete' },
  { code: 'KeyK' },
  { code: 'KeyD' },
  { code: 'KeyR' },
  { code: 'KeyR', shift: true },
  { code: 'ArrowLeft' },
  { code: 'ArrowRight' },
  { code: 'ArrowUp' },
  { code: 'ArrowDown' },
  META_SECONDARY_CHORD,
  ...Array.from({ length: 10 }, (_, digit) => ({ code: `Digit${digit}` })),
  { code: 'KeyQ' },
  { code: 'KeyW' },
  { code: 'KeyH' },
  { code: 'KeyH', alt: true },
  { code: 'KeyM' },
  { code: 'KeyI', alt: true },
  { code: 'KeyV', shift: true, alt: true },
  { code: 'Equal' },
  { code: 'Minus' }
]

/** Every chord a host action owns, on any platform. A declared shortcut cannot take one, even on an
 * item that lacks that host action: one key should not mean different things from one item — or
 * one platform — to the next. */
export const HOST_ACTION_CHORDS: readonly ShortcutChord[] = [
  ...Object.values(BUILTIN_SPECS),
  ...Object.values(PROVIDER_ACTION_SPECS)
].flatMap(({ chord }) => {
  if (!chord) return []
  return 'code' in chord ? [chord] : [chord.mac, chord.other]
})

/** The chord a host action binds on this platform. The command key itself (⌘ or Ctrl) is the
 * matcher's business; this only picks a variant for a chord that differs off macOS. */
function resolveHostChord(
  spec: HostActionSpec | undefined,
  platform: RendererPlatform
): ShortcutChord | null {
  const chord = spec?.chord
  if (!chord) return null
  if ('code' in chord) return chord
  return platform === 'darwin' ? chord.mac : chord.other
}

/** Chords a declared shortcut cannot use: reserved keys plus every host action's chord. */
export function isChordTakenByHost(chord: ShortcutChord): boolean {
  return [...RESERVED_CHORDS, ...HOST_ACTION_CHORDS].some((taken) =>
    isSameShortcutChord(taken, chord)
  )
}

// ============================================================================
// Request building (CoreBox renderer)
// ============================================================================

function resolveRevealPath(item: TuffItem): string {
  return item.meta?.app?.path || item.meta?.file?.path || ''
}

/**
 * An absolute filesystem path the file manager can reveal: POSIX `/…`, a Windows drive (`C:\…`,
 * `C:/…`) or a UNC share (`\\server\…`). A Windows Store app's `shell:AppsFolder\…` id is not one:
 * the reveal would always fail, and it would still be offered, badged and bound to Mod↵.
 */
function isRevealablePath(path: string): boolean {
  return /^(?:[a-z]:[\\/]|[\\/])/i.test(path)
}

/**
 * CoreBox's own actions for an item. Each one is only offered where it can do something: a reveal
 * needs a path, a copy needs a title, a translation needs an image.
 */
export function generateBuiltinActions(item: TuffItem): MetaAction[] {
  const builtin = (id: string, title: string, slot: MetaActionSlot): MetaAction => ({
    id,
    // The overlay resolves the shown label from the id; this title only names the action in logs.
    render: { basic: { title }, group: slot },
    handler: 'builtin',
    priority: 0
  })

  const actions: MetaAction[] = [
    { ...builtin(COREBOX_PRIMARY_ACTION_ID, 'Primary action', 'primary'), priority: 1000 }
  ]
  if ((item.kind === 'app' || item.kind === 'file') && isRevealablePath(resolveRevealPath(item))) {
    actions.push(builtin('reveal-in-finder', 'Reveal in file manager', 'open'))
  }
  if (item.render?.basic?.title) {
    actions.push(builtin('copy-title', 'Copy name', 'copy'))
  }
  actions.push(builtin('toggle-pin', isPinned(item) ? 'Unpin' : 'Pin', 'organize'))
  if (item.kind === 'image') {
    actions.push(builtin(COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID, 'Translate image', 'flow'))
    actions.push(builtin(COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID, 'Translate and pin', 'flow'))
  }
  actions.push(builtin('flow-transfer', 'Transfer to plugin', 'flow'))
  return actions
}

type TuffActionLike = TuffAction & { title?: string; subtitle?: string }

/** The item's own actions, as the request carries them. The raw action stays on `item.actions`. */
export function toItemMetaActions(item: TuffItem): MetaAction[] {
  return (item.actions ?? [])
    .filter((action): action is TuffActionLike => typeof action?.id === 'string' && !!action.id)
    .map((action) => ({
      id: action.id,
      render: {
        basic: {
          title: action.label || action.title || action.id,
          subtitle: action.description || action.subtitle,
          icon: action.icon
        },
        shortcut: action.shortcut,
        group: action.group
      },
      handler: 'item',
      priority: 50
    }))
}

export function buildMetaShowRequest(item: TuffItem): MetaShowRequest {
  return {
    item,
    builtinActions: generateBuiltinActions(item),
    itemActions: toItemMetaActions(item)
  }
}

// ============================================================================
// Model building (both renderers)
// ============================================================================

interface Candidate {
  row: MetaActionRow
  sectionTitle: MetaActionLabel | null
  rank: number
  order: number
}

function slotIndex(slot: MetaActionSlot): number {
  return META_ACTION_SLOTS.indexOf(slot)
}

function isPrimaryClaim(action: MetaAction, raw: TuffActionLike | undefined): boolean {
  if (raw?.primary === true || PRIMARY_ALIAS_IDS.has(action.id)) return true
  return parseShortcutString(raw?.shortcut ?? action.render.shortcut)?.kind === 'enter'
}

/** A declared shortcut, unless it collides with a key CoreBox keeps for itself. */
function resolveDeclaredChord(shortcut: string | undefined): ShortcutChord | null {
  const parsed = parseShortcutString(shortcut)
  if (!parsed || parsed.kind !== 'chord') return null
  return isChordTakenByHost(parsed.chord) ? null : parsed.chord
}

function text(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function synthesizedPrimaryLabel(item: TuffItem): MetaActionLabel {
  const custom = text(item.meta?.footerHints?.primary?.label)
  if (custom) return { text: custom }
  if (item.source?.id === CLIPBOARD_HISTORY_SOURCE_ID) return { key: 'corebox.actions.paste' }
  if (item.kind === 'preview') return { key: 'corebox.actions.copyResult' }
  if (isPluginFooterItem(item)) return { key: 'corebox.actions.execute' }
  return { key: 'corebox.actions.open' }
}

function synthesizedPrimaryGlyph(item: TuffItem): MetaActionGlyph {
  if (item.source?.id === CLIPBOARD_HISTORY_SOURCE_ID) return 'paste'
  if (item.kind === 'preview') return 'copy'
  if (item.kind === 'app' || isPluginFooterItem(item)) return 'play'
  if (item.kind === 'file') return 'external'
  return 'enter'
}

/**
 * Label for an item action: host providers' known ids in the interface language, plugin labels
 * as written, and a type-based fallback for an action that brought no label at all.
 */
function itemActionLabel(
  action: MetaAction,
  raw: TuffActionLike | undefined,
  context: SpecContext,
  fromPlugin: boolean
): MetaActionLabel {
  if (!fromPlugin) {
    const spec = PROVIDER_ACTION_SPECS[action.id]
    if (spec) return spec.label(context)
  }
  const declared = text(raw?.label) || text(raw?.title) || text(action.render.basic.title)
  if (declared && declared !== action.id) return { text: declared }
  const typeKey = raw?.type ? TYPE_LABEL_KEYS[raw.type] : undefined
  return typeKey ? { key: typeKey } : { text: declared || action.id }
}

/**
 * Builds the panel model for a show request.
 *
 * - The synthesized primary row and the provider's own primary action (`primary: true`, a bare
 *   `Enter` shortcut, or a known alias) are one row: it runs the main list's Enter path under the
 *   provider's label — unless that label only repeats the item title, which the panel header
 *   already shows.
 * - Plugin global actions go last, and only the ones that are enabled.
 * - The secondary row (Mod↵) is the first item action, or the reveal, after the primary.
 */
export function buildMetaActionModel(
  request: Pick<MetaShowRequest, 'item' | 'builtinActions' | 'itemActions' | 'pluginActions'>,
  options: MetaActionModelOptions
): MetaActionModel {
  const { item } = request
  const context: SpecContext = { item, platform: options.platform }
  const fromPlugin = isPluginFooterItem(item)
  const rawActions = (item.actions ?? []) as TuffActionLike[]
  const findRaw = (id: string): TuffActionLike | undefined =>
    rawActions.find((action) => action?.id === id)

  const candidates: Candidate[] = []
  const seen = new Set<string>()
  let order = 0
  const push = (
    row: Omit<MetaActionRow, 'section' | 'role'>,
    rank: number,
    sectionTitle: MetaActionLabel | null,
    sectionKey: string
  ): void => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    candidates.push({
      row: { ...row, section: sectionKey, role: null },
      sectionTitle,
      rank,
      order: order++
    })
  }

  const itemActions = request.itemActions ?? []
  const hasSynthesizedPrimary = request.builtinActions.some(
    (action) => action.id === COREBOX_PRIMARY_ACTION_ID
  )
  const primaryClaim = hasSynthesizedPrimary
    ? itemActions.find((action) => isPrimaryClaim(action, findRaw(action.id)))
    : undefined

  if (hasSynthesizedPrimary) {
    let label = synthesizedPrimaryLabel(item)
    let icon: MetaActionIcon = { glyph: synthesizedPrimaryGlyph(item) }
    if (primaryClaim) {
      const raw = findRaw(primaryClaim.id)
      const claimed = itemActionLabel(primaryClaim, raw, context, fromPlugin)
      const title = text(item.render?.basic?.title)
      if (!('text' in claimed && claimed.text === title)) label = claimed
      const spec = fromPlugin ? undefined : PROVIDER_ACTION_SPECS[primaryClaim.id]
      if (spec) icon = { glyph: spec.glyph(context) }
      else if (fromPlugin && primaryClaim.render.basic.icon) {
        icon = { icon: primaryClaim.render.basic.icon }
      }
      seen.add(primaryClaim.id)
    }
    push(
      {
        id: COREBOX_PRIMARY_ACTION_ID,
        origin: 'builtin',
        slot: 'primary',
        label,
        icon,
        chord: null,
        runsFromList: false,
        disabled: false,
        danger: false
      },
      0,
      null,
      'primary'
    )
  }

  for (const action of itemActions) {
    const raw = findRaw(action.id)
    const spec = fromPlugin ? undefined : PROVIDER_ACTION_SPECS[action.id]
    const type = raw?.type
    const slot = spec?.slot ?? (type ? TYPE_SLOTS[type] : undefined) ?? 'open'
    const group = text(raw?.group ?? action.render.group)
    const sectionKey = group ? `group:${slot}:${group}` : slot
    const ownIcon = fromPlugin ? (raw?.icon ?? action.render.basic.icon) : undefined
    push(
      {
        id: action.id,
        origin: 'item',
        slot,
        label: itemActionLabel(action, raw, context, fromPlugin),
        subtitle: text(raw?.description ?? action.render.basic.subtitle) || undefined,
        icon: ownIcon
          ? { icon: ownIcon }
          : { glyph: spec?.glyph(context) ?? ((type && TYPE_GLYPHS[type]) || 'play') },
        chord:
          resolveHostChord(spec, context.platform) ??
          resolveDeclaredChord(raw?.shortcut ?? action.render.shortcut),
        runsFromList: true,
        disabled: action.render.disabled === true,
        danger: action.render.danger === true
      },
      spec?.rank ?? 50,
      group ? { text: group } : null,
      sectionKey
    )
  }

  for (const action of request.builtinActions) {
    if (action.id === COREBOX_PRIMARY_ACTION_ID) continue
    const spec = BUILTIN_SPECS[action.id]
    const declaredSlot = action.render.group as MetaActionSlot | undefined
    const slot =
      spec?.slot ??
      (declaredSlot && declaredSlot !== 'primary' && META_ACTION_SLOTS.includes(declaredSlot)
        ? declaredSlot
        : 'open')
    push(
      {
        id: action.id,
        origin: 'builtin',
        slot,
        label: spec ? spec.label(context) : { text: action.render.basic.title },
        icon: spec
          ? { glyph: spec.glyph(context) }
          : action.render.basic.icon
            ? { icon: action.render.basic.icon }
            : { glyph: 'play' },
        chord: spec
          ? resolveHostChord(spec, context.platform)
          : resolveDeclaredChord(action.render.shortcut),
        runsFromList: spec?.runsFromList ?? true,
        disabled: action.render.disabled === true,
        danger: action.render.danger === true
      },
      spec?.rank ?? 50,
      null,
      slot
    )
  }

  const pluginActions = [...(request.pluginActions ?? [])]
    .map((action, index) => ({ action, index }))
    // Global actions carry no applicability of their own yet; a disabled one does not apply.
    .filter(({ action }) => action.render?.disabled !== true)
    .sort((a, b) => (b.action.priority ?? 0) - (a.action.priority ?? 0) || a.index - b.index)
  for (const { action } of pluginActions) {
    push(
      {
        id: action.id,
        origin: 'plugin',
        slot: 'plugin',
        label: { text: action.render.basic.title },
        subtitle: text(action.render.basic.subtitle) || undefined,
        icon: action.render.basic.icon ? { icon: action.render.basic.icon } : { glyph: 'plugin' },
        chord: resolveDeclaredChord(action.render.shortcut),
        runsFromList: false,
        disabled: false,
        danger: action.render.danger === true
      },
      50,
      null,
      'plugin'
    )
  }

  // A declared chord goes to its first declarer — item actions before plugin ones — and never to
  // one a host action holds: a badge must not teach a key that runs another row.
  const claimed: ShortcutChord[] = candidates.flatMap((candidate) =>
    candidate.row.origin === 'builtin' && candidate.row.chord ? [candidate.row.chord] : []
  )
  for (const candidate of candidates) {
    const { row } = candidate
    if (row.origin === 'builtin' || !row.chord) continue
    if (claimed.some((taken) => isSameShortcutChord(taken, row.chord!))) row.chord = null
    else claimed.push(row.chord)
  }

  // Sections keep first-appearance order inside a slot, the slot's own section first.
  const sectionOrder = new Map<string, number>()
  for (const candidate of candidates) {
    if (!sectionOrder.has(candidate.row.section)) {
      const isOwn = candidate.row.section === candidate.row.slot
      sectionOrder.set(candidate.row.section, isOwn ? -1 : sectionOrder.size)
    }
  }
  candidates.sort(
    (a, b) =>
      slotIndex(a.row.slot) - slotIndex(b.row.slot) ||
      sectionOrder.get(a.row.section)! - sectionOrder.get(b.row.section)! ||
      a.rank - b.rank ||
      a.order - b.order
  )

  const sections: MetaActionSection[] = []
  for (const candidate of candidates) {
    let section = sections.at(-1)
    if (!section || section.key !== candidate.row.section) {
      const title: MetaActionLabel | null =
        candidate.row.slot === 'primary'
          ? null
          : (candidate.sectionTitle ?? { key: SLOT_TITLE_KEYS[candidate.row.slot] })
      section = { key: candidate.row.section, slot: candidate.row.slot, title, rows: [] }
      sections.push(section)
    }
    section.rows.push(candidate.row)
  }

  const rows = sections.flatMap((section) => section.rows)
  const primary = rows.find((row) => row.id === COREBOX_PRIMARY_ACTION_ID)
  if (primary) primary.role = 'primary'
  const secondary = rows.find(
    (row) =>
      row.role === null &&
      !row.disabled &&
      ((row.origin === 'item' && row.section === row.slot) || row.id === 'reveal-in-finder')
  )
  if (secondary) secondary.role = 'secondary'

  return { sections, rows }
}

// ============================================================================
// Keys
// ============================================================================

/** An IME is composing: its arrows and Enter pick candidates, not actions. */
export function isImeComposing(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return event.isComposing === true || event.keyCode === 229
}

type ShortcutEvent = ShortcutChordEvent & { getModifierState?: (key: string) => boolean }

/**
 * The row a key runs, or null when the key names nothing that applies to this item — in which
 * case the caller must leave the event alone.
 *
 * `list` is the result list with the panel closed: plugin rows need main to reach the plugin, so
 * only the panel runs them, and a row CoreBox already binds elsewhere is left to that binding.
 */
export function resolveMetaActionShortcut(
  model: MetaActionModel,
  event: ShortcutEvent,
  options: { isMac: boolean; scope: 'panel' | 'list' }
): MetaActionRow | null {
  // AltGr is Ctrl+Alt on Windows; on many layouts it types a character, never a command.
  if (event.getModifierState?.('AltGraph')) return null

  if (shortcutChordMatches(event, META_SECONDARY_CHORD, options.isMac)) {
    return model.rows.find((row) => row.role === 'secondary' && !row.disabled) ?? null
  }

  return (
    model.rows.find(
      (row) =>
        row.chord !== null &&
        !row.disabled &&
        (options.scope === 'panel' || row.runsFromList) &&
        shortcutChordMatches(event, row.chord, options.isMac)
    ) ?? null
  )
}

/** Badge texts for a row: ↵ on the primary, Mod↵ on the secondary, then its own chord. */
export function metaActionShortcutLabels(row: MetaActionRow, isMac: boolean): string[] {
  const labels: string[] = []
  if (row.role === 'primary') labels.push('↵')
  if (row.role === 'secondary') labels.push(shortcutChordLabel(META_SECONDARY_CHORD, isMac))
  if (row.chord) labels.push(shortcutChordLabel(row.chord, isMac))
  return labels
}

// ============================================================================
// Geometry
// ============================================================================

/** Natural panel height for this model; plugin rows main adds later are not counted. */
export function estimateMetaActionPanelHeight(model: MetaActionModel): number {
  return estimateMetaPanelHeight({
    rows: model.rows.length,
    sections: model.sections.length,
    titledSections: model.sections.filter((section) => section.title !== null).length
  })
}
