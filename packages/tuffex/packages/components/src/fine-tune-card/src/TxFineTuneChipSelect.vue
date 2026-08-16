<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// The chip-sized picker in the card footer. Upstream is a bare toggle button
// plus a div of buttons: no roles, no keyboard, and it stays open on Escape and
// on a click anywhere else. All four are added here — the visuals are the same.

import type { FineTuneChipSelectEmits, FineTuneChipSelectProps } from './types'
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({ name: 'TxFineTuneChipSelect' })

const props = withDefaults(defineProps<FineTuneChipSelectProps>(), {
  placeholder: 'Select',
  ariaLabel: undefined,
  disabled: false,
})

const emit = defineEmits<FineTuneChipSelectEmits>()

const uid = getCurrentInstance()?.uid ?? 0
const listboxId = `tx-bui-chip-select-${uid}-listbox`
const optionId = (index: number) => `tx-bui-chip-select-${uid}-option-${index}`

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)

const selectedIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label)

function onDocumentPointerDown(event: PointerEvent): void {
  if (!rootRef.value?.contains(event.target as Node))
    close(false)
}

function openMenu(): void {
  if (props.disabled || open.value)
    return
  open.value = true
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
}

function close(restoreFocus: boolean): void {
  if (!open.value)
    return
  open.value = false
  activeIndex.value = -1
  if (restoreFocus)
    triggerRef.value?.focus()
}

function toggle(): void {
  if (open.value)
    close(false)
  else
    openMenu()
}

function select(index: number): void {
  const option = props.options[index]
  if (!option)
    return
  emit('update:modelValue', option.value)
  close(true)
}

function move(delta: number): void {
  const total = props.options.length
  if (total === 0)
    return
  const from = activeIndex.value < 0 ? (delta > 0 ? -1 : 0) : activeIndex.value
  activeIndex.value = ((from + delta) % total + total) % total
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled)
    return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (!open.value)
        openMenu()
      else
        move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!open.value)
        openMenu()
      else
        move(-1)
      break
    case 'Home':
      if (open.value) {
        event.preventDefault()
        activeIndex.value = 0
      }
      break
    case 'End':
      if (open.value) {
        event.preventDefault()
        activeIndex.value = props.options.length - 1
      }
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (open.value)
        select(activeIndex.value)
      else
        openMenu()
      break
    case 'Escape':
      if (open.value) {
        event.preventDefault()
        close(true)
      }
      break
    case 'Tab':
      close(false)
      break
    default:
  }
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !rootRef.value?.contains(next))
    close(false)
}

watch(open, (isOpen) => {
  if (typeof document === 'undefined')
    return
  if (isOpen)
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
  else
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined')
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <div ref="rootRef" class="tx-bui-chip-select" @focusout="onFocusOut">
    <button
      ref="triggerRef"
      type="button"
      class="tx-bui-chip-select__trigger"
      :class="{ 'is-open': open, 'is-placeholder': selectedIndex < 0 }"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @click="toggle"
      @keydown="onKeyDown"
    >
      <span class="tx-bui-chip-select__value">{{ selectedLabel ?? placeholder }}</span>
      <svg
        class="tx-bui-chip-select__chevron"
        width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <ul v-if="open" :id="listboxId" class="tx-bui-chip-select__menu" role="listbox">
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.value"
        class="tx-bui-chip-select__option"
        :class="{
          'is-selected': option.value === modelValue,
          'is-active': index === activeIndex,
        }"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="select(index)"
        @pointerenter="activeIndex = index"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;

.tx-bui-chip-select {
  position: relative;
  width: 100%;
}

.tx-bui-chip-select__trigger {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 26px;
  padding: 4px 4px 4px 8px;
  cursor: pointer;
  background: var(--tx-bui-inset, #f7f8f9);
  border-radius: var(--tx-bui-radius-chip, 6px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  transition: box-shadow 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &.is-open,
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 1px var(--tx-bui-accent, #0285ff);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-chip-select__value {
  overflow: hidden;
  font-size: 12px;
  color: var(--tx-bui-ink, #1f2124);
  text-overflow: ellipsis;
  white-space: nowrap;

  .tx-bui-chip-select__trigger.is-placeholder & {
    color: var(--tx-bui-ink-3, #9a9da3);
  }
}

.tx-bui-chip-select__chevron {
  flex-shrink: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  transition: transform 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  .tx-bui-chip-select__trigger.is-open & {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-chip-select__menu {
  @include bui-pop-in(200ms);

  position: absolute;
  right: 0;
  // Opens upward: the card sits at the bottom of an inspector column, so a
  // downward menu would fall off the panel.
  bottom: 32px;
  z-index: 10;
  width: 100%;
  padding: 4px;
  background: var(--tx-bui-surface, #fff);
  border-radius: 10px;
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 0 2px 10px #0000000b);
  transform-origin: bottom right;
}

.tx-bui-chip-select__option {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 8px;
  font-size: 12.5px;
  color: var(--tx-bui-ink, #1f2124);
  cursor: pointer;
  border-radius: var(--tx-bui-radius-chip, 6px);
  transition: background-color 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &.is-selected {
    background: var(--tx-bui-field, #f2f2f3);
  }

  // The keyboard cursor: focus stays on the trigger, so the active option has
  // to read differently from the selected one.
  &.is-active {
    background: var(--tx-bui-hover-2, #e7e9eb);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
