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
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchesModelQuery, modelSubtitle } from '~/modules/conversation/model-display'
import { useModelFavorites } from '~/modules/conversation/useModelFavorites'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { modelFamilyIconFor } from '~/modules/intelligence/model-family-icons'
import { providerIconFor } from '~/modules/intelligence/provider-icons'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import {
  MODEL_MENU_HOTKEY_COUNT,
  modelMenuHotkeyIndex,
  modelMenuHotkeyLabel
} from './model-menu-hotkeys'

/**
 * The picker behind both model pills. Each caller hands its pill in through the trigger slot and
 * this control owns the rest: anchoring, outside-click, Escape and arrow traversal come from
 * TxDropdownMenu; the provider filter strip, search, favourites, hotkeys and the shared
 * selection state are composed here. Rows are `menuitemradio` buttons so the primitive's arrow
 * keys walk them; everything else in the panel is reached with Tab.
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

interface ProviderFilter {
  providerId: string
  providerName: string
  icon: ITuffIcon
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
 * One filter per provider that has something to pick, in the order the options arrived. Derived
 * from the rows rather than the raw option list: a provider with no models would be a tab that
 * opens on nothing.
 */
const providerFilters = computed<ProviderFilter[]>(() => {
  const seen = new Set<string>()
  const filters: ProviderFilter[] = []
  for (const choice of choices.value) {
    if (seen.has(choice.providerId)) continue
    seen.add(choice.providerId)
    filters.push({
      providerId: choice.providerId,
      providerName: choice.providerName,
      icon: providerIconFor(choice.providerType)
    })
  }
  return filters
})

/**
 * A row shows what the model is before who serves it: the family's brand mark (`qwen2.5:3b` →
 * Qwen, `codex/gpt-6-astra` → OpenAI), and the provider's icon only when the name names no
 * family. The strip keeps the provider icon; there the provider is the subject.
 */
function rowIcon(choice: ModelChoice): ITuffIcon {
  return modelFamilyIconFor(choice.model) ?? providerIconFor(choice.providerType)
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
    (filter) => filter.providerId === chosen.providerId
  )
  return stillOffered ? chosen : defaultFilter()
})

const favoritesActive = computed(() => effectiveFilter.value.kind === 'favorites')

function isProviderActive(providerId: string): boolean {
  const filter = effectiveFilter.value
  return filter.kind === 'provider' && filter.providerId === providerId
}

/** A search runs across every provider and ignores the strip; the strip only applies without one. */
const visibleChoices = computed<ModelChoice[]>(() => {
  const needle = trimmedQuery.value
  if (needle) return choices.value.filter((choice) => matchesModelQuery(choice, needle))
  const filter = effectiveFilter.value
  if (filter.kind === 'favorites') return favoriteChoices.value
  return choices.value.filter((choice) => choice.providerId === filter.providerId)
})

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
      <!-- Filters, not tabs: one `aria-pressed` button per provider, exactly one pressed.
           Always shown, even for a single provider, so the star filter has a fixed place. -->
      <div class="HomeModelMenu-Filters" role="group" :aria-label="t('home.modelProviders')">
        <button
          class="HomeModelMenu-Filter"
          :class="{ 'is-active': favoritesActive }"
          type="button"
          :aria-pressed="favoritesActive"
          :aria-label="t('home.modelFavorites')"
          :title="t('home.modelFavorites')"
          @click="pickFilter(FAVORITES_FILTER)"
        >
          <span :class="favoritesActive ? 'i-ri-star-fill' : 'i-ri-star-line'" />
        </button>
        <button
          v-for="provider in providerFilters"
          :key="provider.providerId"
          class="HomeModelMenu-Filter"
          :class="{ 'is-active': isProviderActive(provider.providerId) }"
          type="button"
          :aria-pressed="isProviderActive(provider.providerId)"
          :aria-label="provider.providerName"
          :title="provider.providerName"
          @click="pickFilter({ kind: 'provider', providerId: provider.providerId })"
        >
          <TxIcon :icon="provider.icon" :size="15" />
        </button>
      </div>

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
        class="HomeModelMenu-Item HomeModelMenu-Auto"
        type="button"
        role="menuitemradio"
        :aria-checked="!resolvedChoice"
        @click="choose(null)"
      >
        <span class="HomeModelMenu-Name">{{ t('home.modelAuto') }}</span>
      </button>

      <div class="HomeModelMenu-Divider" />

      <div class="HomeModelMenu-Body">
        <p v-if="emptyHint" class="HomeModelMenu-Hint">{{ emptyHint }}</p>

        <div v-else class="HomeModelMenu-List" role="group">
          <!-- Two buttons side by side, not nested: a control cannot sit inside another control,
               and the star must neither select nor close. Arrow keys walk the radios only. -->
          <div
            v-for="(choice, index) in visibleChoices"
            :key="`${choice.providerId} ${choice.model}`"
            class="HomeModelMenu-Row"
            :class="{ 'is-selected': isSelected(choice) }"
          >
            <button
              class="HomeModelMenu-Item"
              type="button"
              role="menuitemradio"
              :aria-checked="isSelected(choice)"
              @click="choose(choice)"
            >
              <TxIcon class="HomeModelMenu-Icon" :icon="rowIcon(choice)" :size="15" />
              <span class="HomeModelMenu-Text">
                <span class="HomeModelMenu-Name">{{ choice.displayName }}</span>
                <span class="HomeModelMenu-Sub">
                  {{ modelSubtitle(choice.providerName, choice.source) }}
                </span>
              </span>
              <TxKbd v-if="index < MODEL_MENU_HOTKEY_COUNT" class="HomeModelMenu-Kbd">
                {{ modelMenuHotkeyLabel(index, isMac) }}
              </TxKbd>
            </button>
            <button
              class="HomeModelMenu-Star"
              type="button"
              :aria-pressed="isFavorite(choice)"
              :aria-label="isFavorite(choice) ? t('home.modelUnfavorite') : t('home.modelFavorite')"
              :title="isFavorite(choice) ? t('home.modelUnfavorite') : t('home.modelFavorite')"
              @click="toggleStar(choice)"
            >
              <span :class="isFavorite(choice) ? 'i-ri-star-fill' : 'i-ri-star-line'" />
            </button>
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

.HomeModelMenu-Filters {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
  padding: 0 2px;
}

/*
 * Sized by its own box, not by its glyph. The strip is the only place a provider shows up, so a
 * button whose icon fails to render (an icon class missing from the UnoCSS safelist is how the
 * Pi tab once vanished) must still hold its slot and answer hover. The border is reserved
 * transparent so nothing shifts should a state colour it.
 */
.HomeModelMenu-Filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Border-box, so the reserved border does not grow the 30×28 slot the strip was laid out on. */
  box-sizing: border-box;
  min-width: 30px;
  min-height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 15px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  /* TxIcon paints a currentColor fill and lets the icon class mask it into the glyph. With no
     mask the empty <i> collapses to nothing and the button is blank; held at 1em it shows as a
     solid square instead — a visible "icon missing", not a missing control. */
  :deep(.tuff-icon__class i) {
    min-width: 1em;
    min-height: 1em;
  }
}

.HomeModelMenu-Search {
  padding: 0 2px 2px;
}

.HomeModelMenu-Item {
  display: flex;
  flex: 1;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 6px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

/* Auto is its own row; the model rows carry hover and selection on their container instead. */
.HomeModelMenu-Auto {
  padding: 7px 9px;

  &:hover {
    background: var(--shell-surface);
  }

  &[aria-checked='true'] {
    background: var(--shell-surface-2);
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

/* Selection reads on the whole row, star included: the row is the unit, the buttons are its parts. */
.HomeModelMenu-Row {
  display: flex;
  gap: 2px;
  align-items: center;
  padding-right: 4px;
  border-radius: var(--shell-radius-sm);
  transition: background-color 0.12s ease;

  &:hover,
  &:has(:focus-visible) {
    background: var(--shell-surface);
  }

  &.is-selected {
    background: var(--shell-surface-2);
  }
}

.HomeModelMenu-Icon {
  display: inline-flex;
  flex: none;
  color: var(--shell-text-secondary);
}

.HomeModelMenu-Text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomeModelMenu-Name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Sub {
  overflow: hidden;
  color: var(--shell-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-caption);
  line-height: 1.3;
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
  .HomeModelMenu-Row:hover &,
  .HomeModelMenu-Row:focus-within &,
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
