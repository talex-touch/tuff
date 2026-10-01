<script name="AppList" setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCardItem } from '@talex-touch/tuffex/card-item'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export interface AppListItem {
  id: string
  name: string
  icon?: ITuffIcon
  path?: string
  /** Indexed but excluded from search recall; the row says so rather than hiding the entry. */
  disabled?: boolean
  /** Recorded launches, used by the frequency view. Absent until summaries have loaded. */
  executeCount?: number
  hasShortcut?: boolean
  hasAliases?: boolean
}

const props = defineProps<{
  items: AppListItem[]
  selectedId?: string | null
  /**
   * Bumped by the page each time it asks this list to bring the selected row on screen. An id
   * alone cannot carry that request: asking twice for the same application changes nothing in it.
   */
  revealRevision?: number
  loading?: boolean
  loadFailed?: boolean
  /**
   * The summaries read failed, so every row's totals and configured-state flags are absent. The
   * rows still list; what cannot be told is how often each app was launched.
   */
  usageDegraded?: boolean
  /** Only decides which count sentence to print; the page owns the search field. */
  searched?: boolean
}>()

const emits = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'retry'): void
}>()

const { t } = useI18n()

/**
 * How the list orders and narrows itself. Each mode is the entire view rather than a sort key
 * applied on top of a filter, so the control stays a single choice.
 */
export type AppListView = 'dictionary' | 'frequency' | 'shortcut' | 'alias'

const VIEW_MODES: AppListView[] = ['dictionary', 'frequency', 'shortcut', 'alias']

/** Same icons the detail pane uses for the matching block, so a mode reads as that block. */
const VIEW_ICONS: Record<AppListView, string> = {
  dictionary: 'i-ri-sort-alphabet-asc',
  frequency: 'i-ri-fire-line',
  shortcut: 'i-carbon-keyboard',
  alias: 'i-carbon-tag'
}

const SKELETON_ROWS = 8
const FALLBACK_APP_ICON: ITuffIcon = { type: 'class', value: 'i-ri-apps-2-line' }

const view = ref<AppListView>('dictionary')
const viewMenuOpen = ref(false)
/** Only these two drop rows; the other two reorder the whole list. */
const isFilterView = computed(() => view.value === 'shortcut' || view.value === 'alias')

/** A fast first read must not flash a skeleton; a slow one must not show an empty list. */
const showSkeleton = useDeferredLoading(() => Boolean(props.loading))

const orderedItems = computed(() => {
  const items =
    view.value === 'shortcut'
      ? props.items.filter((item) => item.hasShortcut)
      : view.value === 'alias'
        ? props.items.filter((item) => item.hasAliases)
        : props.items

  // Most launched first, with never-launched rows last and names breaking ties, so the order does
  // not reshuffle between reads of equal counts.
  if (view.value === 'frequency') {
    return [...items].sort(
      (a, b) => (b.executeCount ?? 0) - (a.executeCount ?? 0) || a.name.localeCompare(b.name)
    )
  }

  return [...items].sort((a, b) => a.name.localeCompare(b.name))
})

const countText = computed(() => {
  const count = orderedItems.value.length
  if (props.searched) return t('appList.searchedOnDevice', { count })
  if (isFilterView.value) return t('appList.filteredOnDevice', { count })
  return t('appList.appsOnDevice', { count })
})

/**
 * An empty index and a filter that matched nothing are different facts: "this device has no
 * applications" would be a lie when the list is merely narrowed. Neither sentence repeats the
 * count — the footer carries that, once, on the pane's bottom.
 */
const emptyText = computed(() =>
  props.searched || isFilterView.value
    ? t('appList.emptyFiltered')
    : t('settings.settingFileIndex.appIndexManagerEmpty')
)

function selectView(next: AppListView): void {
  view.value = next
  viewMenuOpen.value = false
}

function handleClick(item: AppListItem): void {
  // Repeat click => cancel
  emits('select', props.selectedId === item.id ? null : item.id)
}

const scrollRef = ref<HTMLElement>()

/**
 * Brings the selected row on screen.
 *
 * Selection can arrive from outside this list — the ⌘K panel's "bind a shortcut" row opens the
 * page on one application — and a selected row below the fold reads as no selection at all.
 * Re-run when the rendered rows change, and on `revealRevision`, for the same reason: the row a
 * selection names may render a beat later than the selection itself once the deferred skeleton
 * gives way to the list, and asking for an application already selected changes no id at all.
 */
function scrollSelectedIntoView(): void {
  const id = props.selectedId
  if (!id) return
  const rows = scrollRef.value?.querySelectorAll<HTMLElement>('[data-app-row-id]')
  if (!rows) return
  const row = [...rows].find((candidate) => candidate.dataset.appRowId === id)
  row?.scrollIntoView?.({ block: 'nearest' })
}

watch(
  [() => props.selectedId, () => props.revealRevision, () => orderedItems.value.length],
  scrollSelectedIntoView,
  { flush: 'post' }
)
</script>

<template>
  <div ref="scrollRef" class="AppList-Scroll">
    <ul v-if="showSkeleton" class="AppList" aria-hidden="true">
      <li v-for="row in SKELETON_ROWS" :key="row" class="AppList-Entry">
        <TxCardItem class="AppList-Row" align="center">
          <template #avatar>
            <TxSkeleton variant="rect" :width="32" :height="32" :radius="8" />
          </template>
          <template #title>
            <TxSkeleton :width="140" :height="13" :radius="4" />
          </template>
          <template #description>
            <TxSkeleton :width="180" :height="12" :radius="4" />
          </template>
        </TxCardItem>
      </li>
    </ul>

    <div v-else-if="loadFailed" class="AppList-Empty" role="status">
      <span>{{ t('settings.settingFileIndex.appIndexManagerLoadFailed') }}</span>
      <TxButton variant="flat" size="sm" @click="emits('retry')">
        {{ t('common.retry') }}
      </TxButton>
    </div>

    <div v-else-if="!orderedItems.length" class="AppList-Empty" role="status">
      <span>{{ emptyText }}</span>
    </div>

    <TransitionGroup v-else name="list" tag="ul" class="AppList">
      <li v-for="item in orderedItems" :key="item.id" class="AppList-Entry">
        <TxCardItem
          class="AppList-Row"
          :class="{ 'is-disabled': item.disabled }"
          role="button"
          clickable
          align="center"
          :active="selectedId === item.id"
          :data-app-row-id="item.id"
          :aria-pressed="selectedId === item.id"
          @click="handleClick(item)"
        >
          <template #avatar>
            <TxIcon colorful :icon="item.icon ?? FALLBACK_APP_ICON" :alt="item.name" :size="32">
              <template #empty>
                <span class="AppList-IconFallback" aria-hidden="true">
                  <i class="i-ri-apps-2-line" />
                </span>
              </template>
            </TxIcon>
          </template>
          <template #title>
            <span class="AppList-Name">{{ item.name }}</span>
          </template>
          <template v-if="item.path" #description>
            <span class="AppList-Path" :title="item.path" :aria-label="item.path">
              <span class="AppList-PathStart">
                {{ item.path.slice(0, Math.ceil(item.path.length / 2)) }}
              </span>
              <span class="AppList-PathEnd"
                ><span>{{ item.path.slice(Math.ceil(item.path.length / 2)) }}</span></span
              >
            </span>
          </template>
          <template v-if="item.disabled" #right>
            <span class="AppList-Flag">
              {{ t('settings.settingFileIndex.appIndexManagerEntryDisabled') }}
            </span>
          </template>
        </TxCardItem>
      </li>
    </TransitionGroup>

    <!--
      Zeros are not shown for a read that failed: the frequency view would then rank every app
      equally and claim none was ever launched, which is a statement about the data rather than
      about the database.
    -->
    <p v-if="usageDegraded && !loadFailed" class="AppList-Notice" role="status">
      {{ t('appList.usageUnavailable') }}
    </p>

    <div class="AppList-Info">
      <span>{{ countText }}</span>

      <TxPopover
        v-model="viewMenuOpen"
        placement="top-end"
        :width="200"
        :match-reference-width="false"
        :toggle-on-reference-click="false"
      >
        <template #reference>
          <button
            type="button"
            class="AppList-Order"
            :aria-label="t('appList.view.change')"
            @click.stop="viewMenuOpen = !viewMenuOpen"
          >
            <i :class="VIEW_ICONS[view]" aria-hidden="true" />
            <span>{{ t(`appList.view.${view}`) }}</span>
          </button>
        </template>

        <ul class="AppList-ViewMenu" role="menu" :aria-label="t('appList.view.change')">
          <li v-for="mode in VIEW_MODES" :key="mode">
            <button
              type="button"
              role="menuitemradio"
              class="AppList-ViewOption"
              :class="{ active: view === mode }"
              :aria-checked="view === mode"
              @click="selectView(mode)"
            >
              <i :class="VIEW_ICONS[mode]" aria-hidden="true" />
              <span>{{ t(`appList.view.${mode}`) }}</span>
              <i
                v-if="view === mode"
                class="i-ri-check-line AppList-ViewOptionCheck"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </TxPopover>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * A flex item of the aside body, so it grows to the pane's height instead of stopping at its rows
 * (a percentage here resolves against a percentage-derived height and does nothing). The rows keep
 * their own floor, so a longer list still grows and scrolls.
 */
.AppList-Scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.25s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.AppList {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  // The shell's aside scroller already supplies the 12px gutter. Padding here would sit inside
  // it and push every row a further 8px in, leaving a dead strip the search field does not have.
  padding: 0;
  list-style: none;
}

.AppList-Row {
  --tx-card-item-padding: 8px;
  --tx-card-item-gap: 8px;
  --tx-card-item-radius: 8px;
  --tx-card-item-hover-bg: var(--tx-fill-color);
  --tx-card-item-active-bg: var(--tx-color-primary-light-9);
  min-height: 56px;

  &.is-disabled .AppList-Name {
    opacity: 0.55;
  }
}

.AppList-IconFallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-placeholder);

  i {
    font-size: 18px;
  }
}

.AppList-Path {
  display: flex;
  min-width: 0;
  white-space: nowrap;
  font-size: 12px;
}

.AppList-PathStart {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.AppList-PathEnd {
  display: flex;
  flex: 0 1 auto;
  justify-content: flex-end;
  max-width: 55%;
  min-width: 0;
  overflow: hidden;

  > span {
    flex-shrink: 0;
  }
}

.AppList-Name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 0.8rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.AppList-Flag {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--tx-fill-color-dark);
  color: var(--tx-text-color-secondary);
  font-size: 0.65rem;
  line-height: 16px;
}

.AppList-Empty {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
  padding: 3rem 1.5rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.8rem;
  text-align: center;
}

/**
 * Sits with the count it qualifies, above the pinned footer, in the list's own gutter. The auto
 * top margin is what drops this pair — and, with no notice rendered, the footer alone — to the
 * bottom of the pane: with no free space above them they just follow the last row.
 */
.AppList-Notice {
  margin: auto 0 0;
  padding: 0 0.75rem 0.5rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.7rem;
  line-height: 1.45;
}

/**
 * The list's own footer. Search moved up to the aside header the shell renders, so the only
 * control left here is the view picker — which belongs beside the count it describes.
 *
 * Opaque rather than `fake-background`: that helper paints through a `z-index: -1` ::before,
 * and a sticky element establishes its own stacking context, so the pseudo-element sits below
 * the bar's own content but *not* above the rows scrolling underneath it - they read straight
 * through. Every other pinned bar in the app (ShortcutDialog, PluginFeatureDetailCard) uses the
 * overlay token for exactly this reason. The blur stays as depth on top of a real surface.
 */
.AppList-Info {
  z-index: 2;
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding: 0.25rem 0.75rem;
  border-top: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color-overlay);
  backdrop-filter: blur(18px) saturate(180%);

  > span {
    opacity: 0.75;
    font-size: 0.8rem;
  }
}

/**
 * Only the first bar of the bottom group may claim the free space. Both selectors above ask for
 * it, and flexbox divides free space equally between every auto margin — so with the notice
 * rendered the two drifted apart and the notice sat alone, halfway down the pane, instead of
 * staying above the footer it qualifies.
 */
.AppList-Notice + .AppList-Info {
  margin-top: 0;
}

.AppList-Order {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  padding: 0.15rem 0.4rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 0.7rem;
  opacity: 0.75;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;

  i {
    font-size: 0.9rem;
  }

  &:hover {
    background-color: var(--tx-fill-color);
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 2px;
  }
}

.AppList-ViewMenu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.AppList-ViewOption {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
  padding: 0.35rem 0.4rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-primary);
  font-family: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;

  i {
    flex: 0 0 auto;
    font-size: 0.9rem;
  }

  span {
    flex: 1 1 auto;
  }

  &:hover {
    background-color: var(--tx-fill-color);
  }

  &.active {
    color: var(--tx-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: -2px;
  }
}

.AppList-ViewOptionCheck {
  color: var(--tx-color-primary);
}
</style>
