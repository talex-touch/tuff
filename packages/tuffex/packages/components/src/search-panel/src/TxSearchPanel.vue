<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { SearchPanelEmits, SearchPanelItem, SearchPanelProps } from './types'
import { computed, ref, useId, watch } from 'vue'
import { TxSearchEmpty } from '../../search-empty'

defineOptions({ name: 'TxSearchPanel' })

const props = withDefaults(defineProps<SearchPanelProps>(), {
  modelValue: '',
  items: () => [],
  placeholder: 'Search',
  idleCount: 5,
  emptyThreshold: 3,
  emptyTitle: 'No results found',
  emptyDescription: 'Adjust your search to try again',
  clearLabel: 'Clear search',
  listLabel: 'Search results',
  minHeight: 248,
  clearable: true,
  disabled: false,
})

const emit = defineEmits<SearchPanelEmits>()

defineSlots<{
  /** Replaces a result row's contents. */
  item?: (props: { item: SearchPanelItem, active: boolean, query: string }) => any
  /** Replaces the empty state. */
  empty?: (props: { query: string }) => any
  /** Appended below the list, inside the card. */
  footer?: () => any
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)
const composing = ref(false)
const uid = useId()
const listId = computed(() => `${uid}-list`)

const query = computed(() => props.modelValue ?? '')

function defaultFilter(items: SearchPanelItem[], value: string) {
  const needle = value.trim().toLowerCase()
  if (!needle)
    return items
  return items.filter(item =>
    [item.label, ...(item.keywords ?? [])].join(' ').toLowerCase().includes(needle),
  )
}

const results = computed(() => {
  if (!query.value) {
    // Upstream shows the first five with an empty query: a shortlist reads as a
    // starting point, a full dump reads as a wall.
    return props.idleCount > 0 ? props.items.slice(0, props.idleCount) : props.items
  }
  return (props.filter ?? defaultFilter)(props.items, query.value)
})

const showEmpty = computed(() => query.value.length >= props.emptyThreshold && results.value.length === 0)

const activeOptionId = computed(() =>
  results.value.length ? `${uid}-opt-${activeIndex.value}` : undefined,
)

function firstEnabledIndex() {
  const index = results.value.findIndex(item => !item.disabled)
  return index === -1 ? 0 : index
}

// Arrow navigation steps over disabled rows so the highlight never parks
// somewhere Enter would silently do nothing.
function moveActive(delta: number) {
  const list = results.value
  const count = list.length
  if (!count)
    return
  let next = activeIndex.value
  for (let i = 0; i < count; i++) {
    next = (next + delta + count) % count
    if (!list[next]?.disabled) {
      activeIndex.value = next
      return
    }
  }
}

function moveToEdge(edge: 'start' | 'end') {
  const list = results.value
  if (!list.length)
    return
  if (edge === 'start') {
    activeIndex.value = firstEnabledIndex()
    return
  }
  const last = list.length - 1
  activeIndex.value = last
  if (list[last]?.disabled)
    moveActive(-1)
}

function onHover(index: number, item: SearchPanelItem) {
  if (!item.disabled)
    activeIndex.value = index
}

watch(results, () => {
  activeIndex.value = firstEnabledIndex()
})

function setQuery(value: string) {
  emit('update:modelValue', value)
  emit('queryChange', value)
}

function onInput(event: Event) {
  setQuery((event.target as HTMLInputElement).value)
}

function onClear() {
  if (!query.value)
    return
  setQuery('')
  emit('clear')
  inputRef.value?.focus()
}

function selectItem(item: SearchPanelItem) {
  if (item.disabled)
    return
  // Upstream writes the result back into the field. That is demo behaviour: a
  // command list wants to run the command, not rename the query. The host owns
  // the outcome; the panel only reports it.
  emit('select', item)
}

function onKeydown(event: KeyboardEvent) {
  // An IME's Enter commits the candidate — it must not also pick a result.
  if (event.isComposing || event.keyCode === 229 || composing.value)
    return

  if (event.key === 'Escape') {
    if (!query.value)
      return
    event.preventDefault()
    onClear()
    return
  }

  if (!results.value.length)
    return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      event.preventDefault()
      moveToEdge('start')
      break
    case 'End':
      event.preventDefault()
      moveToEdge('end')
      break
    case 'Enter': {
      event.preventDefault()
      const current = results.value[activeIndex.value]
      if (current)
        selectItem(current)
      break
    }
  }
}

const rootStyle = computed(() => ({
  '--tx-bui-search-panel-min-height':
    typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight,
}))

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  clear: onClear,
})
</script>

<template>
  <div class="tx-bui-search-panel" :style="rootStyle">
    <div class="tx-bui-search-panel__card">
      <div class="tx-bui-search-panel__field" :class="{ 'is-disabled': disabled }">
        <svg
          class="tx-bui-search-panel__field-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref="inputRef"
          class="tx-bui-search-panel__input"
          type="text"
          autocomplete="off"
          :value="query"
          :placeholder="placeholder"
          :disabled="disabled"
          :aria-label="ariaLabel || placeholder"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="!showEmpty && results.length > 0"
          :aria-controls="listId"
          :aria-activedescendant="showEmpty ? undefined : activeOptionId"
          @input="onInput"
          @keydown="onKeydown"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        >
        <button
          v-if="clearable && query && !disabled"
          type="button"
          class="tx-bui-search-panel__clear"
          :aria-label="clearLabel"
          @click="onClear"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div v-if="showEmpty" class="tx-bui-search-panel__empty">
        <slot name="empty" :query="query">
          <TxSearchEmpty :title="emptyTitle" :description="emptyDescription">
            <template #icon>
              <span class="tx-bui-search-panel__empty-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </span>
            </template>
          </TxSearchEmpty>
        </slot>
      </div>

      <div
        v-else
        :id="listId"
        class="tx-bui-search-panel__list"
        role="listbox"
        :aria-label="listLabel"
      >
        <button
          v-for="(item, index) in results"
          :id="`${uid}-opt-${index}`"
          :key="item.id"
          type="button"
          class="tx-bui-search-panel__option"
          :class="{ 'is-active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          :aria-disabled="item.disabled || undefined"
          tabindex="-1"
          @click="selectItem(item)"
          @mousemove="onHover(index, item)"
        >
          <slot name="item" :item="item" :active="index === activeIndex" :query="query">
            {{ item.label }}
          </slot>
        </button>
      </div>

      <slot name="footer" />
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-in;

.tx-bui-search-panel {
  @include bui-scope;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: var(--tx-bui-search-panel-max-width, 288px);
  // Reserving the height keeps the page still while the list grows and shrinks.
  min-height: var(--tx-bui-search-panel-min-height, 248px);

  &__card {
    align-self: flex-start;
    width: 100%;
    overflow: hidden;
    background: var(--tx-bui-surface, #fff);
    border-radius: var(--tx-bui-radius-card, 10px);
    box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 0 2px 10px #0000000b);
  }

  &__field {
    display: flex;
    gap: 8px;
    align-items: center;
    height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid var(--tx-bui-line, #ecedef);
    transition: background-color 100ms ease;

    &:hover:not(.is-disabled) {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:focus-within {
      background: transparent;
    }

    &.is-disabled {
      opacity: 0.6;
    }
  }

  &__field-icon {
    flex-shrink: 0;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  &__input {
    flex: 1;
    min-width: 0;
    padding: 0;
    font: inherit;
    font-size: 13px;
    color: var(--tx-bui-ink, #1f2124);
    background: transparent;
    border: 0;
    outline: none;

    &::placeholder {
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }

  &__clear {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    border-radius: 999px;
    transition:
      background-color 100ms ease,
      color 100ms ease;
    animation: tx-bui-fade-in 150ms ease-out both;

    &:hover {
      color: var(--tx-bui-ink, #1f2124);
      background: color-mix(in oklab, var(--tx-bui-line, #ecedef) 70%, transparent);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 1px;
    }
  }

  &__list {
    padding: 4px;
  }

  &__option {
    display: flex;
    align-items: center;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    overflow: hidden;
    font-size: 13px;
    color: var(--tx-bui-ink, #1f2124);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 100ms ease;
    animation: tx-bui-fade-in 200ms ease-out both;

    // Focus stays in the combobox, so the highlight is `is-active`, not
    // `:focus` — `:hover` alone would leave keyboard users with no cursor.
    &.is-active {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &[aria-disabled='true'] {
      color: var(--tx-bui-ink-3, #9a9da3);
      cursor: not-allowed;
    }
  }

  // TxSearchEmpty is retuned through its documented CSS variables rather than
  // by reaching into its internals: BUI runs denser and reads from the `bui`
  // ramp. Its animated 64px illustration is replaced through the `icon` slot.
  &__empty {
    --tx-empty-state-padding: 32px 16px;
    --tx-empty-state-gap: 6px;
    --tx-empty-state-title-size: 13px;
    --tx-empty-state-desc-size: 12px;
    --tx-text-color-primary: var(--tx-bui-ink, #1f2124);
    --tx-text-color-secondary: var(--tx-bui-ink-3, #9a9da3);

    animation: tx-bui-fade-in 250ms ease-out both;
  }

  &__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--tx-bui-ink-3, #9a9da3);
    background: var(--tx-bui-inset, #f7f8f9);
    border-radius: var(--tx-bui-radius-control, 8px);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  }

  @media (prefers-reduced-motion: reduce) {
    &__field,
    &__clear,
    &__option {
      transition: none;
    }

    &__clear,
    &__option,
    &__empty {
      animation: none;
    }
  }
}
</style>
