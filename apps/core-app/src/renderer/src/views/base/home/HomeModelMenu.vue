<script lang="ts">
/**
 * The one model menu the two pills may hold open between them. Pointer flows keep it on their own
 * (the anchor's outside-click closes the other copy on pointerdown), but a keyboard activation of the
 * other pill fires no pointerdown, so the newly opening copy closes the previous one through this
 * hand-off.
 */
let closeActiveModelMenu: (() => void) | null = null
</script>

<script lang="ts" name="HomeModelMenu" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { IntelligenceReasoningLevel } from '@talex-touch/utils/intelligence/reasoning-effort'
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import {
  normalizeReasoningEffortSetting,
  REASONING_EFFORT_SETTINGS
} from '@talex-touch/utils/intelligence/reasoning-effort'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHomeModelScope } from '~/modules/conversation/home-model-scope'
import { matchesModelQuery, sameModelRef } from '~/modules/conversation/model-display'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { useRecentModels } from '~/modules/conversation/useRecentModels'
import { modelFamilyIconFor } from '~/modules/intelligence/model-family-icons'
import { providerIconForId } from '~/modules/intelligence/provider-icons'
import { focusWhenShown } from './focus-when-shown'

/**
 * The model popover behind both model pills (`home-composer` › 模型弹层): a search field and the
 * settings key on top, two columns in the middle — where the models come from on the left, the
 * models themselves on the right — and the reasoning effort pinned at the bottom. Only the columns
 * scroll, so the search field and the effort row are always whole.
 *
 * Each caller hands its pill in through the `trigger` slot; this control owns the rest. The left
 * column is a vertical tablist (a source selects what the right column lists, selection following
 * focus); 「自动选择」 above it is an action, not a source. The right column is a listbox.
 */
const props = withDefaults(defineProps<{ placement?: 'bottom-start' | 'top-end' }>(), {
  placement: 'bottom-start'
})

const { t } = useI18n()
const router = useRouter()
const { choices, loaded, ensureLoaded } = useModelOptions()
/**
 * Whose choice the rows and the effort strip edit: the open conversation's own settings when Main
 * holds it, the global default on a blank Home (`home-model-scope`).
 */
const { select, isSelected, resolvedChoice, effortSetting, effortRow, selectEffort } =
  useHomeModelScope()
const { recents, record } = useRecentModels()
/**
 * Routing is automatic. Not before the first list lands: until then a pinned model reads as
 * unresolved, and the check would claim 「自动选择」 for a conversation that has a model.
 */
const autoSelected = computed(() => loaded.value && !resolvedChoice.value)
/** Both pills keep their panel mounted, so the list's id has to be this instance's own. */
const listId = `home-model-list-${useId()}`

/** The left column's 「最近使用」 entry; every other entry is a `source:` key. */
const RECENT = 'recent'

/** `\u0000` joins the halves: a provider id may hold the `/` or `:` that would let two keys collide. */
function sourceKeyOf(choice: Pick<ModelChoice, 'providerId' | 'source'>): string {
  return `source:${choice.providerId}\u0000${choice.source ?? ''}`
}

/** `OMP (local CLI)` → `OMP`: the tag beside a row has no room for the qualifier. */
function shortProviderName(name: string): string {
  return name.replace(/\s*[（(][^（()）]*[)）]\s*$/, '') || name
}

interface SourceEntry {
  kind: 'source'
  key: string
  providerId: string
  channel: string | null
  /** What the left column prints: the channel under its service, or the service itself. */
  label: string
  /** `OMP · codex` / `Ollama`: the row tag in 「最近使用」. */
  tag: string
  /** `OMP (local CLI) · codex`: the group heading over search results, and the entry's title. */
  heading: string
  icon: ITuffIcon | null
  indent: boolean
  count: number
}

interface GroupEntry {
  kind: 'group'
  key: string
  label: string
  /** The service's full name, where the label is the short one. */
  title: string
  icon: ITuffIcon
}

type RailEntry = SourceEntry | GroupEntry

/**
 * The left column, in the order the options arrived. A service whose ids carry a channel prefix
 * (`codex/gpt-6-astra`) shows a heading with its channels indented under it; a service without one
 * is a single entry. Derived from the rows, so a source never opens on nothing.
 */
const rail = computed<RailEntry[]>(() => {
  const providers = new Map<
    string,
    { name: string; type: string; channels: Map<string | null, number> }
  >()
  for (const choice of choices.value) {
    let provider = providers.get(choice.providerId)
    if (!provider) {
      provider = { name: choice.providerName, type: choice.providerType, channels: new Map() }
      providers.set(choice.providerId, provider)
    }
    provider.channels.set(choice.source, (provider.channels.get(choice.source) ?? 0) + 1)
  }
  const shortCounts = new Map<string, number>()
  for (const provider of providers.values()) {
    const short = shortProviderName(provider.name)
    shortCounts.set(short, (shortCounts.get(short) ?? 0) + 1)
  }
  const entries: RailEntry[] = []
  for (const [providerId, provider] of providers) {
    const icon = providerIconForId(providerId, provider.type)
    const short = shortProviderName(provider.name)
    // The column is narrow: `Claude Code (local CLI)` prints as `Claude Code` — unless another
    // service would then print the same name. The full name stays in the title and the headings.
    const name = shortCounts.get(short) === 1 ? short : provider.name
    const channelled = [...provider.channels.keys()].some((channel) => channel !== null)
    if (channelled) {
      entries.push({
        kind: 'group',
        key: `group:${providerId}`,
        label: name,
        title: provider.name,
        icon
      })
    }
    for (const [channel, count] of provider.channels) {
      entries.push({
        kind: 'source',
        key: sourceKeyOf({ providerId, source: channel }),
        providerId,
        channel,
        label: channel ?? name,
        tag: channel ? `${short} · ${channel}` : short,
        heading: channel ? `${provider.name} · ${channel}` : provider.name,
        icon: channelled ? null : icon,
        indent: channelled,
        count
      })
    }
  }
  return entries
})

const sources = computed(() =>
  rail.value.filter((entry): entry is SourceEntry => entry.kind === 'source')
)

function sourceOf(choice: ModelChoice): SourceEntry | undefined {
  const key = sourceKeyOf(choice)
  return sources.value.find((entry) => entry.key === key)
}

/** 「最近使用」 resolved against what is on offer now; a pick whose provider is gone waits in storage. */
const recentChoices = computed<ModelChoice[]>(() =>
  recents.value
    .map((ref) => choices.value.find((choice) => sameModelRef(choice, ref)))
    .filter((choice): choice is ModelChoice => choice !== undefined)
)

const open = ref(false)
const query = ref('')
const activeRail = ref<string>(RECENT)
/** Set by a choice in the left column; until then the selection follows the data as it loads. */
let railPinned = false
/**
 * The user has moved within this opening — a wheel, a pointer, a key. Options landing after that
 * re-derive the selection but no longer scroll the columns under them.
 */
let handsOn = false
/** The left column's selection when a search started, put back when it clears. */
let railBeforeQuery: string | null = null

const triggerWrapRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
/**
 * Focus goes back to the pill only when the menu closed from the keyboard or a choice — an outside
 * click moved focus somewhere deliberate, and yanking it back would fight the user.
 */
let restoreFocusOnClose = false

const trimmedQuery = computed(() => query.value.trim())
const searching = computed(() => trimmedQuery.value.length > 0)

/** Where the column opens: the pinned model's source, else 「最近使用」 when it has rows, else the first source. */
function defaultRail(): string {
  const resolved = resolvedChoice.value
  const pinned = resolved ? sourceOf(resolved) : undefined
  if (pinned) return pinned.key
  if (recentChoices.value.length) return RECENT
  return sources.value[0]?.key ?? RECENT
}

/** The selection, unless it names a source that has since gone; then the default. */
const effectiveRail = computed(() => {
  const key = activeRail.value
  if (key === RECENT) return key
  return sources.value.some((entry) => entry.key === key) ? key : defaultRail()
})

interface ListGroup {
  key: string
  /** Shown over the group only while searching across sources. */
  heading: string | null
  rows: { choice: ModelChoice; tag: string | null }[]
}

/** What the right column lists: the search across every source, 「最近使用」, or one source's models. */
const listGroups = computed<ListGroup[]>(() => {
  if (searching.value) {
    const needle = trimmedQuery.value
    const groups = new Map<string, ListGroup>()
    for (const choice of choices.value) {
      if (!matchesModelQuery(choice, needle)) continue
      const source = sourceOf(choice)
      const key = source?.key ?? sourceKeyOf(choice)
      let group = groups.get(key)
      if (!group) {
        group = { key, heading: source?.heading ?? choice.providerName, rows: [] }
        groups.set(key, group)
      }
      group.rows.push({ choice, tag: null })
    }
    return [...groups.values()]
  }
  if (effectiveRail.value === RECENT) {
    return [
      {
        key: RECENT,
        heading: null,
        rows: recentChoices.value.map((choice) => ({
          choice,
          tag: sourceOf(choice)?.tag ?? shortProviderName(choice.providerName)
        }))
      }
    ]
  }
  const key = effectiveRail.value
  return [
    {
      key,
      heading: null,
      rows: choices.value
        .filter((choice) => sourceKeyOf(choice) === key)
        .map((choice) => ({ choice, tag: null }))
    }
  ]
})

const visibleRows = computed(() => listGroups.value.flatMap((group) => group.rows))

/** The line shown instead of rows, or `null` when there are rows. Gated on `loaded`, never `loading`. */
const listHint = computed<string | null>(() => {
  if (!loaded.value || !choices.value.length || visibleRows.value.length) return null
  if (searching.value) return t('home.modelNoResults')
  return effectiveRail.value === RECENT ? t('home.modelRecentEmpty') : t('home.modelNoResults')
})

/** A row shows what the model is: the family's brand mark, the provider's icon when it names none. */
function rowIcon(choice: ModelChoice): ITuffIcon {
  return (
    modelFamilyIconFor(choice.model) ?? providerIconForId(choice.providerId, choice.providerType)
  )
}

/**
 * The effort row: 自动 · 低 · 中 · 高 · 极高, the scope's one choice shown against the model the next
 * send pins. A model that lacks a level rounds to its nearest and the note says to which; the whole
 * row goes inert, with its reason, on a route that takes none.
 */
const effortChips = computed<FilterChipItem[]>(() =>
  REASONING_EFFORT_SETTINGS.map((value) => ({
    value,
    label: value === 'auto' ? t('home.reasoning.auto') : t(reasoningLevelLabelKey(value))
  }))
)

function pickEffort(value: string | number): void {
  selectEffort(normalizeReasoningEffortSetting(value))
}

function levelLabel(level: IntelligenceReasoningLevel): string {
  return t(reasoningLevelLabelKey(level))
}

const effortNote = computed<string | null>(() => {
  const note = effortRow.value.note
  if (!note) return null
  switch (note.kind) {
    case 'unsupported-model':
      return t('home.reasoning.unsupportedModel')
    case 'unsupported-provider':
      return t('home.reasoning.unsupportedProvider')
    case 'clamped':
      return t('home.reasoning.clamped', {
        requested: levelLabel(note.requested),
        applied: levelLabel(note.applied)
      })
    case 'auto-route':
      return t('home.reasoning.autoRoute')
    case 'cloud':
      return t('home.reasoning.cloud')
    default:
      return null
  }
})

function close(): void {
  restoreFocusOnClose = true
  open.value = false
}

function choose(choice: ModelChoice | null): void {
  select(choice)
  if (choice) record(choice)
  close()
}

function openSettings(): void {
  open.value = false
  void router.push('/setting/intelligence/channels')
}

function pickRail(key: string): void {
  railPinned = true
  activeRail.value = key
}

// ---------------------------------------------------------------------------------------------
// Keyboard: the search field hands ↓ to the list; ←/→ cross between the columns; each column
// moves its own roving focus with ↑/↓/Home/End. Enter on a model picks it; the anchor owns Escape.
// ---------------------------------------------------------------------------------------------

function columnItems(column: 'rail' | 'list'): HTMLElement[] {
  const selector = column === 'rail' ? '[data-home-model-rail-item]' : '[data-home-model-option]'
  return Array.from(panelRef.value?.querySelectorAll<HTMLElement>(selector) ?? [])
}

function focusColumn(column: 'rail' | 'list', which: 'current' | 'first' = 'current'): void {
  const items = columnItems(column)
  if (!items.length) return
  const current =
    which === 'current'
      ? items.find((item) => item.getAttribute('aria-selected') === 'true')
      : undefined
  const target = current ?? items[0]
  target?.focus()
  target?.scrollIntoView({ block: 'nearest' })
}

function moveWithin(
  column: 'rail' | 'list',
  from: HTMLElement,
  step: number | 'start' | 'end'
): void {
  const items = columnItems(column)
  if (!items.length) return
  const index = items.indexOf(from)
  const next =
    step === 'start'
      ? items[0]
      : step === 'end'
        ? items.at(-1)
        : items[Math.min(items.length - 1, Math.max(0, index + step))]
  if (!next) return
  next.focus()
  next.scrollIntoView({ block: 'nearest' })
  // Selection follows focus in the left column: the right column shows what is focused.
  if (column === 'rail') next.click()
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown') return
  event.preventDefault()
  focusColumn('list', 'first')
}

function onRailKeydown(event: KeyboardEvent): void {
  const from = event.target as HTMLElement
  const steps: Record<string, number | 'start' | 'end'> = {
    ArrowDown: 1,
    ArrowUp: -1,
    Home: 'start',
    End: 'end'
  }
  if (event.key in steps) {
    event.preventDefault()
    moveWithin('rail', from, steps[event.key]!)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusColumn('list')
  }
}

function onListKeydown(event: KeyboardEvent): void {
  const from = event.target as HTMLElement
  const steps: Record<string, number | 'start' | 'end'> = {
    ArrowDown: 1,
    ArrowUp: -1,
    Home: 'start',
    End: 'end'
  }
  if (event.key in steps) {
    event.preventDefault()
    moveWithin('list', from, steps[event.key]!)
  } else if (event.key === 'ArrowLeft' && !searching.value) {
    event.preventDefault()
    focusColumn('rail')
  }
}

/** The anchor closes on Escape by itself; this only marks that focus should return to the pill. */
function onPanelKeydown(event: KeyboardEvent): void {
  handsOn = true
  if (event.key === 'Escape') restoreFocusOnClose = true
}

function markHandsOn(): void {
  handsOn = true
}

/** Roving tabindex: the selected row, or the first one when none is selected, takes Tab. */
function listTabIndex(choice: ModelChoice): 0 | -1 {
  const selectedVisible = visibleRows.value.some((row) => isSelected(row.choice))
  if (selectedVisible) return isSelected(choice) ? 0 : -1
  return visibleRows.value[0]?.choice === choice ? 0 : -1
}

/** Bumped on every opening and closing: a retry from an earlier opening stops at its next frame. */
let focusRun = 0

function searchInput(): HTMLInputElement | null {
  return panelRef.value?.querySelector('.HomeModelMenu-Search input') ?? null
}

/** The pinned source and model, scrolled into view where they are not already. */
function revealPinned(): void {
  const panel = panelRef.value
  if (!panel) return
  panel
    .querySelector<HTMLElement>('[data-home-model-rail-item][aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest' })
  panel
    .querySelector<HTMLElement>('[data-home-model-option][aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest' })
}

/**
 * Both columns start each opening at their top — the panel stays mounted between openings and
 * would otherwise come back scrolled the way the last one left it, 「自动选择」 out of sight — and
 * then the pinned source and model scroll into view.
 */
function revealSelection(): void {
  const panel = panelRef.value
  if (!panel) return
  for (const column of panel.querySelectorAll<HTMLElement>(
    '.HomeModelMenu-Rail, .HomeModelMenu-List'
  )) {
    column.scrollTop = 0
  }
  revealPinned()
}

function focusSearchWhenShown(): void {
  const run = ++focusRun
  focusWhenShown(searchInput, () => run === focusRun && open.value, revealSelection)
}

function closeSelf(): void {
  open.value = false
}

watch(searching, (isSearching) => {
  if (isSearching) {
    railBeforeQuery = activeRail.value
    return
  }
  if (railBeforeQuery !== null) activeRail.value = railBeforeQuery
  railBeforeQuery = null
})

watch(open, (isOpen) => {
  if (isOpen) {
    if (closeActiveModelMenu !== null && closeActiveModelMenu !== closeSelf) closeActiveModelMenu()
    closeActiveModelMenu = closeSelf
    restoreFocusOnClose = false
    // A fresh look each time: the search is a one-off, and the column follows what is pinned now.
    query.value = ''
    railBeforeQuery = null
    railPinned = false
    handsOn = false
    activeRail.value = defaultRail()
    // Fetched again on every open: providers come and go while the app runs (a CLI installed after
    // launch, one enabled in settings). The rows already on screen stay while the refetch runs.
    void ensureLoaded({ refresh: true })
    focusSearchWhenShown()
    return
  }
  focusRun++
  if (closeActiveModelMenu === closeSelf) closeActiveModelMenu = null
  if (restoreFocusOnClose) {
    void nextTick(() => triggerWrapRef.value?.querySelector('button')?.focus())
  }
})

/**
 * Options that land after the panel opened — the first load, a refresh that reorders the sources —
 * re-derive the default, unless a click pinned one, and bring it into view as the opening did.
 */
watch(choices, () => {
  if (!open.value || railPinned || searching.value) return
  activeRail.value = defaultRail()
  if (!handsOn) void nextTick(revealPinned)
})

onBeforeUnmount(() => {
  focusRun++
  if (closeActiveModelMenu === closeSelf) closeActiveModelMenu = null
})
</script>

<template>
  <TxPopover
    v-model="open"
    :placement="props.placement"
    :min-width="0"
    :max-width="520"
    :max-height="560"
    :match-reference-width="false"
    :panel-radius="12"
    :panel-padding="0"
    panel-background="pure"
  >
    <template #reference>
      <!-- display: contents — the wrapper exists only so closing can find the pill to refocus. -->
      <span ref="triggerWrapRef" class="HomeModelMenu-TriggerWrap">
        <slot name="trigger" :open="open" />
      </span>
    </template>

    <div
      ref="panelRef"
      class="HomeModelMenu"
      role="group"
      :aria-label="t('home.model')"
      @keydown="onPanelKeydown"
      @pointerdown="markHandsOn"
      @wheel.passive="markHandsOn"
    >
      <div class="HomeModelMenu-Head">
        <div class="HomeModelMenu-Search">
          <TxSearchInput
            v-model="query"
            :placeholder="t('home.modelSearch')"
            :aria-label="t('home.modelSearch')"
            clearable
            @keydown="onSearchKeydown"
          />
        </div>
        <button
          class="HomeModelMenu-Settings"
          type="button"
          :aria-label="t('home.modelSettings')"
          :title="t('home.modelSettings')"
          @click="openSettings"
        >
          <span class="i-ri-equalizer-line" aria-hidden="true" />
        </button>
      </div>

      <div class="HomeModelMenu-Body">
        <!-- Left: 「自动选择」 (an action) above the sources (a tablist). Inert while searching:
             a search runs across every source, so none of them is selected. -->
        <div
          class="HomeModelMenu-Rail"
          :class="{ 'is-dimmed': searching }"
          :inert="searching || undefined"
        >
          <button
            class="HomeModelMenu-RailItem"
            type="button"
            :aria-pressed="autoSelected"
            @click="choose(null)"
          >
            <span class="i-ri-magic-line HomeModelMenu-RailIcon" aria-hidden="true" />
            <span class="HomeModelMenu-RailLabel">{{ t('home.modelAuto') }}</span>
            <span
              v-if="autoSelected"
              class="i-ri-check-line HomeModelMenu-RailCheck"
              aria-hidden="true"
            />
          </button>

          <div
            class="HomeModelMenu-Tabs"
            role="tablist"
            aria-orientation="vertical"
            :aria-label="t('home.modelSources')"
            @keydown="onRailKeydown"
          >
            <button
              class="HomeModelMenu-RailItem"
              :class="{ 'is-active': effectiveRail === 'recent' }"
              type="button"
              role="tab"
              data-home-model-rail-item
              :aria-selected="effectiveRail === 'recent'"
              :tabindex="effectiveRail === 'recent' ? 0 : -1"
              :aria-controls="listId"
              @click="pickRail('recent')"
            >
              <span class="i-ri-history-line HomeModelMenu-RailIcon" aria-hidden="true" />
              <span class="HomeModelMenu-RailLabel">{{ t('home.modelRecent') }}</span>
            </button>

            <div class="HomeModelMenu-RailDivider" role="presentation" />

            <template v-if="!loaded">
              <div
                v-for="row in 4"
                :key="row"
                class="HomeModelMenu-RailSkeleton"
                role="presentation"
                aria-hidden="true"
              >
                <TxSkeleton class="HomeModelMenu-SkeletonBar" :height="9" :radius="4" />
              </div>
            </template>

            <template v-else>
              <template v-for="entry in rail" :key="entry.key">
                <div
                  v-if="entry.kind === 'group'"
                  class="HomeModelMenu-RailGroup"
                  role="presentation"
                  aria-hidden="true"
                  :title="entry.title"
                >
                  <TxIcon :icon="entry.icon" :size="12" />
                  <span>{{ entry.label }}</span>
                </div>
                <!-- The title names the service too: `codex` alone is under two of them. -->
                <button
                  v-else
                  class="HomeModelMenu-RailItem"
                  :class="{ 'is-active': effectiveRail === entry.key, 'is-indented': entry.indent }"
                  type="button"
                  role="tab"
                  data-home-model-rail-item
                  :title="entry.heading"
                  :aria-selected="effectiveRail === entry.key"
                  :tabindex="effectiveRail === entry.key ? 0 : -1"
                  :aria-controls="listId"
                  @click="pickRail(entry.key)"
                >
                  <TxIcon
                    v-if="entry.icon"
                    class="HomeModelMenu-RailIcon"
                    :icon="entry.icon"
                    :size="14"
                  />
                  <span class="HomeModelMenu-RailLabel">{{ entry.label }}</span>
                  <span class="HomeModelMenu-RailCount">{{ entry.count }}</span>
                </button>
              </template>
            </template>
          </div>
        </div>

        <!-- Right: the models of the selected source, 「最近使用」, or the search across sources. -->
        <div
          :id="listId"
          class="HomeModelMenu-List"
          role="listbox"
          :aria-label="t('home.modelList')"
          :aria-busy="!loaded || undefined"
          @keydown="onListKeydown"
        >
          <template v-if="!loaded">
            <div
              v-for="row in 5"
              :key="row"
              class="HomeModelMenu-RowSkeleton"
              role="presentation"
              aria-hidden="true"
            >
              <TxSkeleton class="HomeModelMenu-SkeletonDot" :width="15" :height="15" :radius="8" />
              <TxSkeleton class="HomeModelMenu-SkeletonBar" :height="10" :radius="5" />
            </div>
          </template>

          <div v-else-if="!choices.length" class="HomeModelMenu-Empty">
            <p>{{ t('home.modelEmpty') }}</p>
            <button class="HomeModelMenu-Link" type="button" @click="openSettings">
              {{ t('home.modelOpenSettings') }}
            </button>
          </div>

          <p v-else-if="listHint" class="HomeModelMenu-Hint">{{ listHint }}</p>

          <template v-else>
            <div
              v-for="group in listGroups"
              :key="group.key"
              class="HomeModelMenu-Group"
              role="group"
              :aria-label="group.heading ?? undefined"
            >
              <div v-if="group.heading" class="HomeModelMenu-GroupHeading" aria-hidden="true">
                {{ group.heading }}
              </div>
              <button
                v-for="row in group.rows"
                :key="`${row.choice.providerId} ${row.choice.model}`"
                class="HomeModelMenu-Option"
                :class="{ 'is-selected': isSelected(row.choice) }"
                type="button"
                role="option"
                data-home-model-option
                :aria-selected="isSelected(row.choice)"
                :tabindex="listTabIndex(row.choice)"
                :title="row.choice.model"
                @click="choose(row.choice)"
              >
                <TxIcon class="HomeModelMenu-OptionIcon" :icon="rowIcon(row.choice)" :size="15" />
                <span class="HomeModelMenu-OptionLabel">{{ row.choice.displayName }}</span>
                <span v-if="row.tag" class="HomeModelMenu-Tag">{{ row.tag }}</span>
                <span
                  v-if="isSelected(row.choice)"
                  class="i-ri-check-line HomeModelMenu-Check"
                  aria-hidden="true"
                />
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Reasoning effort, pinned under the columns so it never scrolls away with a list. -->
      <div class="HomeModelMenu-Foot">
        <div class="HomeModelMenu-Effort" :class="{ 'is-disabled': effortRow.disabled }">
          <span class="HomeModelMenu-EffortLabel" aria-hidden="true">
            {{ t('home.reasoning.label') }}
          </span>
          <TxFilterChips
            class="HomeModelMenu-EffortChips"
            role="toolbar"
            :aria-label="t('home.reasoning.label')"
            :items="effortChips"
            :model-value="effortSetting"
            :disabled="effortRow.disabled"
            @update:model-value="pickEffort"
          />
        </div>
        <p v-if="effortNote" class="HomeModelMenu-EffortNote">{{ effortNote }}</p>
      </div>
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.HomeModelMenu-TriggerWrap {
  display: contents;
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
/*
 * Never taller than the room the anchor gives the panel (`--tx-ba-max-height`, less the card's
 * 1px top and bottom border): past it the card's body scrolls as a whole and carries the search
 * field off the top. Inside that height the columns give way first; the search and the effort row
 * stay whole.
 */
.HomeModelMenu {
  display: flex;
  flex-direction: column;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(var(--tx-ba-max-height, 560px) - 2px);
  color: var(--shell-text-primary);
}

.HomeModelMenu-Head {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px 6px 4px;
}

.HomeModelMenu-Search {
  flex: 1;
  min-width: 0;
}

.HomeModelMenu-Settings {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 15px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

/* The only part that scrolls: each column on its own, under a fixed height. */
/* 316px when there is room; shorter in a short window, down to about four rows. */
.HomeModelMenu-Body {
  display: flex;
  flex: 0 1 316px;
  min-height: 132px;
  border-top: 1px solid var(--shell-border);
}

.HomeModelMenu-Rail {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 1px;
  width: 168px;
  padding: 6px;
  overflow-y: auto;
  border-right: 1px solid var(--shell-border);

  &.is-dimmed {
    opacity: 0.45;
  }
}

.HomeModelMenu-Tabs {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeModelMenu-RailItem {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-sm);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }

  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
    font-weight: 600;
  }

  &.is-indented {
    padding-left: 24px;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeModelMenu-RailIcon {
  display: inline-flex;
  flex: none;
  color: var(--shell-text-secondary);
  font-size: 14px;
}

.HomeModelMenu-RailLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-RailCount {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.HomeModelMenu-RailCheck {
  flex: none;
  color: var(--shell-primary);
  font-size: 13px;
}

.HomeModelMenu-RailDivider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

/* A label, not a tab: no hover, no hit area. */
.HomeModelMenu-RailGroup {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 8px 8px 3px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.HomeModelMenu-List {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 6px;
  overflow-y: auto;
}

.HomeModelMenu-Group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeModelMenu-GroupHeading {
  padding: 8px 9px 3px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  .HomeModelMenu-Group:first-child & {
    padding-top: 2px;
  }
}

.HomeModelMenu-Option {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }

  &.is-selected {
    background: var(--shell-surface-2);
  }

  // The tag shares the selected row's fill; cut it out of the panel colour instead.
  &.is-selected .HomeModelMenu-Tag {
    background: var(--shell-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeModelMenu-OptionIcon {
  display: inline-flex;
  flex: none;
  color: var(--shell-text-secondary);
}

.HomeModelMenu-OptionLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Tag {
  flex: none;
  max-width: 120px;
  padding: 1px 6px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Check {
  flex: none;
  color: var(--shell-primary);
  font-size: 15px;
}

.HomeModelMenu-Hint,
.HomeModelMenu-Empty {
  margin: 0;
  padding: 8px 9px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;

  p {
    margin: 0 0 6px;
  }
}

.HomeModelMenu-Link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-primary);
  font: inherit;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

/* Rows' own padding and line boxes, so loaded rows land where the bars were. */
.HomeModelMenu-RailSkeleton,
.HomeModelMenu-RowSkeleton {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
}

.HomeModelMenu-RailSkeleton {
  height: 30px;
  padding: 0 8px 0 24px;
}

.HomeModelMenu-RowSkeleton {
  height: 32px;
  padding: 0 9px;
}

.HomeModelMenu-SkeletonDot {
  flex: none;
}

.HomeModelMenu-SkeletonBar {
  flex: 1;
  max-width: 60%;
}

.HomeModelMenu-Foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 9px 15px;
  border-top: 1px solid var(--shell-border);
}

/*
 * Label on the left, the five levels on the right, one line. The label is in the secondary ink: the
 * muted one reads at ~3:1 on the light panel, too faint for the name of a control. When the route
 * takes no effort the chips disable themselves and the label steps back with them; the note under
 * the row says why.
 */
.HomeModelMenu-Effort {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.HomeModelMenu-EffortLabel {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  white-space: nowrap;

  .HomeModelMenu-Effort.is-disabled & {
    color: var(--shell-text-muted);
  }
}

/*
 * The chip row draws its own chips; this only points the BUI tokens at the shell's, so a control
 * teleported onto the panel does not arrive in the docs site's palette.
 */
.HomeModelMenu-EffortChips {
  --tx-bui-ink: var(--shell-text-primary);
  --tx-bui-ink-2: var(--shell-text-muted);
  --tx-bui-surface: var(--shell-surface-2);
  --tx-bui-hover: var(--shell-surface);
  --tx-bui-accent: var(--shell-primary);
  --tx-bui-shadow-btn: none;

  min-width: 0;
}

.HomeModelMenu-EffortNote {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.35;
}
</style>
