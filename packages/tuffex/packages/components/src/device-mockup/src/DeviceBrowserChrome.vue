<script setup lang="ts">
import type { DeviceMockupFormFactor } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxDeviceBrowserChrome' })

const props = defineProps<{
  formFactor: DeviceMockupFormFactor
  url: string
  title: string
  dark: boolean
  barLabel: string
}>()

const isArc = computed(() => props.formFactor === 'browser-arc')
const isMultiRow = computed(() =>
  props.formFactor === 'browser-chrome'
  || props.formFactor === 'browser-firefox'
  || props.formFactor === 'browser-edge',
)
</script>

<template>
  <aside
    v-if="isArc"
    class="tx-device-mockup__arc-rail"
    :class="{ 'is-dark': dark }"
    role="toolbar"
    :aria-label="barLabel"
  >
    <slot>
      <div class="tx-device-mockup__arc-top">
        <span class="tx-device-mockup__traffic-lights" aria-hidden="true">
          <i class="tx-device-mockup__dot tx-device-mockup__dot--close" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--min" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--max" />
        </span>
        <span class="tx-device-mockup__arc-sidebar-glyph" aria-hidden="true" />
      </div>
      <span class="tx-device-mockup__arc-url">{{ url }}</span>
      <div class="tx-device-mockup__arc-pins" aria-hidden="true">
        <span class="tx-device-mockup__arc-pin"><i /></span>
        <span class="tx-device-mockup__arc-pin"><i /></span>
        <span class="tx-device-mockup__arc-pin"><i /></span>
      </div>
      <span class="tx-device-mockup__arc-divider" aria-hidden="true" />
      <span class="tx-device-mockup__arc-tab is-active">{{ title }}</span>
      <span class="tx-device-mockup__arc-ghost" aria-hidden="true" />
      <span class="tx-device-mockup__arc-ghost is-short" aria-hidden="true" />
    </slot>
  </aside>

  <div
    v-else
    class="tx-device-mockup__browser-bar"
    :class="[`tx-device-mockup__browser-bar--${formFactor}`, { 'is-dark': dark }]"
    role="toolbar"
    :aria-label="barLabel"
  >
    <slot>
      <template v-if="formFactor === 'window-windows'">
        <span class="tx-device-mockup__win-title">
          <span class="tx-device-mockup__win-glyph" aria-hidden="true" />
          <span>{{ title }}</span>
        </span>
        <span class="tx-device-mockup__win-controls" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="11" height="11"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.2" /></svg>
          <svg viewBox="0 0 12 12" width="11" height="11"><rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
        </span>
      </template>
      <template v-else-if="isMultiRow">
        <div class="tx-device-mockup__chrome-tabs">
          <span class="tx-device-mockup__traffic-lights" aria-hidden="true">
            <i class="tx-device-mockup__dot tx-device-mockup__dot--close" />
            <i class="tx-device-mockup__dot tx-device-mockup__dot--min" />
            <i class="tx-device-mockup__dot tx-device-mockup__dot--max" />
          </span>
          <span
            class="tx-device-mockup__chrome-tab"
            :class="{ 'is-pill-tab': formFactor === 'browser-firefox' }"
          >
            {{ title }}
          </span>
        </div>
        <div class="tx-device-mockup__chrome-omni">
          <span class="tx-device-mockup__chrome-nav" aria-hidden="true">‹ › ↻</span>
          <span class="tx-device-mockup__url-pill">{{ url }}</span>
        </div>
      </template>
      <template v-else-if="formFactor === 'browser-minimal' || formFactor === 'window-macos'">
        <span class="tx-device-mockup__traffic-lights" aria-hidden="true">
          <i class="tx-device-mockup__dot tx-device-mockup__dot--close" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--min" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--max" />
        </span>
        <span class="tx-device-mockup__minimal-title">{{ title }}</span>
      </template>
      <template v-else>
        <span class="tx-device-mockup__traffic-lights" aria-hidden="true">
          <i class="tx-device-mockup__dot tx-device-mockup__dot--close" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--min" />
          <i class="tx-device-mockup__dot tx-device-mockup__dot--max" />
        </span>
        <span class="tx-device-mockup__safari-url">
          <svg class="tx-device-mockup__lock" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            <rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2" />
            <path d="M4 5.5V4a2 2 0 1 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <span class="tx-device-mockup__url-text">{{ url }}</span>
        </span>
      </template>
    </slot>
  </div>
</template>
