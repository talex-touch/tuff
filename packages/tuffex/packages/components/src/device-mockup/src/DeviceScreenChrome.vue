<script setup lang="ts">
import type { DeviceMockupCategory, DeviceMockupCutout } from './types'

defineOptions({ name: 'TxDeviceScreenChrome' })

defineProps<{
  category: DeviceMockupCategory
  cutout: DeviceMockupCutout
  width: number
  innerRadius: number
  statusBarHeight: number
  statusBarTime: string
  darkScreen: boolean
  isWatch: boolean
  isCircular: boolean
  showLidNotch: boolean
  showStatusBar: boolean
  showPortraitCutout: boolean
  showLandscapeCutout: boolean
  showHomeIndicator: boolean
}>()
</script>

<template>
  <Transition name="tx-dm-chrome">
    <svg
      v-if="showLidNotch"
      class="tx-device-mockup__lid-notch"
      viewBox="0 0 156 26"
      width="156"
      height="26"
      aria-hidden="true"
    >
      <path
        d="M 0 0 Q 6 0 6 6 L 6 14 Q 6 24 16 24 L 140 24 Q 150 24 150 14 L 150 6 Q 150 0 156 0 Z"
        fill="var(--tx-device-cutout-bg)"
      />
      <circle cx="78" cy="12" r="3.2" fill="var(--tx-device-lens-bg)" />
    </svg>
  </Transition>

  <Transition name="tx-dm-chrome">
    <div
      v-if="showStatusBar"
      class="tx-device-mockup__status-bar"
      :class="{ 'is-dark-screen': darkScreen }"
      aria-hidden="true"
    >
      <slot name="status-bar">
        <svg
          class="tx-device-mockup__status-svg"
          :viewBox="`0 0 ${width} ${statusBarHeight}`"
          :width="width"
          :height="statusBarHeight"
        >
          <text
            v-if="isWatch"
            :x="isCircular ? width / 2 : width - 18"
            :y="isCircular ? 16 : 13"
            :text-anchor="isCircular ? 'middle' : 'end'"
            dominant-baseline="central"
            class="tx-device-mockup__status-time tx-device-mockup__status-time--watch"
          >
            {{ statusBarTime }}
          </text>
          <template v-else>
            <text
              :x="category === 'tablet' ? 22 : Math.max(24, Math.min(36, Math.round(innerRadius * 0.56)))"
              :y="Math.round(statusBarHeight * 0.58)"
              class="tx-device-mockup__status-time"
              dominant-baseline="central"
            >
              {{ statusBarTime }}
            </text>
            <g
              :transform="`translate(${width - (category === 'tablet' ? 76 : Math.max(76, Math.round(innerRadius * 0.52) + 56))}, ${Math.round(statusBarHeight * 0.58) - 6})`"
            >
              <rect x="0" y="7" width="2.6" height="4" rx="0.8" fill="currentColor" />
              <rect x="4" y="5" width="2.6" height="6" rx="0.8" fill="currentColor" />
              <rect x="8" y="3" width="2.6" height="8" rx="0.8" fill="currentColor" />
              <rect x="12" y="1" width="2.6" height="10" rx="0.8" fill="currentColor" opacity="0.35" />
              <path
                d="M21 8.8a3.2 3.2 0 0 1 4.6 0M19.3 6.6a5.6 5.6 0 0 1 8 0M22.5 10.7a1 1 0 1 0 1.6 0a1 1 0 1 0-1.6 0"
                fill="none"
                stroke="currentColor"
                stroke-width="1.35"
                stroke-linecap="round"
              />
              <rect x="33" y="1.5" width="21" height="9.5" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7" />
              <rect x="35" y="3.5" width="15" height="5.5" rx="1.2" fill="currentColor" />
              <path d="M55.4 4.4v3.7a1.1 1.1 0 0 0 1-1.1V5.5a1.1 1.1 0 0 0-1-1.1Z" fill="currentColor" opacity="0.55" />
            </g>
          </template>
        </svg>
      </slot>
    </div>
  </Transition>

  <Transition name="tx-dm-chrome">
    <svg
      v-if="showPortraitCutout"
      class="tx-device-mockup__status-svg tx-device-mockup__status-svg--cutout-only"
      :viewBox="`0 0 ${width} 44`"
      :width="width"
      height="44"
      aria-hidden="true"
    >
      <template v-if="cutout === 'island'">
        <rect :x="(width - 108) / 2" y="11" width="108" height="30" rx="15" fill="var(--tx-device-cutout-bg)" />
        <circle :cx="(width - 108) / 2 + 86" cy="26" r="4.5" fill="var(--tx-device-lens-bg)" />
      </template>
      <template v-else-if="cutout === 'notch'">
        <path
          :d="`M ${(width - 152) / 2 - 8} 0 Q ${(width - 152) / 2} 0 ${(width - 152) / 2} 8 L ${(width - 152) / 2} 14 Q ${(width - 152) / 2} 28 ${(width - 152) / 2 + 14} 28 L ${(width + 152) / 2 - 14} 28 Q ${(width + 152) / 2} 28 ${(width + 152) / 2} 14 L ${(width + 152) / 2} 8 Q ${(width + 152) / 2} 0 ${(width + 152) / 2 + 8} 0 Z`"
          fill="var(--tx-device-cutout-bg)"
        />
        <rect :x="(width - 44) / 2" y="8" width="44" height="4" rx="2" fill="var(--tx-device-lens-bg)" />
      </template>
      <template v-else-if="cutout === 'punch'">
        <circle :cx="width / 2" cy="18" r="6.5" fill="var(--tx-device-cutout-bg)" />
        <circle :cx="width / 2" cy="18" r="2.4" fill="var(--tx-device-lens-bg)" />
      </template>
      <template v-else-if="cutout === 'pill'">
        <rect :x="(width - 78) / 2" y="11" width="78" height="20" rx="10" fill="var(--tx-device-cutout-bg)" />
        <circle :cx="(width - 78) / 2 + 18" cy="21" r="3.2" fill="var(--tx-device-lens-bg)" />
        <circle :cx="(width - 78) / 2 + 60" cy="21" r="3.2" fill="var(--tx-device-lens-bg)" />
      </template>
    </svg>
  </Transition>

  <Transition name="tx-dm-chrome">
    <svg
      v-if="showLandscapeCutout"
      class="tx-device-mockup__landscape-cutout"
      viewBox="0 0 28 112"
      width="28"
      height="112"
      aria-hidden="true"
    >
      <rect
        v-if="cutout === 'island' || cutout === 'pill'"
        x="8"
        y="14"
        width="14"
        height="84"
        rx="7"
        fill="var(--tx-device-cutout-bg)"
      />
      <circle
        v-else-if="cutout === 'punch'"
        cx="14"
        cy="56"
        r="5.5"
        fill="var(--tx-device-cutout-bg)"
      />
      <path
        v-else-if="cutout === 'notch'"
        d="M 0 6 Q 0 14 8 14 L 18 14 Q 24 14 24 24 L 24 88 Q 24 98 18 98 L 8 98 Q 0 98 0 106 Z"
        fill="var(--tx-device-cutout-bg)"
      />
    </svg>
  </Transition>

  <span
    v-if="showHomeIndicator"
    class="tx-device-mockup__home-indicator"
    :class="{ 'is-dark-screen': darkScreen }"
    aria-hidden="true"
  />
</template>
