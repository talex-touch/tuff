<script lang="ts" setup>
import type { TxVersionCapsulePanel, TxVersionCapsuleProps } from './types'
import { computed, onBeforeUnmount, ref, useSlots, watch } from 'vue'

defineOptions({ name: 'TxVersionCapsule' })

const props = withDefaults(defineProps<TxVersionCapsuleProps>(), {
  channel: undefined,
  tone: 'preview',
  historyLabel: 'History',
  downloadLabel: 'Download this build',
  panel: undefined,
  disabled: false,
  closeOnClickOutside: true,
  closeOnEsc: true,
})

const emit = defineEmits<{
  'update:panel': [value: TxVersionCapsulePanel]
  'download': []
  'history': []
}>()

const rootRef = ref<HTMLElement | null>(null)
const downloadRef = ref<HTMLButtonElement | null>(null)
const historyRef = ref<HTMLButtonElement | null>(null)
const internalPanel = ref<TxVersionCapsulePanel>(null)

/**
 * `panel` is optional, so the capsule works both controlled and uncontrolled.
 * `undefined` means "the consumer is not driving this" — distinct from `null`,
 * which is a valid controlled value meaning "everything closed".
 */
const isControlled = computed(() => props.panel !== undefined)
const activePanel = computed<TxVersionCapsulePanel>({
  get: () => (isControlled.value ? props.panel! : internalPanel.value),
  set: (value) => {
    if (props.disabled && value)
      return
    const current = isControlled.value ? props.panel! : internalPanel.value
    if (current === value)
      return
    internalPanel.value = value
    emit('update:panel', value)
  },
})

/**
 * A segment whose panel slot is empty is a plain trigger: it still emits, but
 * opens nothing, so a host can wire it to its own dialog without the capsule
 * flashing an empty popover underneath.
 */
const slots = useSlots()

function hasPanel(target: Exclude<TxVersionCapsulePanel, null>) {
  return target === 'download' ? Boolean(slots.download) : Boolean(slots.history)
}

function toggle(target: Exclude<TxVersionCapsulePanel, null>) {
  if (props.disabled)
    return
  if (hasPanel(target))
    activePanel.value = activePanel.value === target ? null : target
  // Branched rather than `emit(target)` so each call resolves a single overload.
  if (target === 'download')
    emit('download')
  else
    emit('history')
}

/** Close and hand focus back to the segment that opened the panel. */
function close() {
  const previous = activePanel.value
  activePanel.value = null
  if (previous === 'download')
    downloadRef.value?.focus()
  else if (previous === 'history')
    historyRef.value?.focus()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!props.closeOnClickOutside)
    return
  const target = event.target as Node | null
  if (target && rootRef.value?.contains(target))
    return
  activePanel.value = null
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (props.closeOnEsc && event.key === 'Escape')
    close()
}

function bind() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
}

function unbind() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
}

watch(activePanel, (value) => {
  if (value)
    bind()
  else
    unbind()
})

// A capsule disabled while a panel is open would otherwise strand it.
watch(() => props.disabled, (disabled) => {
  if (disabled)
    activePanel.value = null
})

onBeforeUnmount(unbind)

defineExpose({ close, downloadRef, historyRef })
</script>

<template>
  <div
    ref="rootRef"
    class="tx-version-capsule"
    :class="[`tx-version-capsule--${tone}`, { 'is-disabled': disabled }]"
  >
    <div class="tx-version-capsule__bar">
      <button
        ref="downloadRef"
        type="button"
        class="tx-version-capsule__segment tx-version-capsule__segment--download"
        :class="{ 'is-open': activePanel === 'download' }"
        :disabled="disabled"
        :aria-label="downloadLabel"
        :aria-expanded="activePanel === 'download'"
        aria-haspopup="dialog"
        @click="toggle('download')"
      >
        <span class="tx-version-capsule__dot" aria-hidden="true" />
        <span v-if="channel" class="tx-version-capsule__channel">{{ channel }}</span>
        <span class="tx-version-capsule__version">{{ version }}</span>
        <svg
          class="tx-version-capsule__glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </button>

      <span class="tx-version-capsule__divider" aria-hidden="true" />

      <button
        ref="historyRef"
        type="button"
        class="tx-version-capsule__segment tx-version-capsule__segment--history"
        :class="{ 'is-open': activePanel === 'history' }"
        :disabled="disabled"
        :aria-expanded="activePanel === 'history'"
        aria-haspopup="dialog"
        @click="toggle('history')"
      >
        <span class="tx-version-capsule__history">{{ historyLabel }}</span>
        <svg
          class="tx-version-capsule__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>

    <Transition name="tx-version-capsule-panel">
      <div
        v-if="activePanel === 'download' && $slots.download"
        class="tx-version-capsule__panel tx-version-capsule__panel--start"
        role="dialog"
        :aria-label="downloadLabel"
      >
        <slot name="download" :close="close" />
      </div>
    </Transition>

    <Transition name="tx-version-capsule-panel">
      <div
        v-if="activePanel === 'history' && $slots.history"
        class="tx-version-capsule__panel tx-version-capsule__panel--end"
        role="dialog"
        :aria-label="historyLabel"
      >
        <slot name="history" :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.tx-version-capsule {
  --tx-version-capsule-height: 44px;
  --tx-version-capsule-bg: var(--tx-fill-color-light);
  --tx-version-capsule-border-color: var(--tx-border-color);
  --tx-version-capsule-padding: 0 16px;
  --tx-version-capsule-gap: 9px;
  --tx-version-capsule-font-size: var(--tx-font-size-base, 14px);
  --tx-version-capsule-tone: var(--tx-color-primary);
  --tx-version-capsule-accent: var(--tx-color-primary);
  --tx-version-capsule-panel-offset: 10px;
  --tx-version-capsule-panel-width: 394px;

  position: relative;
  display: inline-flex;
}

.tx-version-capsule--stable {
  --tx-version-capsule-tone: var(--tx-color-success);
}

.tx-version-capsule--nightly {
  --tx-version-capsule-tone: var(--tx-color-warning);
}

.tx-version-capsule--neutral {
  --tx-version-capsule-tone: var(--tx-text-color-secondary);
}

.tx-version-capsule__bar {
  display: inline-flex;
  align-items: stretch;
  height: var(--tx-version-capsule-height);
  border: 1px solid var(--tx-version-capsule-border-color);
  border-radius: 999px;
  background: var(--tx-version-capsule-bg);
  overflow: hidden;
  transition:
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    transform var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-capsule__segment {
  display: inline-flex;
  align-items: center;
  gap: var(--tx-version-capsule-gap);
  padding: var(--tx-version-capsule-padding);
  border: 0;
  background: transparent;
  color: var(--tx-text-color-primary);
  font: inherit;
  font-size: var(--tx-version-capsule-font-size);
  cursor: pointer;
  transition: background-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-capsule__segment:hover,
.tx-version-capsule__segment.is-open {
  background: color-mix(in srgb, var(--tx-version-capsule-accent) 16%, transparent);
}

.tx-version-capsule__segment:focus-visible {
  outline: 2px solid var(--tx-version-capsule-accent);
  outline-offset: -2px;
}

.tx-version-capsule__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tx-version-capsule-tone);
  box-shadow: 0 0 10px color-mix(in srgb, var(--tx-version-capsule-tone) 70%, transparent);
}

.tx-version-capsule__channel {
  color: var(--tx-version-capsule-tone);
  font-size: calc(var(--tx-version-capsule-font-size) - 3px);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tx-version-capsule__version {
  font-weight: 680;
}

.tx-version-capsule__glyph,
.tx-version-capsule__chevron {
  width: calc(var(--tx-version-capsule-font-size) + 2px);
  height: calc(var(--tx-version-capsule-font-size) + 2px);
  flex: none;
}

.tx-version-capsule__glyph {
  color: var(--tx-text-color-secondary);
  transition: color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-capsule__segment--download:hover .tx-version-capsule__glyph,
.tx-version-capsule__segment--download.is-open .tx-version-capsule__glyph {
  color: var(--tx-version-capsule-accent);
}

.tx-version-capsule__divider {
  width: 1px;
  flex: none;
  background: var(--tx-version-capsule-border-color);
}

.tx-version-capsule__history {
  color: var(--tx-version-capsule-accent);
  font-weight: 620;
}

.tx-version-capsule__chevron {
  color: var(--tx-version-capsule-accent);
  transition: transform var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-capsule__segment--history.is-open .tx-version-capsule__chevron {
  transform: rotate(180deg);
}

.tx-version-capsule.is-disabled .tx-version-capsule__segment {
  cursor: not-allowed;
  opacity: 0.5;
}

.tx-version-capsule.is-disabled .tx-version-capsule__segment:hover {
  background: transparent;
}

.tx-version-capsule__panel {
  position: absolute;
  top: calc(100% + var(--tx-version-capsule-panel-offset));
  z-index: var(--tx-index-popper, 2000);
  width: var(--tx-version-capsule-panel-width);
  max-width: min(var(--tx-version-capsule-panel-width), calc(100vw - 32px));
  text-align: left;
}

.tx-version-capsule__panel--start {
  left: 0;
}

.tx-version-capsule__panel--end {
  right: 0;
}

.tx-version-capsule-panel-enter-active,
.tx-version-capsule-panel-leave-active {
  transition:
    opacity var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    transform var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-capsule-panel-enter-from,
.tx-version-capsule-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .tx-version-capsule__bar,
  .tx-version-capsule__segment,
  .tx-version-capsule__glyph,
  .tx-version-capsule__chevron,
  .tx-version-capsule-panel-enter-active,
  .tx-version-capsule-panel-leave-active {
    transition: none;
  }
}
</style>
