<script lang="ts">
/**
 * The one menu the two pills may hold open between them — the old `openMenu` state machine's
 * invariant. Pointer flows keep it on their own (the primitive's outside-click closes the other
 * copy on pointerdown), but a keyboard activation of the other pill fires no pointerdown, so the
 * newly opening copy closes the previous one through this hand-off.
 */
let closeActiveModelMenu: (() => void) | null = null
</script>

<script lang="ts" name="HomeModelMenu" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { TxCardItem } from '@talex-touch/tuffex/card-item'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesModelQuery, modelSubtitle } from '~/modules/conversation/model-display'
import { useModelFavorites } from '~/modules/conversation/useModelFavorites'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { modelFamilyIconFor } from '~/modules/intelligence/model-family-icons'
import {
  modelSourceIconFor,
  modelSourceInitialFor
} from '~/modules/intelligence/model-source-icons'
import { providerIconForId } from '~/modules/intelligence/provider-icons'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import {
  MODEL_MENU_HOTKEY_COUNT,
  modelMenuHotkeyIndex,
  modelMenuHotkeyLabel
} from './model-menu-hotkeys'

/**
 * The picker behind both model pills. Each caller hands its pill in through the trigger slot and
 * this control owns the rest: anchoring, outside-click, Escape and arrow traversal come from
 * TxDropdownMenu; the channel filter strip, search, favourites, hotkeys and the shared selection
 * state are composed here. Rows are `menuitemradio` card items so the primitive's arrow keys walk
 * them; everything else in the panel is reached with Tab.
 */
const props = withDefaults(defineProps<{ placement?: 'bottom-start' | 'top-end' }>(), {
  placement: 'bottom-start'
})

const { t } = useI18n()
const { choices, loaded, ensureLoaded, select, isSelected, resolvedChoice } = useModelOptions()
const { isFavorite, toggle: toggleFavorite } = useModelFavorites()

/** Read once: the platform does not change under a running renderer. */
const isMac = getCurrentRendererPlatformState().isMac

/**
 * Which rows the strip shows when there is no search. A tagged union rather than a string, so a
 * provider whose id happened to be `favorites` could not collide with the star filter.
 */
type ModelFilter = { kind: 'favorites' } | { kind: 'provider'; providerId: string }

const FAVORITES_FILTER: ModelFilter = { kind: 'favorites' }

/**
 * Chip values are prefixed rather than raw, so a provider id can never be read as the star filter
 * — a provider literally named `favorites` still lands on `provider:favorites`.
 */
const FAVORITES_CHIP = 'favorites'

function providerChip(providerId: string): string {
  return `provider:${providerId}`
}

/**
 * One group in the list: the channel a model was listed under (`codex/gpt-6-astra` → `codex`),
 * falling back to the provider for ids that carry no channel at all (`qwen2.5:3b`).
 *
 * The strip does not use this. Channels are what the list sorts rows into; the strip picks which
 * provider's rows are on screen. Tying the two together was tried and reverted: pi alone serves
 * eight channels here, and a tab each pushed the strip onto a second row while the list below it
 * had nothing left to group.
 */
interface ModelBucket {
  key: string
  providerId: string
  /** `null` when this provider's ids carry no channel prefix; the bucket is then the provider. */
  source: string | null
  label: string
  /** `null` for a channel the icon table cannot place; `initial` is drawn instead. */
  icon: ITuffIcon | null
  initial: string
}

/**
 * `\u0000` joins the two halves, because both are free text: a provider id may hold the `/` or `:`
 * that would otherwise let `a/b` + `c` and `a` + `b/c` collide into one bucket. Neither a provider
 * id nor a channel name can hold a NUL. Written as an escape, never as the character itself — a
 * raw NUL in a source file is invisible in every editor and diff that would have to review it.
 */
function bucketKeyOf(choice: ModelChoice): string {
  return `${choice.providerId}\u0000${choice.source ?? ''}`
}

function bucketOf(choice: ModelChoice): ModelBucket {
  const source = choice.source
  return {
    key: bucketKeyOf(choice),
    providerId: choice.providerId,
    source,
    label: source ?? choice.providerName,
    icon: source
      ? modelSourceIconFor(source)
      : providerIconForId(choice.providerId, choice.providerType),
    initial: source ? modelSourceInitialFor(source) : ''
  }
}

const open = ref(false)
const query = ref('')
const activeFilter = ref<ModelFilter>(FAVORITES_FILTER)
/** Set by a click on the strip; until then the filter follows the data as it loads. */
let filterPinned = false
const triggerWrapRef = ref<HTMLElement | null>(null)
const searchWrapRef = ref<HTMLElement | null>(null)
/**
 * Focus goes back to the pill only when the menu closed from the keyboard or a selection —
 * an outside click moved focus somewhere deliberate, and yanking it back would fight the user.
 */
let restoreFocusOnClose = false

/**
 * One chip per provider that has something to pick, in the order the options arrived. Derived from
 * the rows rather than the raw option list, so a provider with no models is never a chip that
 * opens on nothing.
 */
const providerFilters = computed(() => {
  const seen = new Set<string>()
  const providers: { providerId: string; providerName: string; providerType: string }[] = []
  for (const choice of choices.value) {
    if (seen.has(choice.providerId)) continue
    seen.add(choice.providerId)
    providers.push({
      providerId: choice.providerId,
      providerName: choice.providerName,
      providerType: choice.providerType
    })
  }
  return providers
})

/**
 * A row shows what the model is before who serves it: the family's brand mark (`qwen2.5:3b` →
 * Qwen, `codex/gpt-6-astra` → OpenAI), and the provider's icon only when the name names no
 * family. A tab and a group header show the bucket instead — there the channel is the subject.
 */
function rowIcon(choice: ModelChoice): ITuffIcon {
  return (
    modelFamilyIconFor(choice.model) ?? providerIconForId(choice.providerId, choice.providerType)
  )
}

/** Starred rows that resolve against the loaded choices, in list order. */
const favoriteChoices = computed(() => choices.value.filter((choice) => isFavorite(choice)))

const trimmedQuery = computed(() => query.value.trim())

/**
 * Where the panel opens: the pinned model's provider, else the star filter when a favourite is
 * on offer, else the first provider. The star filter is the last resort only when there is no
 * provider at all.
 */
function defaultFilter(): ModelFilter {
  const resolved = resolvedChoice.value
  if (resolved) return { kind: 'provider', providerId: resolved.providerId }
  if (favoriteChoices.value.length) return FAVORITES_FILTER
  const first = providerFilters.value[0]
  return first ? { kind: 'provider', providerId: first.providerId } : FAVORITES_FILTER
}

/** The active filter, unless it names a provider that has since gone; then the default. */
const effectiveFilter = computed<ModelFilter>(() => {
  const chosen = activeFilter.value
  if (chosen.kind === 'favorites') return chosen
  const stillOffered = providerFilters.value.some(
    (provider) => provider.providerId === chosen.providerId
  )
  return stillOffered ? chosen : defaultFilter()
})

const favoritesActive = computed(() => effectiveFilter.value.kind === 'favorites')

/** The chip row is single-select, so the union collapses to one value and back. */
const activeChip = computed<string>(() => {
  const filter = effectiveFilter.value
  return filter.kind === 'favorites' ? FAVORITES_CHIP : providerChip(filter.providerId)
})

function pickChip(value: string | number): void {
  const chip = String(value)
  if (chip === FAVORITES_CHIP) {
    pickFilter(FAVORITES_FILTER)
    return
  }
  pickFilter({ kind: 'provider', providerId: chip.slice('provider:'.length) })
}

/**
 * The star sits first and always, so it has a fixed place whatever the providers do. Every chip
 * has an icon, since the strip draws nothing else: the label goes to `aria-label` and the hover
 * title.
 */
const filterChips = computed<FilterChipItem[]>(() => [
  {
    value: FAVORITES_CHIP,
    label: t('home.modelFavorites'),
    iconClass: favoritesActive.value ? 'i-ri-star-fill' : 'i-ri-star-line'
  },
  ...providerFilters.value.map((provider) => ({
    value: providerChip(provider.providerId),
    label: provider.providerName,
    iconClass: providerIconForId(provider.providerId, provider.providerType).value
  }))
])

/** A search runs across every provider and ignores the strip; the strip only applies without one. */
const visibleChoices = computed<ModelChoice[]>(() => {
  const needle = trimmedQuery.value
  if (needle) return choices.value.filter((choice) => matchesModelQuery(choice, needle))
  const filter = effectiveFilter.value
  if (filter.kind === 'favorites') return favoriteChoices.value
  return choices.value.filter((choice) => choice.providerId === filter.providerId)
})

/**
 * The same rows, cut into their buckets. `visibleChoices` stays the ordering truth and this is a
 * view of it, which is what keeps `startIndex` — and with it the ⌘1–9 chords — running unbroken
 * across the group boundaries instead of restarting at each header.
 */
interface ModelGroup {
  bucket: ModelBucket
  choices: ModelChoice[]
  /** Where this group's first row sits in `visibleChoices`; the chord index counts from here. */
  startIndex: number
}

const visibleGroups = computed<ModelGroup[]>(() => {
  const groups: ModelGroup[] = []
  const byKey = new Map<string, ModelGroup>()
  visibleChoices.value.forEach((choice, index) => {
    const key = bucketKeyOf(choice)
    const existing = byKey.get(key)
    if (existing) {
      existing.choices.push(choice)
      return
    }
    const group: ModelGroup = { bucket: bucketOf(choice), choices: [choice], startIndex: index }
    byKey.set(key, group)
    groups.push(group)
  })
  return groups
})

/**
 * A header over the only group on screen names what the tab above it already says, so the single
 * group goes bare. Under a search — and under the star filter — the rows usually do span buckets,
 * and that is exactly where the header earns its line.
 */
const showGroupHeaders = computed(() => visibleGroups.value.length > 1)

/**
 * The line shown instead of the list, or `null` when there are rows. Gated on `loaded`, never on
 * `loading`: a reopen refetches over a list that is already on screen, and the rows stay while it
 * does. No skeleton: the row count is the data's to decide (design §7, the component-guidelines
 * exception), so a fixed `min-height` under the body holds the panel steady between this line and
 * the rows instead.
 */
const emptyHint = computed<string | null>(() => {
  if (!loaded.value) return t('home.modelLoading')
  // Not an error: a machine with no configured provider legitimately has nothing to list.
  if (!choices.value.length) return t('home.modelEmpty')
  if (visibleChoices.value.length) return null
  if (trimmedQuery.value) return t('home.modelNoResults')
  return favoritesActive.value ? t('home.modelFavoritesEmpty') : t('home.modelNoResults')
})

function pickFilter(filter: ModelFilter): void {
  filterPinned = true
  activeFilter.value = filter
}

function choose(choice: ModelChoice | null): void {
  select(choice)
  restoreFocusOnClose = true
  open.value = false
}

function searchInput(): HTMLInputElement | null {
  return searchWrapRef.value?.querySelector('input') ?? null
}

/** Starring never selects and never closes; it is a side note on the row. */
function toggleStar(choice: ModelChoice): void {
  const removesFocusedRow = favoritesActive.value && !trimmedQuery.value && isFavorite(choice)
  toggleFavorite(choice)
  // Unstarring under the star filter unmounts the row that held focus; park it on the search
  // field rather than let it fall to the document, where the next keystroke would go nowhere.
  if (removesFocusedRow) void nextTick(() => searchInput()?.focus())
}

/**
 * Escape is closed by the anchor itself; this only marks that focus should return to the pill.
 * The digit chords reach here from anywhere inside the panel — and only from there, so a closed
 * menu hears nothing. The panel owns the whole chord range while open: a digit past the last
 * row still does nothing else.
 */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    restoreFocusOnClose = true
    return
  }
  const index = modelMenuHotkeyIndex(event, isMac)
  if (index === null) return
  event.preventDefault()
  const choice = visibleChoices.value[index]
  if (choice) choose(choice)
}

/**
 * The anchor keeps its panel at `visibility: hidden` until it has measured a position and the
 * entrance animation starts, a few frames after `open` flips — and a hidden element refuses
 * focus. Retry once per frame, bounded, until focus lands or the menu closes again. One run at a
 * time: a reopen supersedes the previous run's token.
 */
const FOCUS_RETRY_FRAMES = 30
let focusRun = 0

function focusSearchWhenShown(): void {
  const run = ++focusRun
  let attempts = 0
  const attempt = (): void => {
    if (run !== focusRun || !open.value) return
    const input = searchInput()
    input?.focus()
    if (input && document.activeElement === input) return
    if (++attempts < FOCUS_RETRY_FRAMES) requestAnimationFrame(attempt)
  }
  void nextTick(attempt)
}

function closeSelf(): void {
  open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    if (closeActiveModelMenu !== null && closeActiveModelMenu !== closeSelf) closeActiveModelMenu()
    closeActiveModelMenu = closeSelf
    restoreFocusOnClose = false
    // A fresh look each time: the search is a one-off, and the filter follows what is pinned now.
    query.value = ''
    filterPinned = false
    activeFilter.value = defaultFilter()
    // Fetched again on every open, not just the first: providers come and go while the app runs
    // (a CLI installed after launch, one enabled in settings), and the list HomePage loaded at
    // mount would otherwise stand for the whole session. The rows already on screen stay put
    // while the refetch is in flight — only `loaded`, never `loading`, gates the loading line.
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

/** Options that land after the panel opened re-derive the default, unless a click pinned one. */
watch(choices, () => {
  if (open.value && !filterPinned) activeFilter.value = defaultFilter()
})

onBeforeUnmount(() => {
  focusRun++
  if (closeActiveModelMenu === closeSelf) closeActiveModelMenu = null
})
</script>

<template>
  <TxDropdownMenu
    v-model="open"
    :placement="props.placement"
    :min-width="300"
    :max-height="380"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
    initial-focus="none"
  >
    <template #trigger>
      <!-- display: contents — the wrapper exists only so closing can find the pill to refocus. -->
      <span ref="triggerWrapRef" class="HomeModelMenu-TriggerWrap">
        <slot name="trigger" :open="open" />
      </span>
    </template>

    <!-- `group` so the label is announced: on a bare div `aria-label` is ignored. The radio rows
         belong inside a group per ARIA menus; the strip and the search field ride along as the
         panel's own controls, reached with Tab (design §4 rejected `tablist` inside a `menu`). -->
    <div class="HomeModelMenu" role="group" :aria-label="t('home.model')" @keydown="onPanelKeydown">
      <!-- Filters, not tabs: `TxFilterChips` in its toolbar role, so the chips are `aria-pressed`
           toggles and the arrow keys move focus without changing the filter. A `tablist` inside a
           `menu` was rejected in the redesign; this keeps that call. Icon-only: three named chips
           side by side read as one run-on sentence, and each chip still names itself through
           `aria-label` and its hover title. The row never wraps — the chips scroll sideways —
           which is what holds the panel's height still. -->
      <TxFilterChips
        class="HomeModelMenu-Filters"
        role="toolbar"
        icon-only
        :aria-label="t('home.modelSources')"
        :items="filterChips"
        :model-value="activeChip"
        @update:model-value="pickChip"
      />

      <div ref="searchWrapRef" class="HomeModelMenu-Search">
        <TxSearchInput
          v-model="query"
          :placeholder="t('home.modelSearch')"
          :aria-label="t('home.modelSearch')"
          clearable
        />
      </div>

      <!-- Auto stays on top and outside every filter: it is the way out of pinning, not a model. -->
      <button
        class="HomeModelMenu-Auto"
        type="button"
        role="menuitemradio"
        :aria-checked="!resolvedChoice"
        @click="choose(null)"
      >
        <span>{{ t('home.modelAuto') }}</span>
      </button>

      <div class="HomeModelMenu-Divider" />

      <div class="HomeModelMenu-Body">
        <p v-if="emptyHint" class="HomeModelMenu-Hint">{{ emptyHint }}</p>

        <div v-else class="HomeModelMenu-List" role="group">
          <!-- One block per bucket. The header is `aria-hidden` and unfocusable: the group's own
               `aria-label` already announces the channel, and a focusable header would land in the
               arrow traversal between two rows. -->
          <div
            v-for="group in visibleGroups"
            :key="group.bucket.key"
            class="HomeModelMenu-Group"
            role="group"
            :aria-label="group.bucket.label"
          >
            <div v-if="showGroupHeaders" class="HomeModelMenu-GroupHeader" aria-hidden="true">
              <TxIcon v-if="group.bucket.icon" :icon="group.bucket.icon" :size="12" />
              <span v-else class="HomeModelMenu-GroupInitial">{{ group.bucket.initial }}</span>
              <span class="HomeModelMenu-GroupName">{{ group.bucket.label }}</span>
            </div>

            <!-- The star rides in the row's `right` slot rather than beside it: the row is a div,
                 so a control may sit inside it, and the hover surface then covers the whole row
                 instead of stopping short of the star. It still must neither select nor close, so
                 its click is stopped before it reaches the row. Arrow keys walk the radios only. -->
            <TxCardItem
              v-for="(choice, index) in group.choices"
              :key="`${choice.providerId} ${choice.model}`"
              class="HomeModelMenu-Item"
              role="menuitemradio"
              :aria-checked="isSelected(choice)"
              clickable
              :active="isSelected(choice)"
              @click="choose(choice)"
            >
              <template #avatar>
                <TxIcon class="HomeModelMenu-Icon" :icon="rowIcon(choice)" :size="15" />
              </template>
              <template #title>{{ choice.displayName }}</template>
              <template #subtitle>
                {{ modelSubtitle(choice.providerName, choice.source) }}
              </template>
              <template #right>
                <TxKbd
                  v-if="group.startIndex + index < MODEL_MENU_HOTKEY_COUNT"
                  class="HomeModelMenu-Kbd"
                >
                  {{ modelMenuHotkeyLabel(group.startIndex + index, isMac) }}
                </TxKbd>
                <button
                  class="HomeModelMenu-Star"
                  type="button"
                  :aria-pressed="isFavorite(choice)"
                  :aria-label="
                    isFavorite(choice) ? t('home.modelUnfavorite') : t('home.modelFavorite')
                  "
                  :title="isFavorite(choice) ? t('home.modelUnfavorite') : t('home.modelFavorite')"
                  @click.stop="toggleStar(choice)"
                >
                  <span :class="isFavorite(choice) ? 'i-ri-star-fill' : 'i-ri-star-line'" />
                </button>
              </template>
            </TxCardItem>
          </div>
        </div>
      </div>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomeModelMenu-TriggerWrap {
  display: contents;
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
.HomeModelMenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/*
 * The chip row draws its own chips; this only points the BUI tokens at the shell's, so a control
 * teleported onto the menu panel does not arrive in the docs site's palette. The row never wraps —
 * it scrolls sideways — which is what holds the panel's height still however many providers load.
 */
.HomeModelMenu-Filters {
  --tx-bui-ink: var(--shell-text-primary);
  --tx-bui-ink-2: var(--shell-text-muted);
  --tx-bui-surface: var(--shell-surface-2);
  --tx-bui-hover: var(--shell-surface);
  --tx-bui-accent: var(--shell-primary);
  --tx-bui-shadow-btn: none;

  margin-bottom: 2px;

  /* simple-icons' π is drawn edge to edge — the path opens at `M0 0` and fills its whole 24px
     box — while the star and the server keep a margin inside theirs. At the same rendered size
     it reads a weight heavier than its neighbours, so it alone is scaled down to sit on the
     same optical line. Keyed on the glyph, not the chip: the slot stays 30px like the others. */
  :deep(.tx-bui-filter-chips__icon.i-simple-icons-pi) {
    transform: scale(0.72);
  }
}

.HomeModelMenu-Search {
  padding: 0 2px 2px;
}

/*
 * The stand-in for a channel with no brand mark, in the group header. Sized in `em` off the
 * header's own font so it lines up with the 12px icons beside it, and weighted up because a single
 * letter at caption size reads as debris next to a filled glyph.
 */
.HomeModelMenu-GroupInitial {
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1;
}

/*
 * The rows are `TxCardItem`s, so hover, selection, focus ring and disabled come from the primitive
 * and only the sizing and the two surface colours are set here.
 *
 * Those two colours have to be set. The primitive's defaults wash `--tx-bg-color-overlay` at 18%
 * over the row, and under the dark theme that token is `#1d1e1f` — a dark wash on this panel's own
 * `#1c1c1e` surface, which is the invisible hover this menu had before. The shell's semantic
 * surfaces are the ones that carry a contrast here, and they resolve inside the teleported panel
 * because they are declared on `:root`, unlike the `--tx-*` bridge, which stops at `.HomePage`.
 */
.HomeModelMenu-Item {
  --tx-card-item-padding: 6px 9px;
  --tx-card-item-radius: var(--shell-radius-sm);
  --tx-card-item-gap: 10px;
  --tx-card-item-hover-bg: var(--shell-surface);
  --tx-card-item-active-bg: var(--shell-surface-2);

  align-items: center;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);

  /* The primitive rings the active row in `primary 40%`, which on this panel reads as a second
     focus ring beside the search field's real one. Selection here is the fill alone; the ring is
     the keyboard's. */
  &.tx-card-item--active {
    border-color: transparent;
  }

  /* The row is one line of text over a caption; centring the icon and the trailing controls on it
     reads better than the primitive's default top alignment, which is built for taller cards. */
  :deep(.tx-card-item__top) {
    align-items: center;
  }

  :deep(.tx-card-item__title) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.tx-card-item__subtitle) {
    overflow: hidden;
    color: var(--shell-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--shell-fs-caption);
    line-height: 1.3;
  }

  :deep(.tx-card-item__right) {
    display: flex;
    gap: 2px;
    align-items: center;
  }
}

/* Auto is a plain button, not a row: it is the way out of pinning, not a model to select. */
.HomeModelMenu-Auto {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 7px 9px;
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

  &[aria-checked='true'] {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeModelMenu-Divider {
  margin: 2px 2px 4px;
  border-top: 1px solid var(--shell-border);
}

/* Four rows' worth, so loading → loaded → filtered does not move the panel's bottom edge. */
.HomeModelMenu-Body {
  min-height: 180px;
}

.HomeModelMenu-List {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeModelMenu-Group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/*
 * A label, not a row: no hover, no hit area, and it must not read as something to click. The top
 * margin collapses on the first group so the list still starts flush under the divider.
 */
.HomeModelMenu-GroupHeader {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
  padding: 2px 9px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  .HomeModelMenu-Group:first-child & {
    margin-top: 0;
  }
}

.HomeModelMenu-GroupName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Icon {
  display: inline-flex;
  flex: none;
  color: var(--shell-text-secondary);
}

/*
 * The badge is a hint on a row that already has two controls, not a third one: TxKbd's keycap
 * relief (gradient fill, heavier bottom edge, drop shadow) reads as pressable and pulls the eye
 * off the model name. Flatten it onto the row's own surface; size and typography stay the
 * primitive's. Scoped through the row item so this outranks the primitive's own rule regardless
 * of stylesheet order.
 */
.HomeModelMenu-Item .HomeModelMenu-Kbd {
  flex: none;
  border: 1px solid var(--shell-border);
  /* The darker bottom edge is the keycap's one 3D cue; level it with the other three sides. */
  border-bottom-color: var(--shell-border);
  background: var(--shell-surface-2);
  box-shadow: none;
  color: var(--shell-text-muted);
}

.HomeModelMenu-Star {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.55;
  transition:
    color 0.12s ease,
    opacity 0.12s ease;

  /* Quiet until the row is in play; a starred one stays lit as the state it is. */
  .HomeModelMenu-Item:hover &,
  .HomeModelMenu-Item:focus-within &,
  &[aria-pressed='true'] {
    opacity: 1;
  }

  &:hover {
    color: var(--shell-text-primary);
  }

  &[aria-pressed='true'] {
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeModelMenu-Hint {
  margin: 0;
  padding: 8px 9px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>
