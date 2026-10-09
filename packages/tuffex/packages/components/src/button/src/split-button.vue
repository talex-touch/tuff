<script setup lang="ts">
import type { SplitButtonEmits, SplitButtonProps } from './split-button'
import { resolveButtonSize } from './size'
import { computed, onBeforeUnmount, ref, useSlots, watch } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import Spinner from '../../spinner'

defineOptions({ name: 'TxSplitButton' })

const props = withDefaults(defineProps<SplitButtonProps>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  icon: undefined,
  // No class by default: the trigger draws its own glyph, because an icon
  // class only renders if the host's UnoCSS has that collection (Nexus has no
  // `ri`, so `i-ri-more-2-line` was a blank trigger there).
  menuIcon: undefined,
  menuDisabled: false,
  menuWidth: 200,
  menuPlacement: 'bottom-end',
  menuOffset: 8,
})

const emit = defineEmits<SplitButtonEmits>()

const open = ref(false)
const slots = useSlots()

watch(open, v => emit('menuOpenChange', v))

const hasMenu = computed(() => !!slots.menu)

const normalizedSize = computed(() => resolveButtonSize(props.size))

const classList = computed(() => {
  return [
    `variant-${props.variant}`,
    `tx-size-${normalizedSize.value}`,
    {
      'is-disabled': props.disabled,
      'is-loading': props.loading,
      'has-menu': hasMenu.value,
    },
  ]
})

const interactiveDisabled = computed(() => props.disabled || props.loading)
const menuDisabled = computed(() => interactiveDisabled.value || props.menuDisabled)
const ignoreNextMenuClick = ref(false)
let menuClickGuardTimer: ReturnType<typeof setTimeout> | null = null
let watchingRelease = false

/**
 * How long after the release a press may still be waiting for its click. A
 * click that arrives consumes the guard at once; this only expires a press
 * that never produces one (released off the trigger). It has to outlast the
 * gap between pointerup and click, which on touch can be a separate task.
 */
const ABANDONED_PRESS_MS = 400

function stopWatchingRelease() {
  if (!watchingRelease)
    return
  watchingRelease = false
  window.removeEventListener('pointerup', handlePressEnd, true)
  window.removeEventListener('pointercancel', handlePressEnd, true)
}

function clearMenuClickGuard() {
  ignoreNextMenuClick.value = false
  stopWatchingRelease()
  if (menuClickGuardTimer != null) {
    clearTimeout(menuClickGuardTimer)
    menuClickGuardTimer = null
  }
}

function handlePressEnd() {
  stopWatchingRelease()
  if (menuClickGuardTimer != null)
    clearTimeout(menuClickGuardTimer)
  menuClickGuardTimer = setTimeout(clearMenuClickGuard, ABANDONED_PRESS_MS)
}

function handlePrimaryClick(event: MouseEvent) {
  if (interactiveDisabled.value)
    return
  emit('click', event)
}

function toggleMenu() {
  if (menuDisabled.value)
    return
  open.value = !open.value
}

function handleMenuPointerDown() {
  if (menuDisabled.value)
    return
  // Toggle on pointerdown for snappy feedback, then swallow the click the
  // browser fires from this same press.
  ignoreNextMenuClick.value = true
  if (menuClickGuardTimer != null) {
    clearTimeout(menuClickGuardTimer)
    menuClickGuardTimer = null
  }
  // The guard lives until the press ends, not until the next tick: that click
  // only comes after pointerup, so a 0ms reset let it toggle the menu shut
  // again and a plain click never opened it — only a long press showed it.
  if (!watchingRelease) {
    watchingRelease = true
    window.addEventListener('pointerup', handlePressEnd, true)
    window.addEventListener('pointercancel', handlePressEnd, true)
  }
  toggleMenu()
}

function handleMenuClick() {
  if (ignoreNextMenuClick.value) {
    clearMenuClickGuard()
    return
  }
  toggleMenu()
}

function closeMenu() {
  open.value = false
}

onBeforeUnmount(clearMenuClickGuard)
</script>

<template>
  <div
    class="tx-split-button"
    :class="classList"
    :aria-disabled="interactiveDisabled || undefined"
    :aria-busy="loading || undefined"
  >
    <button
      class="tx-split-button__primary"
      :disabled="interactiveDisabled"
      type="button"
      @click="handlePrimaryClick"
    >
      <span class="tx-split-button__inner">
        <span class="tx-split-button__spinner-slot" :class="{ 'is-visible': loading }">
          <Spinner class="tx-split-button__spinner" :visible="loading" :size="16" />
        </span>
        <i v-if="icon && !loading" class="tx-split-button__icon" :class="icon" />
        <span class="tx-split-button__label">
          <slot />
        </span>
      </span>
    </button>

    <template v-if="hasMenu">
      <TxPopover
        v-model="open"
        :disabled="menuDisabled"
        :placement="menuPlacement"
        :offset="menuOffset"
        :width="menuWidth"
        :toggle-on-reference-click="false"
      >
        <template #reference>
          <button
            class="tx-split-button__menu"
            :disabled="menuDisabled"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="open || undefined"
            @pointerdown="handleMenuPointerDown"
            @click="handleMenuClick"
            @keydown.enter.prevent="toggleMenu"
            @keydown.space.prevent="toggleMenu"
          >
            <slot name="menu-icon">
              <i v-if="menuIcon" class="tx-split-button__menu-icon" :class="menuIcon" />
              <!-- Remix `more-2-line`'s glyph, drawn here so it needs no icon collection -->
              <svg
                v-else
                class="tx-split-button__menu-icon tx-split-button__menu-glyph"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </slot>
          </button>
        </template>

        <slot name="menu" :close="closeMenu" />
      </TxPopover>
    </template>
  </div>
</template>
