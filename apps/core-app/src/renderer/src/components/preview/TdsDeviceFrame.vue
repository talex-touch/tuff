<script lang="ts" name="TdsDeviceFrame" setup>
import type { DeviceOrientation, DevicePreset } from './tds-devices'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { computeStageFitScale, isResponsivePreset, resolveDeviceDimensions } from './tds-devices'

const props = withDefaults(
  defineProps<{
    preset: DevicePreset
    orientation?: DeviceOrientation
    showShell?: boolean
    /** Applies a subtle circular touch-reticle cursor hint on touch-primary devices. */
    touchCursor?: boolean
    /** Stage padding in px reserved around the hardware frame when computing auto-fit scale. */
    stagePadding?: number
    /** Clock label displayed in the simulated status bar. */
    statusTime?: string
    /** Show compact device dimension + zoom scale meta bar below the frame. */
    showMeta?: boolean
  }>(),
  {
    orientation: 'portrait',
    showShell: true,
    touchCursor: true,
    stagePadding: 20,
    statusTime: '9:41',
    showMeta: true
  }
)

const stageRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)

let resizeObserver: ResizeObserver | null = null

const isResponsive = computed(() => isResponsivePreset(props.preset))

const resolved = computed(() => resolveDeviceDimensions(props.preset, props.orientation))

const effectiveBezel = computed(() => {
  if (isResponsive.value || !props.showShell) return 0
  return props.preset.bezel
})

const innerRadius = computed(() => {
  if (isResponsive.value) return 0
  if (!props.showShell) {
    return props.preset.category === 'paper' ? 2 : 6
  }
  return props.preset.radius
})

/**
 * Concentric outer frame radius: `outer = inner + bezel` whenever the screen has curved corners,
 * keeping hardware bezel walls parallel around every corner.
 */
const outerRadius = computed(() => {
  if (isResponsive.value) return 0
  const bezel = effectiveBezel.value
  if (!props.showShell) return innerRadius.value
  if (innerRadius.value > 0) return innerRadius.value + bezel
  if (props.preset.category === 'phone') return Math.max(20, bezel + 10)
  if (props.preset.category === 'paper') return 2
  return bezel > 0 ? bezel + 4 : 0
})

const outerWidth = computed(() => resolved.value.width + effectiveBezel.value * 2)
const outerHeight = computed(() => resolved.value.height + effectiveBezel.value * 2)

const META_BAR_RESERVE = 28

const fitScale = computed(() => {
  if (isResponsive.value) return 1
  if (containerWidth.value <= 0 || containerHeight.value <= 0) return 1
  const availableHeight = props.showMeta
    ? Math.max(1, containerHeight.value - META_BAR_RESERVE)
    : containerHeight.value
  return computeStageFitScale(
    { width: outerWidth.value, height: outerHeight.value },
    { width: containerWidth.value, height: availableHeight },
    props.stagePadding
  )
})

const scaledSlotStyle = computed(() => ({
  width: `${Math.round(outerWidth.value * fitScale.value)}px`,
  height: `${Math.round(outerHeight.value * fitScale.value)}px`
}))

const frameStyle = computed(() => ({
  width: `${outerWidth.value}px`,
  height: `${outerHeight.value}px`,
  padding: `${effectiveBezel.value}px`,
  borderRadius: `${outerRadius.value}px`,
  transform: `scale(${fitScale.value})`,
  '--tds-safe-top': `${resolved.value.safeArea.top}px`,
  '--tds-safe-bottom': `${resolved.value.safeArea.bottom}px`,
  '--tds-screen-radius': `${innerRadius.value}px`
}))

const screenStyle = computed(() => ({
  width: `${resolved.value.width}px`,
  height: `${resolved.value.height}px`,
  borderRadius: `${innerRadius.value}px`
}))

const showMobileChrome = computed(
  () =>
    props.showShell &&
    !isResponsive.value &&
    (props.preset.category === 'phone' || props.preset.category === 'tablet')
)

const showWatchChrome = computed(
  () => props.showShell && !isResponsive.value && props.preset.category === 'watch'
)

const showStatusBar = computed(() => {
  if (!showMobileChrome.value) return false
  return resolved.value.safeArea.top > 0
})

const statusBarHeight = computed(() => {
  if (!showStatusBar.value) return 0
  return Math.max(24, Math.min(resolved.value.safeArea.top, 54))
})

const showCutout = computed(() => {
  if (!showMobileChrome.value) return false
  if (props.preset.cutout === 'none') return false
  // In portrait the cutout sits centered along the top bezel.
  return resolved.value.orientation === 'portrait'
})

const showLandscapeCutout = computed(() => {
  if (!showMobileChrome.value) return false
  if (props.preset.cutout === 'none') return false
  return resolved.value.orientation === 'landscape'
})

const showHomeIndicator = computed(
  () => showMobileChrome.value && resolved.value.safeArea.bottom >= 20
)

const showSideHardwareButtons = computed(
  () =>
    props.showShell &&
    !isResponsive.value &&
    (props.preset.category === 'phone' || props.preset.category === 'watch')
)

const isPaperSurface = computed(() => !isResponsive.value && props.preset.category === 'paper')
const isDesktopSurface = computed(() => !isResponsive.value && props.preset.category === 'desktop')
const hasTouchCursor = computed(
  () => !isResponsive.value && Boolean(props.touchCursor && props.preset.touch)
)

const scalePercent = computed(() => Math.round(fitScale.value * 100))

function measureStage(): void {
  const el = stageRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nextWidth = rect.width || el.clientWidth
  const nextHeight = rect.height || el.clientHeight
  if (nextWidth > 0 && nextHeight > 0) {
    containerWidth.value = nextWidth
    containerHeight.value = nextHeight
  }
}

onMounted(() => {
  measureStage()
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        containerWidth.value = width
        containerHeight.value = height
      }
    })
    resizeObserver.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    v-if="isResponsive"
    class="TdsDeviceFrame TdsDeviceFrame--responsive"
    data-preset-id="responsive"
    data-testid="tds-device-frame"
  >
    <slot />
  </div>

  <div
    v-else
    ref="stageRef"
    class="TdsDeviceFrame TdsDeviceFrame--stage"
    :data-preset-id="preset.id"
    :data-category="preset.category"
    :data-orientation="resolved.orientation"
    :data-show-shell="String(showShell)"
    :data-scale="fitScale"
    data-testid="tds-device-frame"
  >
    <div class="TdsDeviceFrame-Scaler" :style="scaledSlotStyle">
      <div
        class="TdsDeviceFrame-Shell"
        :class="{
          'is-frameless': !showShell,
          'is-paper': isPaperSurface,
          'is-desktop': isDesktopSurface,
          'is-landscape': resolved.orientation === 'landscape'
        }"
        :style="frameStyle"
        data-testid="tds-device-shell"
      >
        <!-- Subtle side hardware controls (pure decorative edge ticks) -->
        <template v-if="showSideHardwareButtons">
          <span
            v-if="preset.category === 'watch'"
            class="TdsDeviceFrame-Crown"
            aria-hidden="true"
          />
          <template v-else-if="resolved.orientation === 'portrait'">
            <span class="TdsDeviceFrame-SideBtn TdsDeviceFrame-SideBtn--volUp" aria-hidden="true" />
            <span
              class="TdsDeviceFrame-SideBtn TdsDeviceFrame-SideBtn--volDown"
              aria-hidden="true"
            />
            <span class="TdsDeviceFrame-SideBtn TdsDeviceFrame-SideBtn--power" aria-hidden="true" />
          </template>
        </template>

        <div
          class="TdsDeviceFrame-Screen"
          :class="{ 'is-touch-cursor': hasTouchCursor }"
          :style="screenStyle"
          :data-touch-cursor="String(hasTouchCursor)"
          data-testid="tds-device-screen"
        >
          <div class="TdsDeviceFrame-Content">
            <slot />
          </div>

          <!-- Dynamic SVG Status Bar & Hardware Cutout (Portrait) -->
          <svg
            v-if="showStatusBar"
            class="TdsDeviceFrame-StatusSvg"
            :viewBox="`0 0 ${resolved.width} ${statusBarHeight}`"
            :width="resolved.width"
            :height="statusBarHeight"
            preserveAspectRatio="none"
            aria-hidden="true"
            data-testid="tds-device-statusbar"
          >
            <!-- Clock -->
            <text
              :x="
                preset.category === 'tablet'
                  ? 22
                  : Math.max(24, Math.min(36, Math.round(innerRadius * 0.56)))
              "
              :y="Math.round(statusBarHeight * 0.58)"
              class="TdsDeviceFrame-StatusTime"
              dominant-baseline="central"
            >
              {{ statusTime }}
            </text>

            <!-- Signal / Wi-Fi / Battery cluster -->
            <g
              :transform="`translate(${resolved.width - (preset.category === 'tablet' ? 76 : Math.max(76, Math.round(innerRadius * 0.52) + 56))}, ${Math.round(statusBarHeight * 0.58) - 6})`"
              class="TdsDeviceFrame-StatusIcons"
            >
              <!-- Cellular signal bars -->
              <rect x="0" y="7" width="2.6" height="4" rx="0.8" fill="currentColor" />
              <rect x="4" y="5" width="2.6" height="6" rx="0.8" fill="currentColor" />
              <rect x="8" y="3" width="2.6" height="8" rx="0.8" fill="currentColor" />
              <rect
                x="12"
                y="1"
                width="2.6"
                height="10"
                rx="0.8"
                fill="currentColor"
                opacity="0.35"
              />

              <!-- Wi-Fi arcs -->
              <path
                d="M21 8.8a3.2 3.2 0 0 1 4.6 0M19.3 6.6a5.6 5.6 0 0 1 8 0M22.5 10.7a1 1 0 1 0 1.6 0a1 1 0 1 0-1.6 0"
                fill="none"
                stroke="currentColor"
                stroke-width="1.35"
                stroke-linecap="round"
              />

              <!-- Battery -->
              <rect
                x="33"
                y="1.5"
                width="21"
                height="9.5"
                rx="2.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                opacity="0.7"
              />
              <rect x="35" y="3.5" width="15" height="5.5" rx="1.2" fill="currentColor" />
              <path
                d="M55.4 4.4v3.7a1.1 1.1 0 0 0 1-1.1V5.5a1.1 1.1 0 0 0-1-1.1Z"
                fill="currentColor"
                opacity="0.55"
              />
            </g>

            <!-- Top cutout geometry -->
            <g v-if="showCutout" class="TdsDeviceFrame-Cutout" data-testid="tds-device-cutout">
              <!-- Dynamic Island -->
              <template v-if="preset.cutout === 'island'">
                <rect
                  :x="(resolved.width - 108) / 2"
                  y="11"
                  width="108"
                  height="30"
                  rx="15"
                  fill="var(--tds-device-bezel-bg)"
                />
                <circle
                  :cx="(resolved.width - 108) / 2 + 86"
                  cy="26"
                  r="4.5"
                  fill="var(--tds-device-lens-bg)"
                />
              </template>

              <!-- Classic Notch -->
              <template v-else-if="preset.cutout === 'notch'">
                <path
                  :d="`M ${(resolved.width - 152) / 2 - 8} 0 Q ${(resolved.width - 152) / 2} 0 ${(resolved.width - 152) / 2} 8 L ${(resolved.width - 152) / 2} 14 Q ${(resolved.width - 152) / 2} 28 ${(resolved.width - 152) / 2 + 14} 28 L ${(resolved.width + 152) / 2 - 14} 28 Q ${(resolved.width + 152) / 2} 28 ${(resolved.width + 152) / 2} 14 L ${(resolved.width + 152) / 2} 8 Q ${(resolved.width + 152) / 2} 0 ${(resolved.width + 152) / 2 + 8} 0 Z`"
                  fill="var(--tds-device-bezel-bg)"
                />
                <rect
                  :x="(resolved.width - 44) / 2"
                  y="8"
                  width="44"
                  height="4"
                  rx="2"
                  fill="var(--tds-device-lens-bg)"
                />
              </template>

              <!-- Punch-hole Camera -->
              <template v-else-if="preset.cutout === 'punch'">
                <circle
                  :cx="resolved.width / 2"
                  cy="18"
                  r="6.5"
                  fill="var(--tds-device-bezel-bg)"
                />
                <circle :cx="resolved.width / 2" cy="18" r="2.4" fill="var(--tds-device-lens-bg)" />
              </template>

              <!-- Wide Pill Cutout (HarmonyOS Mate) -->
              <template v-else-if="preset.cutout === 'pill'">
                <rect
                  :x="(resolved.width - 78) / 2"
                  y="11"
                  width="78"
                  height="20"
                  rx="10"
                  fill="var(--tds-device-bezel-bg)"
                />
                <circle
                  :cx="(resolved.width - 78) / 2 + 18"
                  cy="21"
                  r="3.2"
                  fill="var(--tds-device-lens-bg)"
                />
                <circle
                  :cx="(resolved.width - 78) / 2 + 60"
                  cy="21"
                  r="3.2"
                  fill="var(--tds-device-lens-bg)"
                />
              </template>
            </g>
          </svg>

          <!-- Side cutout pill when rotated to landscape -->
          <svg
            v-if="showLandscapeCutout"
            class="TdsDeviceFrame-LandscapeCutout"
            viewBox="0 0 28 112"
            width="28"
            height="112"
            aria-hidden="true"
            data-testid="tds-device-cutout-landscape"
          >
            <rect
              v-if="preset.cutout === 'island' || preset.cutout === 'pill'"
              x="8"
              y="14"
              width="14"
              height="84"
              rx="7"
              fill="var(--tds-device-bezel-bg)"
            />
            <circle
              v-else-if="preset.cutout === 'punch'"
              cx="14"
              cy="56"
              r="5.5"
              fill="var(--tds-device-bezel-bg)"
            />
            <path
              v-else-if="preset.cutout === 'notch'"
              d="M 0 6 Q 0 14 8 14 L 18 14 Q 24 14 24 24 L 24 88 Q 24 98 18 98 L 8 98 Q 0 98 0 106 Z"
              fill="var(--tds-device-bezel-bg)"
            />
          </svg>

          <!-- Minimal Watch top time indicator -->
          <svg
            v-if="showWatchChrome"
            class="TdsDeviceFrame-StatusSvg"
            :viewBox="`0 0 ${resolved.width} 22`"
            :width="resolved.width"
            height="22"
            aria-hidden="true"
            data-testid="tds-device-statusbar"
          >
            <text
              :x="resolved.width - 18"
              y="13"
              text-anchor="end"
              dominant-baseline="central"
              class="TdsDeviceFrame-StatusTime TdsDeviceFrame-StatusTime--watch"
            >
              {{ statusTime }}
            </text>
          </svg>

          <!-- Gesture Home Indicator -->
          <div v-if="showHomeIndicator" class="TdsDeviceFrame-HomeIndicator" aria-hidden="true" />
        </div>
      </div>
    </div>

    <div v-if="showMeta" class="TdsDeviceFrame-Meta" data-testid="tds-device-meta">
      <span class="TdsDeviceFrame-MetaName">{{ preset.name }}</span>
      <span class="TdsDeviceFrame-MetaSep" aria-hidden="true">·</span>
      <span class="TdsDeviceFrame-MetaDim">{{ resolved.width }}×{{ resolved.height }}</span>
      <span v-if="scalePercent < 100" class="TdsDeviceFrame-MetaScale">{{ scalePercent }}%</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TdsDeviceFrame--responsive {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.TdsDeviceFrame--stage {
  /* Hardware bezel & status bar ink tokens with explicit hardware fallbacks */
  --tds-device-bezel-bg: var(--tx-color-black, #111113);
  --tds-device-bezel-ring: color-mix(
    in srgb,
    var(--shell-text-primary) 18%,
    var(--shell-border-strong)
  );
  --tds-device-lens-bg: color-mix(
    in srgb,
    var(--shell-text-primary) 16%,
    var(--tds-device-bezel-bg)
  );
  --tds-device-status-ink: var(--tx-color-black, #1d1d1f);

  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-surface);
  box-sizing: border-box;
}

.TdsDeviceFrame-Scaler {
  position: relative;
  flex: none;
  min-width: 0;
  min-height: 0;
}

.TdsDeviceFrame-Shell {
  position: relative;
  box-sizing: border-box;
  transform-origin: top left;
  background: var(--tds-device-bezel-bg);
  box-shadow:
    0 0 0 1px var(--tds-device-bezel-ring),
    0 14px 36px -12px var(--shell-shadow);

  &.is-desktop {
    box-shadow:
      0 0 0 1px var(--shell-border-strong),
      0 12px 32px -12px var(--shell-shadow);
  }

  &.is-paper {
    background: var(--shell-bg);
    box-shadow:
      0 0 0 1px var(--shell-border),
      0 10px 28px -10px var(--shell-shadow);
  }

  &.is-frameless {
    background: transparent;
    box-shadow: 0 0 0 1px var(--shell-border-strong);
  }
}

.TdsDeviceFrame-SideBtn {
  position: absolute;
  width: 2px;
  border-radius: 1px;
  background: var(--shell-border-strong);
  pointer-events: none;

  &--volUp {
    top: 120px;
    left: -2px;
    height: 36px;
  }

  &--volDown {
    top: 168px;
    left: -2px;
    height: 36px;
  }

  &--power {
    top: 144px;
    right: -2px;
    height: 54px;
  }
}

.TdsDeviceFrame-Crown {
  position: absolute;
  top: 56px;
  right: -4px;
  width: 4px;
  height: 34px;
  border-radius: 0 2px 2px 0;
  background: var(--shell-border-strong);
  pointer-events: none;
}

.TdsDeviceFrame-Screen {
  position: relative;
  overflow: hidden;
  background: var(--tx-color-white, #ffffff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-border) 50%, transparent);

  &.is-touch-cursor {
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23808080' fill-opacity='0.22' stroke='%23505056' stroke-opacity='0.6' stroke-width='1.5'/%3E%3C/svg%3E")
        12 12,
      pointer;
  }
}

.TdsDeviceFrame-Content {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.TdsDeviceFrame-StatusSvg {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: block;
  width: 100%;
  color: var(--tds-device-status-ink);
  pointer-events: none;
  user-select: none;
}

.TdsDeviceFrame-StatusTime {
  fill: currentColor;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &--watch {
    font-size: 11px;
  }
}

.TdsDeviceFrame-StatusIcons {
  color: currentColor;
}

.TdsDeviceFrame-LandscapeCutout {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 2;
  transform: translateY(-50%);
  pointer-events: none;
}

.TdsDeviceFrame-HomeIndicator {
  position: absolute;
  bottom: 7px;
  left: 50%;
  z-index: 2;
  width: 34%;
  max-width: 134px;
  min-width: 64px;
  height: 4px;
  border-radius: var(--shell-radius-full);
  background: color-mix(in srgb, var(--tds-device-status-ink) 32%, transparent);
  transform: translateX(-50%);
  pointer-events: none;
}

.TdsDeviceFrame-Meta {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  user-select: none;
}

.TdsDeviceFrame-MetaName {
  color: var(--shell-text-primary);
  font-weight: 500;
}

.TdsDeviceFrame-MetaSep {
  color: var(--shell-text-muted);
}

.TdsDeviceFrame-MetaScale {
  padding: 1px 5px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
  color: var(--shell-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .TdsDeviceFrame-Shell,
  .TdsDeviceFrame-Scaler {
    transition: none;
  }
}
</style>
