<script lang="ts" setup>
import type {
  TxVersionChannelFilter,
  TxVersionHistoryEntry,
  TxVersionHistoryPanelProps,
} from './types'
import { computed, ref, watch } from 'vue'

defineOptions({ name: 'TxVersionHistoryPanel' })

const props = withDefaults(defineProps<TxVersionHistoryPanelProps>(), {
  title: 'Version history',
  latest: undefined,
  entries: () => [],
  latestLabel: 'LATEST',
  countLabel: undefined,
  notesLabel: 'What\'s new',
  emptyText: 'No releases published yet.',
  filters: undefined,
  filter: undefined,
  filterable: true,
  allFilterLabel: 'All',
})

const emit = defineEmits<{
  'select': [entry: TxVersionHistoryEntry]
  'update:filter': [value: string]
}>()

const resolvedFilters = computed<TxVersionChannelFilter[]>(() => {
  if (!props.filterable)
    return []

  if (props.filters?.length)
    return props.filters

  const allEntries: TxVersionHistoryEntry[] = [
    ...(props.latest ? [props.latest] : []),
    ...props.entries,
  ]
  const seen = new Map<string, string>()
  for (const entry of allEntries) {
    const raw = entry.channel?.trim()
    if (!raw)
      continue
    const key = raw.toLowerCase()
    if (!seen.has(key))
      seen.set(key, raw)
  }

  if (seen.size < 2)
    return []

  return [
    { value: 'all', label: props.allFilterLabel },
    ...Array.from(seen.entries()).map(([value, label]) => ({
      value,
      label: label.length <= 4 ? label : `${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}`,
    })),
  ]
})

const internalFilter = ref<string>(props.filter ?? resolvedFilters.value[0]?.value ?? 'all')

watch(
  resolvedFilters,
  (list) => {
    if (!list.length)
      return
    if (props.filter === undefined && !list.some(item => item.value === internalFilter.value)) {
      const next = list[0]!.value
      internalFilter.value = next
      emit('update:filter', next)
    }
  },
  { immediate: true },
)

const activeFilter = computed<string>({
  get: () => props.filter ?? internalFilter.value,
  set: (value) => {
    if (value === (props.filter ?? internalFilter.value))
      return
    internalFilter.value = value
    emit('update:filter', value)
  },
})

function matchesEntry(entry: TxVersionHistoryEntry): boolean {
  const current = activeFilter.value
  const hasExplicitFilter = props.filter !== undefined && props.filter !== ''
  if (!hasExplicitFilter && !resolvedFilters.value.length)
    return true
  if (!current)
    return true

  const spec = (props.filters ?? resolvedFilters.value).find(item => item.value === current)
  if (spec?.match)
    return spec.match(entry)
  if (current === 'all')
    return true

  const target = current.toLowerCase()
  const channel = entry.channel?.trim().toLowerCase()
  const tone = entry.tone?.toLowerCase()
  return channel === target || tone === target
}

const filteredLatest = computed(() => (props.latest && matchesEntry(props.latest) ? props.latest : undefined))
const filteredEntries = computed(() => props.entries.filter(matchesEntry))
const isEmpty = computed(() => !filteredLatest.value && !filteredEntries.value.length)

function toneClass(entry: TxVersionHistoryEntry) {
  return `tx-version-history-panel--${entry.tone ?? 'preview'}`
}
</script>

<template>
  <div class="tx-version-history-panel tx-vp">
    <header class="tx-vh-hd">
      <span class="tx-vh-ti">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
        {{ title }}
      </span>
      <span v-if="countLabel" class="tx-version-history-panel__count tx-vh-dt">{{ countLabel }}</span>
    </header>

    <div
      v-if="resolvedFilters.length"
      class="tx-vh-fs"
      role="tablist"
      aria-label="Filter releases by channel"
    >
      <button
        v-for="item in resolvedFilters"
        :key="item.value"
        type="button"
        role="tab"
        class="tx-version-history-panel__filter tx-vh-f"
        :class="{ 'is-active': activeFilter === item.value }"
        :aria-selected="activeFilter === item.value"
        @click="activeFilter = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="tx-vh-b">
      <p v-if="isEmpty" class="tx-version-history-panel__empty tx-vh-em">
        {{ emptyText }}
      </p>

      <component
        :is="filteredLatest.href ? 'a' : 'button'"
        v-if="filteredLatest"
        class="tx-version-history-panel__latest tx-vh-l"
        :class="toneClass(filteredLatest)"
        :href="filteredLatest.href"
        :type="filteredLatest.href ? undefined : 'button'"
        @click="emit('select', filteredLatest)"
      >
        <div class="tx-vh-lt">
          <span class="tx-vh-li">
            <span v-if="filteredLatest.channel" class="tx-vh-ch">{{ filteredLatest.channel }}</span>
            <span class="tx-version-history-panel__latest-tag tx-vh-ltag">{{ filteredLatest.tag }}</span>
          </span>
          <span class="tx-vh-lb">
            {{ latestLabel }}
          </span>
        </div>
        <p v-if="filteredLatest.note" class="tx-version-history-panel__latest-note tx-vh-ln">
          {{ filteredLatest.note }}
        </p>
        <div class="tx-vh-lf">
          <span v-if="filteredLatest.date" class="tx-vh-dt">{{ filteredLatest.date }}</span>
          <span class="tx-vh-nc">
            {{ notesLabel }}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </component>

      <component
        :is="entry.href ? 'a' : 'button'"
        v-for="entry in filteredEntries"
        :key="entry.id"
        class="tx-version-history-panel__row tx-vh-r"
        :class="toneClass(entry)"
        :href="entry.href"
        :type="entry.href ? undefined : 'button'"
        @click="emit('select', entry)"
      >
        <span class="tx-vh-rm">
          <span class="tx-vh-rd" aria-hidden="true" />
          <span class="tx-version-history-panel__row-tag tx-vh-rt">{{ entry.tag }}</span>
        </span>
        <span class="tx-vh-rme">
          <span v-if="entry.channel" class="tx-vh-rc">{{ entry.channel }}</span>
          <span v-if="entry.date" class="tx-vh-dt">{{ entry.date }}</span>
        </span>
      </component>
    </div>

    <div v-if="$slots.footer" class="tx-vp-ft">
      <slot name="footer" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-version-history-panel {
  &--stable { --tx-version-entry-tone: var(--tx-color-success); }
  &--preview { --tx-version-entry-tone: var(--tx-color-primary); }
  &--nightly { --tx-version-entry-tone: var(--tx-color-warning); }
  &--neutral { --tx-version-entry-tone: var(--_mu); }
}
.tx-vh-hd, .tx-vh-lt, .tx-vh-lf { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tx-vh-hd { padding: 13px 16px; border-bottom: 1px solid var(--tx-version-panel-border-color); }
.tx-vh-ti { display: inline-flex; align-items: center; gap: 7px; color: var(--_fg); font-size: 13.5px; font-weight: 680; svg { width: 14px; height: 14px; color: var(--_mu); } }
.tx-vh-dt { color: var(--_pl); font-size: 11.5px; }

.tx-vh-fs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding-bottom: 8px; }
.tx-vh-f {
  display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border: 1px solid transparent; border-radius: 6px;
  background: transparent; color: var(--_mu); font: inherit; font-size: 11px; font-weight: 500; line-height: 1; cursor: pointer;
  &:hover:not(.is-active) { background: var(--_fl); color: var(--_fg); }
  &.is-active { background: var(--_fl); border-color: var(--_bd); color: var(--_fg); font-weight: 600; }
}
.tx-vh-f:focus-visible, .tx-vh-l:focus-visible, .tx-vh-r:focus-visible { outline: 2px solid var(--tx-version-panel-accent); outline-offset: -2px; }

.tx-vh-b { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
.tx-vh-em { margin: 0; padding: 8px; color: var(--_mu); font-size: 12px; text-align: center; }

.tx-vh-l, .tx-vh-r { display: flex; width: 100%; box-sizing: border-box; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; }
.tx-vh-l {
  flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--_bd); border-radius: 8px; background: var(--_fl2); transition: background-color 0.16s, border-color 0.16s;
  &:hover { background: var(--_fl); border-color: var(--tx-border-color); .tx-vh-nc { color: var(--_fg); } }
}
.tx-vh-li, .tx-vh-rm, .tx-vh-rme { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.tx-vh-ch, .tx-vh-lb { flex: none; padding: 2px 6px; border-radius: 5px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }
.tx-vh-ch { background: var(--tx-fill-color); color: var(--_re); }
.tx-vh-lb { display: inline-flex; align-items: center; background: var(--tx-bg-color-overlay); border: 1px solid var(--_bd); color: var(--_mu); }
.tx-vh-ltag, .tx-vh-rt { font-family: ui-monospace, monospace; color: var(--_fg); }
.tx-vh-ltag { font-size: 13px; font-weight: 650; }
.tx-vh-ln { margin: 0; color: var(--_mu); font-size: 12px; line-height: 1.45; }
.tx-vh-nc { display: inline-flex; align-items: center; gap: 4px; color: var(--_re); font-size: 11.5px; font-weight: 500; svg { width: 12px; height: 12px; } }

.tx-vh-r {
  align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 0; border-radius: 7px; background: transparent;
  &:hover { background: var(--_fl); }
}
.tx-vh-rm { gap: 9px; }
.tx-vh-rd { width: 6px; height: 6px; flex: none; border-radius: 999px; background: var(--tx-version-entry-tone); }
.tx-vh-rt { font-size: 12.5px; font-weight: 500; }
.tx-vh-rme { gap: 8px; flex: none; }
.tx-vh-rc { color: var(--_mu); font-size: 10px; font-weight: 500; letter-spacing: 0.04em; }
</style>
