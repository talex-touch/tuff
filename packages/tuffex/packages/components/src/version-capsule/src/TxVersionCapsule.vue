<script lang="ts" setup>
import type { TxVersionCapsulePanel, TxVersionCapsuleProps } from './types'
import { computed, ref, useSlots, watch } from 'vue'
import { useMorphWindow } from '../../../../utils/use-morph-window'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'
import TxPopover from '../../popover/src/TxPopover.vue'

defineOptions({ name: 'TxVersionCapsule' })

const props = withDefaults(defineProps<TxVersionCapsuleProps>(), {
  channel: undefined,
  tone: 'preview',
  historyLabel: 'History',
  showHistoryLabel: false,
  downloadLabel: 'Download this build',
  viewMoreLabel: 'View more',
  backLabel: 'Back',
  showViewMore: true,
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

const downloadRef = ref<HTMLButtonElement | null>(null)
const historyRef = ref<HTMLButtonElement | null>(null)
const autoSizerRef = ref<InstanceType<typeof TxAutoSizer> | null>(null)
const internalPanel = ref<TxVersionCapsulePanel>(null)
const slideDirection = ref<'none' | 'forward' | 'backward'>('none')

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
    if (current === 'download' && value === 'history')
      slideDirection.value = 'forward'
    else if (current === 'history' && value === 'download')
      slideDirection.value = 'backward'
    else
      slideDirection.value = 'none'
    internalPanel.value = value
    emit('update:panel', value)
  },
})

const morphing = useMorphWindow(activePanel, 200)

const slots = useSlots()
const hasDownloadSlot = computed(() => Boolean(slots.download))
const hasHistorySlot = computed(() => Boolean(slots.history))
const hasBothSlots = computed(() => hasDownloadSlot.value && hasHistorySlot.value)

function hasPanel(target: Exclude<TxVersionCapsulePanel, null>) {
  return target === 'download' ? hasDownloadSlot.value : hasHistorySlot.value
}

const popoverOpen = computed(() => Boolean(activePanel.value && hasPanel(activePanel.value)))

const slideTransitionName = computed(() => {
  if (slideDirection.value === 'forward')
    return 'tx-vcf'
  if (slideDirection.value === 'backward')
    return 'tx-vcb'
  return ''
})

function toggle(target: Exclude<TxVersionCapsulePanel, null>) {
  if (props.disabled)
    return
  if (hasPanel(target))
    activePanel.value = activePanel.value === target ? null : target
  if (target === 'download')
    emit('download')
  else
    emit('history')
}

function openHistory() {
  if (props.disabled || !hasHistorySlot.value)
    return
  activePanel.value = 'history'
}

function openDownload() {
  if (props.disabled || !hasDownloadSlot.value)
    return
  activePanel.value = 'download'
}

function handlePopoverModelUpdate(nextOpen: boolean) {
  if (!nextOpen && activePanel.value !== null)
    activePanel.value = null
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

watch(() => props.disabled, (disabled) => {
  if (disabled)
    activePanel.value = null
})

watch(activePanel, (next, prev) => {
  if (prev === 'download' && next === 'history')
    slideDirection.value = 'forward'
  else if (prev === 'history' && next === 'download')
    slideDirection.value = 'backward'
  else
    slideDirection.value = 'none'

  // Re-trigger auto-sizing when switching panels while the popover stays open so
  // rapid toggles mid-animation immediately reverse from the live height.
  if (prev && next && prev !== next)
    void autoSizerRef.value?.refresh()
})

defineExpose({ close, openDownload, openHistory, downloadRef, historyRef })
</script>

<template>
  <div
    class="tx-version-capsule"
    :class="[`tx-version-capsule--${tone}`, { 'is-disabled': disabled, 'is-morphing': morphing }]"
  >
    <TxPopover
      :model-value="popoverOpen"
      trigger="manual"
      :toggle-on-reference-click="false"
      placement="bottom"
      :offset="8"
      :width="0"
      :min-width="292"
      :max-width="324"
      :match-reference-width="false"
      :keep-alive-content="false"
      panel-variant="solid"
      panel-background="refraction"
      panel-shadow="soft"
      :panel-radius="16"
      :panel-padding="8"
      :disabled="disabled"
      :close-on-click-outside="closeOnClickOutside"
      :close-on-esc="closeOnEsc"
      @update:model-value="handlePopoverModelUpdate"
    >
      <template #reference>
        <div class="tx-vc-bar">
          <button
            ref="downloadRef"
            type="button"
            class="tx-vc-seg tx-version-capsule__segment--download"
            :class="{ 'is-open': activePanel === 'download' }"
            :disabled="disabled"
            :aria-label="downloadLabel"
            :aria-expanded="activePanel === 'download'"
            aria-haspopup="dialog"
            @click="toggle('download')"
          >
            <span v-if="channel" class="tx-vc-cb">
              <span class="tx-vc-dot" aria-hidden="true" />
              <span class="tx-version-capsule__channel tx-vc-ch-t">{{ channel }}</span>
            </span>
            <span v-else class="tx-vc-dot" aria-hidden="true" />
            <span class="tx-version-capsule__version tx-vc-ver">{{ version }}</span>
            <svg
              class="tx-vc-gl"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m7 10 5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
          </button>

          <span class="tx-vc-div" aria-hidden="true" />

          <button
            ref="historyRef"
            type="button"
            class="tx-vc-seg tx-vc-hs tx-version-capsule__segment--history"
            :class="{ 'is-open': activePanel === 'history', 'has-label': showHistoryLabel }"
            :disabled="disabled"
            :aria-label="historyLabel"
            :title="historyLabel"
            :aria-expanded="activePanel === 'history'"
            aria-haspopup="dialog"
            @click="toggle('history')"
          >
            <span v-if="showHistoryLabel" class="tx-vc-hl">{{ historyLabel }}</span>
            <svg
              class="tx-vc-ch"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </template>

      <div
        v-if="popoverOpen"
        class="tx-vc-pop"
        :class="{ 'has-drilldown': hasBothSlots }"
      >
        <TxAutoSizer
          ref="autoSizerRef"
          :width="false"
          :height="true"
          :duration-ms="240"
          easing="cubic-bezier(0.22, 1, 0.36, 1)"
          outer-class="tx-vc-vp"
        >
          <Transition :name="slideTransitionName">
            <div v-if="activePanel === 'download'" key="download" class="tx-vc-pn">
              <slot
                name="download"
                :close="close"
                :open-history="openHistory"
                :open-download="openDownload"
              />
              <div v-if="hasBothSlots && showViewMore" class="tx-vc-mw">
                <button
                  type="button"
                  class="tx-version-capsule__more-btn tx-vc-mb"
                  @click="openHistory"
                >
                  <span>{{ viewMoreLabel }}</span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>

            <div v-else-if="activePanel === 'history'" key="history" class="tx-vc-pn">
              <div v-if="hasBothSlots" class="tx-vc-nav">
                <button
                  type="button"
                  class="tx-version-capsule__back-btn tx-vc-bb"
                  @click="openDownload"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m10 4-4 4 4 4" />
                  </svg>
                  <span>{{ backLabel }}</span>
                </button>
                <span class="tx-vc-nt">{{ historyLabel }}</span>
              </div>
              <slot
                name="history"
                :close="close"
                :open-history="openHistory"
                :open-download="openDownload"
              />
            </div>
          </Transition>
        </TxAutoSizer>
      </div>
    </TxPopover>
  </div>
</template>

<style lang="scss">
.tx-version-capsule, .tx-vc-pop, .tx-vp {
  --_fg: var(--tx-text-color-primary);
  --_re: var(--tx-text-color-regular);
  --_mu: var(--tx-text-color-secondary);
  --_pl: var(--tx-text-color-placeholder);
  --_fl: var(--tx-fill-color-light);
  --_fl2: var(--tx-fill-color-lighter);
  --_bd: var(--tx-border-color-lighter);
}
.tx-version-capsule {
  --tx-version-capsule-height: 34px;
  --tx-version-capsule-radius: var(--tx-button-radius, 12px);
  --tx-version-capsule-bg: var(--tx-bg-color-overlay, var(--tx-bg-color, #fff));
  --tx-version-capsule-border-color: var(--tx-border-color);
  --tx-version-capsule-padding: 0 10px 0 7px;
  --tx-version-capsule-gap: 7px;
  --tx-version-capsule-font-size: 13px;
  --tx-version-capsule-tone: var(--tx-color-primary);
  --tx-version-capsule-accent: var(--tx-color-primary);
  position: relative;
  display: inline-flex;
  &--stable { --tx-version-capsule-tone: var(--tx-color-success); }
  &--nightly { --tx-version-capsule-tone: var(--tx-color-warning); }
  &--neutral { --tx-version-capsule-tone: var(--_mu); }
  &.is-morphing .tx-vc-seg { transition: background-color 0.2s; }
  &.is-morphing .tx-vc-gl { transition: color 0.2s; }
  &.is-disabled .tx-vc-seg { cursor: not-allowed; opacity: 0.5; &:hover { background: transparent; } }
}
.tx-vp {
  --tx-version-panel-bg: var(--tx-bg-color-overlay);
  --tx-version-panel-border-color: var(--tx-border-color);
  --tx-version-panel-radius: 16px;
  --tx-version-panel-accent: var(--tx-color-primary);
  display: flex; flex-direction: column;
  border: 1px solid var(--tx-version-panel-border-color); border-radius: var(--tx-version-panel-radius);
  background: var(--tx-version-panel-bg); box-shadow: var(--tx-box-shadow-dark, 0 24px 60px rgb(0 0 0 / 40%)); overflow: hidden;
}
.tx-vc-bar {
  display: inline-flex; align-items: stretch; height: var(--tx-version-capsule-height);
  border: 1px solid var(--tx-version-capsule-border-color); border-radius: var(--tx-version-capsule-radius);
  background: var(--tx-version-capsule-bg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s;
}
.tx-vc-seg {
  display: inline-flex; align-items: center; gap: var(--tx-version-capsule-gap); padding: var(--tx-version-capsule-padding);
  border: 0; background: transparent; color: var(--_fg); font: inherit; font-size: var(--tx-version-capsule-font-size); line-height: 1; cursor: pointer;
  &:hover { background: var(--_fl); }
  &.is-open { background: var(--tx-fill-color); }
  &:hover, &.is-open { .tx-vc-gl, .tx-vc-ch { color: var(--_fg); } }
  &:focus-visible { outline: 2px solid var(--tx-version-capsule-accent); outline-offset: -2px; }
}
.tx-vc-hs {
  justify-content: center; min-width: calc(var(--tx-version-capsule-height) - 2px); padding: 0 8px;
  &.has-label { padding: 0 11px; }
  &.is-open .tx-vc-ch { transform: rotate(180deg); }
}
.tx-vc-cb {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 6px;
  border-radius: max(5px, calc(var(--tx-version-capsule-radius) - 6px)); background: var(--_fl);
}
.tx-vc-dot { width: 6px; height: 6px; flex: none; border-radius: 999px; background: var(--tx-version-capsule-tone); }
.tx-vc-ch-t { color: var(--_re); font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; line-height: 1; }
.tx-vc-ver { font: 600 12.5px/1 ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.tx-vc-gl, .tx-vc-ch { width: 14px; height: 14px; flex: none; color: var(--_mu); }
.tx-vc-ch { transition: transform 0.2s, color 0.2s; }
.tx-vc-div { width: 1px; flex: none; background: color-mix(in srgb, var(--tx-version-capsule-border-color) 75%, transparent); }
.tx-vc-hl { color: var(--_re); font-size: 12.5px; font-weight: 500; }

.tx-vc-pop {
  display: flex; flex-direction: column; width: 100%; text-align: left;
  .tx-vp { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .tx-vd-bs, .tx-vh-b { padding: 0; }
  .tx-vd-n { margin-bottom: 6px; padding: 8px 10px; border: 1px solid var(--_bd); border-radius: 8px; }
  &.has-drilldown .tx-vh-hd { display: none; }
}
.tx-vc-vp { position: relative; width: 100%; overflow: hidden; }
.tx-vc-pn { width: 100%; }
.tx-vc-mw { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--_bd); }
.tx-vc-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--_bd); }
.tx-vc-mb, .tx-vc-bb {
  display: inline-flex; align-items: center; border: 0; background: transparent; color: var(--_mu);
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1; cursor: pointer; transition: background-color 0.16s, color 0.16s;
  svg { width: 14px; height: 14px; flex: none; }
  &:hover { background: var(--_fl); color: var(--_fg); }
  &:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: -2px; }
}
.tx-vc-mb { display: flex; justify-content: space-between; width: 100%; height: 30px; padding: 0 10px; border-radius: 7px; svg { transition: transform 0.16s; } &:hover svg { transform: translateX(2px); } }
.tx-vc-bb { gap: 3px; height: 24px; padding: 0 7px 0 4px; border-radius: 6px; }
.tx-vc-nt { font-size: 12px; font-weight: 600; color: var(--_fg); padding-right: 4px; }

.tx-vcf-enter-active, .tx-vcb-enter-active, .tx-vcf-leave-active, .tx-vcb-leave-active { transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease; }
.tx-vcf-leave-active, .tx-vcb-leave-active { position: absolute; inset: 0 0 auto; width: 100%; pointer-events: none; }
.tx-vcf-enter-from, .tx-vcb-leave-to { transform: translateX(100%); opacity: 0; }
.tx-vcf-leave-to, .tx-vcb-enter-from { transform: translateX(-100%); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .tx-vc-bar, .tx-vc-seg, .tx-vc-gl, .tx-vc-ch,
  .tx-vcf-enter-active, .tx-vcf-leave-active, .tx-vcb-enter-active, .tx-vcb-leave-active { transition: none; }
}
</style>
