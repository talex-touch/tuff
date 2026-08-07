<script setup lang="ts">
import type { TxIconSource } from '../../icon'
import type { CommandPaletteEmits, CommandPaletteItem, CommandPaletteProps } from './types'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import { TxIcon } from '../../icon'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({ name: 'TxCommandPalette' })

const props = withDefaults(defineProps<CommandPaletteProps>(), {
  commands: () => [],
  placeholder: 'Search commands',
  emptyText: 'No commands found',
  maxHeight: 320,
  autoFocus: true,
  closeOnSelect: true,
  ariaLabel: 'Command palette',
})

const emit = defineEmits<CommandPaletteEmits>()

const inputRef = ref<HTMLInputElement | null>(null)
const overlayRef = ref<HTMLElement | null>(null)
const query = ref(props.query ?? '')

// `update:query` was emitted with no matching prop, so v-model:query could only
// ever be write-only. Accepting the prop closes the pair; leaving it undefined
// keeps the palette uncontrolled.
watch(
  () => props.query,
  (next) => {
    if (next !== undefined && next !== query.value)
      query.value = next
  },
)
const activeIndex = ref(0)
const zIndex = ref(zIndexAllocator.get())
const composing = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const filteredCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return props.commands
  return props.commands.filter((cmd) => {
    const haystack = [
      cmd.title,
      cmd.description ?? '',
      ...(cmd.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

const listId = useId()
// aria-activedescendant lets the combobox point at the highlighted option while DOM
// focus stays in the input, so screen readers announce each command as the user
// moves through the (already-implemented) active-index navigation.
const activeOptionId = computed(() =>
  filteredCommands.value.length ? `${listId}-opt-${activeIndex.value}` : undefined,
)

function firstEnabledIndex() {
  const idx = filteredCommands.value.findIndex(cmd => !cmd.disabled)
  return idx === -1 ? 0 : idx
}

// Arrow navigation skips disabled commands so the highlight never parks on an
// unselectable row (where Enter would silently do nothing).
function moveActive(delta: number) {
  const list = filteredCommands.value
  const n = list.length
  if (!n)
    return
  let next = activeIndex.value
  for (let i = 0; i < n; i++) {
    next = (next + delta + n) % n
    if (!list[next]?.disabled) {
      activeIndex.value = next
      return
    }
  }
  // Every command is disabled — leave the highlight where it is.
}

watch(
  () => props.modelValue,
  async (v, oldValue) => {
    if (v) {
      zIndex.value = zIndexAllocator.next()
      emit('open')
      activeIndex.value = firstEnabledIndex()
      await nextTick()
      if (props.autoFocus)
        inputRef.value?.focus()
      return
    }
    if (oldValue !== undefined)
      emit('close')
    // Mirror the reset to v-model:query listeners; onInput is the only other writer
    // and it always emits, so a close must too or the parent keeps the stale string.
    if (query.value !== '')
      emit('update:query', '')
    query.value = ''
    activeIndex.value = 0
  },
  { immediate: true },
)

watch(
  filteredCommands,
  () => {
    activeIndex.value = firstEnabledIndex()
  },
)

function close() {
  visible.value = false
}

function selectItem(item: CommandPaletteItem) {
  if (item.disabled)
    return
  emit('select', item)
  if (props.closeOnSelect)
    close()
}

/**
 * aria-modal="true" promises the background is inert, so Tab must cycle inside
 * the dialog. Mirrors TxModal/TxDrawer, which both implement this already.
 */
function trapFocus(event: KeyboardEvent): void {
  const root = overlayRef.value
  if (!root)
    return

  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]',
    ),
    // The options are real <button>s held out of the tab order with
    // tabindex="-1", so the selector alone is not enough — a tag-based match
    // would hand Tab straight back to them.
  ).filter(el => el.tabIndex >= 0)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    event.preventDefault()
    inputRef.value?.focus()
    return
  }

  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || active === root) {
      event.preventDefault()
      last.focus()
    }
  }
  else if (active === last) {
    event.preventDefault()
    first.focus()
  }
}

function onInput(value: string) {
  query.value = value
  emit('update:query', value)
}

function resolveIcon(icon?: CommandPaletteItem['icon']): TxIconSource | undefined {
  if (!icon)
    return undefined
  if (typeof icon === 'string') {
    return { type: 'class', value: icon }
  }
  return icon
}

function normalizeSegments(value: string) {
  return value
    .split(/\s+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

function getHighlightedParts(text: string) {
  if (!text)
    return [{ text, highlighted: false }]
  const tokens = normalizeSegments(query.value)
  if (!tokens.length)
    return [{ text, highlighted: false }]
  const lowerText = text.toLowerCase()
  const ranges: Array<{ start: number, end: number }> = []

  for (const token of tokens) {
    let from = 0
    while (from < lowerText.length) {
      const index = lowerText.indexOf(token, from)
      if (index === -1)
        break
      ranges.push({ start: index, end: index + token.length })
      from = index + token.length
    }
  }

  if (!ranges.length)
    return [{ text, highlighted: false }]

  ranges.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number, end: number }> = []
  for (const range of ranges) {
    const current = merged[merged.length - 1]
    if (!current || range.start > current.end) {
      merged.push({ ...range })
      continue
    }
    current.end = Math.max(current.end, range.end)
  }

  const parts: Array<{ text: string, highlighted: boolean }> = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) {
      parts.push({
        text: text.slice(cursor, range.start),
        highlighted: false,
      })
    }
    parts.push({
      text: text.slice(range.start, range.end),
      highlighted: true,
    })
    cursor = range.end
  }
  if (cursor < text.length) {
    parts.push({
      text: text.slice(cursor),
      highlighted: false,
    })
  }
  return parts
}

function onCompositionStart() {
  composing.value = true
}

function onCompositionEnd() {
  composing.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229 || composing.value)
    return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (!filteredCommands.value.length)
    return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveActive(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveActive(-1)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const current = filteredCommands.value[activeIndex.value]
    if (current)
      selectItem(current)
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="tx-command-palette">
      <div
        v-if="visible"
        class="tx-command-palette__overlay"
        :class="overlayClass"
        :style="{ zIndex }"
        ref="overlayRef"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
        @click.self="close"
        @keydown.tab="trapFocus"
      >
        <div
          class="tx-command-palette__panel"
          :class="panelClass"
          :style="{ '--tx-command-palette-max': `${maxHeight}px` }"
        >
          <div class="tx-command-palette__search">
            <span class="tx-command-palette__search-icon" aria-hidden="true">
              <TxIcon :icon="{ type: 'builtin', value: 'search' }" :size="16" />
            </span>
            <input
              ref="inputRef"
              class="tx-command-palette__input"
              :value="query"
              :placeholder="placeholder"
              role="combobox"
              :aria-label="placeholder"
              aria-expanded="true"
              :aria-controls="listId"
              :aria-activedescendant="activeOptionId"
              @input="(e) => onInput((e.target as HTMLInputElement).value)"
              @keydown="onKeydown"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd"
            >
          </div>

          <div :id="listId" class="tx-command-palette__list" role="listbox" :aria-label="ariaLabel">
            <button
              v-for="(cmd, index) in filteredCommands"
              :id="`${listId}-opt-${index}`"
              :key="cmd.id"
              type="button"
              class="tx-command-palette__item"
              role="option"
              :aria-selected="index === activeIndex"
              :aria-disabled="cmd.disabled || undefined"
              tabindex="-1"
              :class="{
                'is-active': index === activeIndex,
                'is-disabled': cmd.disabled,
              }"
              @click="selectItem(cmd)"
            >
              <span v-if="cmd.icon" class="tx-command-palette__icon" aria-hidden="true">
                <TxIcon :icon="resolveIcon(cmd.icon)" :size="16" />
              </span>
              <span class="tx-command-palette__content">
                <span class="tx-command-palette__title">
                  <template v-for="(part, partIndex) in getHighlightedParts(cmd.title)" :key="`${cmd.id}-title-${partIndex}`">
                    <mark v-if="part.highlighted" class="tx-command-palette__highlight">{{ part.text }}</mark>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </span>
                <span v-if="cmd.description" class="tx-command-palette__desc">
                  <template v-for="(part, partIndex) in getHighlightedParts(cmd.description)" :key="`${cmd.id}-desc-${partIndex}`">
                    <mark v-if="part.highlighted" class="tx-command-palette__highlight">{{ part.text }}</mark>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </span>
              </span>
              <span v-if="cmd.shortcut" class="tx-command-palette__shortcut">{{ cmd.shortcut }}</span>
            </button>

            <div v-if="!filteredCommands.length" class="tx-command-palette__empty">
              <slot name="empty" :query="query" :empty-text="emptyText">
                {{ emptyText }}
              </slot>
            </div>
          </div>

          <slot name="footer" :query="query" :visible-count="filteredCommands.length" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.tx-command-palette__overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 24px;
}

.tx-command-palette__panel {
  width: min(90vw, 560px);
  background: var(--tx-bg-color, #fff);
  border-radius: 18px;
  box-shadow: 0 20px 70px rgba(15, 23, 42, 0.28);
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #e5e7eb) 50%, transparent);
  overflow: hidden;
}

.tx-command-palette__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-command-palette__search-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-command-palette__input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
}

.tx-command-palette__list {
  max-height: var(--tx-command-palette-max, 320px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.tx-command-palette__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  text-align: left;
  border-radius: 12px;
  padding: 10px 12px;
  background: transparent;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);
  transition: background 160ms ease, color 160ms ease;
}

.tx-command-palette__item.is-active {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-command-palette__item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tx-command-palette__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-command-palette__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.tx-command-palette__title {
  font-size: 14px;
  font-weight: 600;
}

.tx-command-palette__desc {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-command-palette__highlight {
  padding: 0;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
  color: inherit;
  border-radius: 3px;
}

.tx-command-palette__shortcut {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #909399);
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  padding: 2px 6px;
  border-radius: 8px;
}

.tx-command-palette__empty {
  padding: 16px;
  text-align: center;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.tx-command-palette-enter-active,
.tx-command-palette-leave-active {
  transition: opacity 0.34s cubic-bezier(0.2, 0, 0, 1);
}

.tx-command-palette-enter-from,
.tx-command-palette-leave-to {
  opacity: 0;
}
</style>
