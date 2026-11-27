<script lang="ts" name="HomeSideBrowserPane" setup>
import type {
  BrowserSideState,
  BrowserViewportRequest
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  clampViewportBounds,
  getDeviceCategoryIcon,
  getDevicePresetById,
  isResponsivePreset,
  resolveDeviceDimensions,
  RESPONSIVE_PRESET_ID,
  searchDevicePresets,
  type DeviceCategory,
  type DeviceOrientation,
  type DevicePreset
} from '~/components/preview/tds-devices'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import { describeBrowserError } from '~/views/base/browser/browser-errors'

const props = defineProps<{
  url: string
  active: boolean
}>()

const emit = defineEmits<{
  (event: 'meta-change', payload: { url: string; title: string; favicon: string | null }): void
  (event: 'open-in-browser', url: string): void
  (event: 'open-external', url: string): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const sdk = transport ? createBrowserSdk(transport) : null

const sideState = ref<BrowserSideState | null>(null)
const address = ref(props.url)
const addressFocused = ref(false)
const addressInputRef = ref<HTMLInputElement | null>(null)
const frameHostRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const snapshot = ref<string | null>(null)
const overlayOpen = ref(false)
const localError = ref('')

const SIDE_BROWSER_CATEGORIES = new Set<DeviceCategory>([
  'responsive',
  'phone',
  'tablet',
  'desktop'
])
const viewportMenuOpen = ref(false)
const viewportPresetId = ref<string>(RESPONSIVE_PRESET_ID)
const viewportOrientation = ref<DeviceOrientation>('portrait')
const viewportQuery = ref('')
const viewportCategory = ref<DeviceCategory | 'all'>('all')
const measuredViewport = ref<{ width: number; height: number } | null>(null)

const activeDevicePreset = computed(() => getDevicePresetById(viewportPresetId.value))
const isConstrainedViewport = computed(() => !isResponsivePreset(activeDevicePreset.value))
const activeDeviceDimensions = computed(() =>
  resolveDeviceDimensions(activeDevicePreset.value, viewportOrientation.value)
)
const canFlipOrientation = computed(
  () => isConstrainedViewport.value && Boolean(activeDevicePreset.value.orientable)
)
const isViewportClamped = computed(
  () =>
    isConstrainedViewport.value &&
    Boolean(
      measuredViewport.value &&
      (measuredViewport.value.width < activeDeviceDimensions.value.width ||
        measuredViewport.value.height < activeDeviceDimensions.value.height)
    )
)
const constrainedViewportStyle = computed(() =>
  isConstrainedViewport.value
    ? {
        width: `${activeDeviceDimensions.value.width}px`,
        height: `${activeDeviceDimensions.value.height}px`
      }
    : undefined
)
const viewportFilterCategories = computed<Array<{ id: DeviceCategory | 'all'; label: string }>>(
  () => [
    { id: 'all', label: t('home.sidePanel.deviceCategoryAll') },
    { id: 'phone', label: t('home.sidePanel.deviceCategoryPhone') },
    { id: 'tablet', label: t('home.sidePanel.deviceCategoryTablet') },
    { id: 'desktop', label: t('home.sidePanel.deviceCategoryDesktop') }
  ]
)
const filteredViewportPresets = computed(() =>
  searchDevicePresets(viewportQuery.value, viewportCategory.value).filter((preset) =>
    SIDE_BROWSER_CATEGORIES.has(preset.category)
  )
)

function selectViewportPreset(preset: DevicePreset): void {
  viewportPresetId.value = preset.id
  if (!preset.orientable) {
    viewportOrientation.value = 'portrait'
  }
  viewportMenuOpen.value = false
  void nextTick(scheduleViewport)
}

function toggleViewportOrientation(): void {
  if (!canFlipOrientation.value) return
  viewportOrientation.value = viewportOrientation.value === 'portrait' ? 'landscape' : 'portrait'
  void nextTick(scheduleViewport)
}

function resetViewportPreset(): void {
  viewportPresetId.value = RESPONSIVE_PRESET_ID
  viewportOrientation.value = 'portrait'
  void nextTick(scheduleViewport)
}

function formatViewportPresetLabel(preset: DevicePreset): string {
  return preset.id === RESPONSIVE_PRESET_ID ? t('home.sidePanel.deviceResponsive') : preset.name
}

const currentUrl = computed(() => sideState.value?.url || props.url || '')
const currentError = computed(() => localError.value || sideState.value?.error || '')
const isSecure = computed(() => currentUrl.value.startsWith('https://'))

const OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"], dialog[open], .tx-base-anchor.is-open, .dialog-mask'
const OVERLAY_MUTATION_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"], dialog, .tx-base-anchor, .dialog-mask'

function updateOverlays(): void {
  overlayOpen.value = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).some(
    (element) => {
      if (element.closest('[inert], [aria-hidden="true"]')) return false
      const style = getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
      )
    }
  )
}

let viewportFrame = 0
let viewportEpoch = 0
let viewportQueue: Promise<void> = Promise.resolve()
let lastViewportKey = ''
let resizeObserver: ResizeObserver | null = null
let overlayObserver: MutationObserver | null = null
let unsubscribeChanged: (() => void) | undefined
let unsubscribeSnapshot: (() => void) | undefined
let disposed = false

function enqueueViewport(request: BrowserViewportRequest): void {
  if (!sdk) return
  const epoch = ++viewportEpoch
  viewportQueue = viewportQueue.then(async () => {
    if (request.visible && epoch !== viewportEpoch) return
    const key = JSON.stringify(request)
    if (lastViewportKey === key) return
    try {
      await sdk.sideSetViewport(request)
      lastViewportKey = key
    } catch {
      // ignore transient viewport sync failures
    }
  })
}

function hideViewport(): void {
  if (viewportFrame) cancelAnimationFrame(viewportFrame)
  viewportFrame = 0
  enqueueViewport({ visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } })
}

function measureViewport(): void {
  viewportFrame = 0
  if (
    disposed ||
    !props.active ||
    document.hidden ||
    overlayOpen.value ||
    !currentUrl.value ||
    Boolean(currentError.value) ||
    !viewportRef.value
  ) {
    hideViewport()
    return
  }
  const rect = viewportRef.value.getBoundingClientRect()
  if (!isConstrainedViewport.value) {
    measuredViewport.value = null
    const x = Math.max(0, Math.ceil(rect.left))
    const y = Math.max(0, Math.ceil(rect.top))
    const width = Math.max(0, Math.floor(Math.min(rect.right, window.innerWidth)) - x)
    const height = Math.max(0, Math.floor(Math.min(rect.bottom, window.innerHeight)) - y)
    enqueueViewport({ visible: width > 0 && height > 0, bounds: { x, y, width, height } })
    return
  }

  const stageRect = frameHostRef.value?.getBoundingClientRect() ?? null
  const bounds = clampViewportBounds(rect, stageRect, activeDeviceDimensions.value, {
    width: window.innerWidth,
    height: window.innerHeight
  })
  measuredViewport.value =
    bounds.width > 0 && bounds.height > 0 ? { width: bounds.width, height: bounds.height } : null
  enqueueViewport({ visible: bounds.width > 0 && bounds.height > 0, bounds })
}

function scheduleViewport(): void {
  if (
    disposed ||
    !props.active ||
    document.hidden ||
    overlayOpen.value ||
    !currentUrl.value ||
    Boolean(currentError.value)
  ) {
    hideViewport()
    return
  }
  if (!viewportFrame) viewportFrame = requestAnimationFrame(measureViewport)
}

function applyState(next: BrowserSideState): void {
  if (sideState.value && next.revision <= sideState.value.revision) return
  sideState.value = next
  if (!addressFocused.value && next.url) {
    address.value = next.url
  }
  if (next.url) {
    emit('meta-change', {
      url: next.url,
      title: next.title,
      favicon: next.favicon
    })
  }
  scheduleViewport()
}

async function navigateTo(input: string): Promise<void> {
  const trimmed = input.trim()
  if (!trimmed) return
  localError.value = ''
  if (!sdk) {
    localError.value = t('home.sidePanel.browserUnavailable')
    return
  }
  try {
    const next = await sdk.sideNavigate(trimmed)
    applyState(next)
  } catch (err) {
    localError.value = err instanceof Error ? err.message : String(err)
    hideViewport()
  }
}

function onAddressKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    void navigateTo(address.value)
    addressInputRef.value?.blur()
  } else if (event.key === 'Escape') {
    address.value = currentUrl.value
    addressInputRef.value?.blur()
  }
}

async function runAction(action: 'back' | 'forward' | 'reload' | 'stop'): Promise<void> {
  if (!sdk) return
  localError.value = ''
  try {
    const next =
      action === 'back'
        ? await sdk.sideBack()
        : action === 'forward'
          ? await sdk.sideForward()
          : action === 'reload'
            ? await sdk.sideReload()
            : await sdk.sideStop()
    applyState(next)
  } catch (err) {
    localError.value = err instanceof Error ? err.message : String(err)
  }
}

async function copyUrl(): Promise<void> {
  const url = currentUrl.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    toast.success(t('home.copied'))
  } catch {
    // ignore
  }
}

watch(
  () => [props.url, props.active] as const,
  ([url, active]) => {
    if (!active) {
      hideViewport()
      return
    }
    updateOverlays()
    if (!url) {
      address.value = ''
      hideViewport()
      void nextTick(() => addressInputRef.value?.focus())
      return
    }
    address.value = url
    if (sideState.value?.url !== url) {
      void navigateTo(url)
    } else {
      scheduleViewport()
    }
  },
  { immediate: true }
)

watch([overlayOpen, currentError], scheduleViewport, { flush: 'sync' })

watch([viewportPresetId, viewportOrientation], () => {
  void nextTick(scheduleViewport)
})

watch(viewportMenuOpen, (open) => {
  if (!open) {
    viewportQuery.value = ''
    void nextTick(scheduleViewport)
  }
})

onMounted(() => {
  if (sdk) {
    unsubscribeChanged = sdk.onSideChanged(applyState)
    unsubscribeSnapshot = sdk.onSideSnapshot(({ snapshot: next }) => {
      if (!disposed) snapshot.value = next
    })
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleViewport)
    if (frameHostRef.value) resizeObserver.observe(frameHostRef.value)
    if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    overlayObserver = new MutationObserver((mutations) => {
      if (!props.active) return
      const relevant = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : null
        if (
          target?.matches(OVERLAY_MUTATION_SELECTOR) ||
          target?.closest(OVERLAY_MUTATION_SELECTOR)
        )
          return true
        return Array.from(mutation.addedNodes)
          .concat(Array.from(mutation.removedNodes))
          .some(
            (node) =>
              node instanceof Element &&
              (node.matches(OVERLAY_MUTATION_SELECTOR) ||
                node.querySelector(OVERLAY_MUTATION_SELECTOR))
          )
      })
      if (relevant) updateOverlays()
    })
    overlayObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'aria-hidden', 'inert']
    })
  }
  updateOverlays()
  window.addEventListener('resize', scheduleViewport)
  window.addEventListener('scroll', scheduleViewport, true)
  document.addEventListener('visibilitychange', scheduleViewport)
  void nextTick(scheduleViewport)
})

onBeforeUnmount(() => {
  disposed = true
  hideViewport()
  unsubscribeChanged?.()
  unsubscribeSnapshot?.()
  resizeObserver?.disconnect()
  overlayObserver?.disconnect()
  window.removeEventListener('resize', scheduleViewport)
  window.removeEventListener('scroll', scheduleViewport, true)
  document.removeEventListener('visibilitychange', scheduleViewport)
})
</script>

<template>
  <div class="HomeSideBrowserPane">
    <div class="HomeSideBrowserPane-Bar">
      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!sideState?.canGoBack"
        :title="t('browser.back')"
        :aria-label="t('browser.back')"
        @click="runAction('back')"
      >
        <span class="i-ri-arrow-left-line" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!sideState?.canGoForward"
        :title="t('browser.forward')"
        :aria-label="t('browser.forward')"
        @click="runAction('forward')"
      >
        <span class="i-ri-arrow-right-line" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!currentUrl"
        :title="sideState?.loading ? t('browser.stop') : t('browser.reload')"
        :aria-label="sideState?.loading ? t('browser.stop') : t('browser.reload')"
        @click="runAction(sideState?.loading ? 'stop' : 'reload')"
      >
        <span
          :class="sideState?.loading ? 'i-ri-close-line' : 'i-ri-refresh-line'"
          aria-hidden="true"
        />
      </button>

      <label class="HomeSideBrowserPane-Address">
        <span
          :class="isSecure ? 'i-ri-lock-2-line is-secure' : 'i-ri-global-line'"
          class="HomeSideBrowserPane-AddressIcon"
          aria-hidden="true"
        />
        <input
          ref="addressInputRef"
          v-model="address"
          type="text"
          spellcheck="false"
          autocomplete="off"
          class="HomeSideBrowserPane-Input"
          :placeholder="t('home.sidePanel.searchPlaceholder')"
          :aria-label="t('browser.address')"
          @focus="
            () => {
              addressFocused = true
              addressInputRef?.select()
            }
          "
          @blur="addressFocused = false"
          @keydown="onAddressKeydown"
        />
      </label>

      <TxPopover
        v-model="viewportMenuOpen"
        trigger="click"
        placement="bottom-end"
        :offset="6"
        :match-reference-width="false"
        :min-width="260"
        :panel-radius="12"
        :panel-padding="8"
        :panel-card="SHELL_MENU_CARD"
        panel-background="refraction"
      >
        <template #reference>
          <button
            type="button"
            class="HomeSideBrowserPane-Btn"
            :class="{ 'is-active': isConstrainedViewport || viewportMenuOpen }"
            :aria-expanded="viewportMenuOpen"
            :title="t('home.sidePanel.deviceViewport')"
            :aria-label="t('home.sidePanel.deviceViewport')"
            data-testid="side-browser-viewport-trigger"
          >
            <span :class="getDeviceCategoryIcon(activeDevicePreset.category)" aria-hidden="true" />
          </button>
        </template>

        <div class="HomeSideBrowserPane-ViewportPopover">
          <label class="HomeSideBrowserPane-ViewportSearch">
            <span class="HomeSideBrowserPane-ViewportSearchIcon" aria-hidden="true">
              <span class="i-ri-search-line" />
            </span>
            <input
              v-model="viewportQuery"
              type="search"
              class="HomeSideBrowserPane-ViewportSearchInput"
              :placeholder="t('home.sidePanel.deviceSearchPlaceholder')"
              :aria-label="t('home.sidePanel.deviceSearchPlaceholder')"
              data-testid="side-browser-viewport-search"
            />
          </label>

          <div class="HomeSideBrowserPane-ViewportCats" role="group">
            <button
              v-for="cat in viewportFilterCategories"
              :key="cat.id"
              type="button"
              class="HomeSideBrowserPane-ViewportCatBtn"
              :class="{ 'is-active': viewportCategory === cat.id }"
              :aria-pressed="viewportCategory === cat.id"
              :data-testid="`side-browser-viewport-cat-${cat.id}`"
              @click="viewportCategory = cat.id"
            >
              {{ cat.label }}
            </button>
          </div>

          <div
            class="HomeSideBrowserPane-ViewportList"
            role="listbox"
            :aria-label="t('home.sidePanel.deviceViewport')"
          >
            <button
              v-for="preset in filteredViewportPresets"
              :key="preset.id"
              type="button"
              role="option"
              class="HomeSideBrowserPane-ViewportOption"
              :class="{ 'is-active': preset.id === viewportPresetId }"
              :aria-selected="preset.id === viewportPresetId"
              :data-testid="`side-browser-viewport-option-${preset.id}`"
              @click="selectViewportPreset(preset)"
            >
              <span class="HomeSideBrowserPane-ViewportOptionLead">
                <span class="HomeSideBrowserPane-ViewportOptionIcon" aria-hidden="true">
                  <span :class="getDeviceCategoryIcon(preset.category)" />
                </span>
                <span class="HomeSideBrowserPane-ViewportOptionName">
                  {{ formatViewportPresetLabel(preset) }}
                </span>
              </span>
              <span class="HomeSideBrowserPane-ViewportOptionMeta">
                <span v-if="preset.width > 0" class="HomeSideBrowserPane-ViewportOptionDim">
                  {{ preset.width }}×{{ preset.height }}
                </span>
                <span
                  v-if="preset.id === viewportPresetId"
                  class="HomeSideBrowserPane-ViewportOptionCheck"
                  aria-hidden="true"
                >
                  <span class="i-ri-check-line" />
                </span>
              </span>
            </button>

            <div
              v-if="filteredViewportPresets.length === 0"
              class="HomeSideBrowserPane-ViewportEmpty"
            >
              {{ t('home.sidePanel.deviceEmpty') }}
            </div>
          </div>
        </div>
      </TxPopover>

      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!currentUrl"
        :title="t('home.copy')"
        :aria-label="t('home.copy')"
        @click="copyUrl"
      >
        <span class="i-ri-file-copy-line" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!currentUrl"
        :title="t('home.fileLink.openInBuiltInBrowser')"
        :aria-label="t('home.fileLink.openInBuiltInBrowser')"
        @click="currentUrl && emit('open-in-browser', currentUrl)"
      >
        <span class="i-ri-window-line" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="HomeSideBrowserPane-Btn"
        :disabled="!currentUrl"
        :title="t('home.sidePanel.openExternalBrowser')"
        :aria-label="t('home.sidePanel.openExternalBrowser')"
        @click="currentUrl && emit('open-external', currentUrl)"
      >
        <span class="i-ri-external-link-line" aria-hidden="true" />
      </button>
    </div>

    <div
      class="HomeSideBrowserPane-Stage"
      :class="{ 'is-constrained': isConstrainedViewport }"
      data-testid="side-browser-stage"
    >
      <div
        v-if="isConstrainedViewport"
        class="HomeSideBrowserPane-ViewportBadge"
        data-testid="side-browser-viewport-badge"
      >
        <span class="HomeSideBrowserPane-ViewportBadgeName">{{ activeDevicePreset.name }}</span>
        <span class="HomeSideBrowserPane-ViewportBadgeDim">
          {{ activeDeviceDimensions.width }}×{{ activeDeviceDimensions.height }}
        </span>
        <span
          v-if="isViewportClamped && measuredViewport"
          class="HomeSideBrowserPane-ViewportBadgeClamped"
        >
          {{
            t('home.sidePanel.deviceClampedHint', {
              width: measuredViewport.width,
              height: measuredViewport.height
            })
          }}
        </span>
        <button
          v-if="canFlipOrientation"
          type="button"
          class="HomeSideBrowserPane-BadgeAction"
          :class="{ 'is-active': viewportOrientation === 'landscape' }"
          :aria-pressed="viewportOrientation === 'landscape'"
          :title="t('home.sidePanel.deviceRotate')"
          :aria-label="t('home.sidePanel.deviceRotate')"
          data-testid="side-browser-viewport-rotate"
          @click="toggleViewportOrientation"
        >
          <span class="i-ri-clockwise-line" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="HomeSideBrowserPane-BadgeAction"
          :title="t('home.sidePanel.deviceResetResponsive')"
          :aria-label="t('home.sidePanel.deviceResetResponsive')"
          data-testid="side-browser-viewport-reset"
          @click="resetViewportPreset"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>

      <div
        ref="frameHostRef"
        class="HomeSideBrowserPane-FrameHost"
        :class="{ 'is-constrained': isConstrainedViewport }"
      >
        <div
          ref="viewportRef"
          class="HomeSideBrowserPane-Viewport"
          :class="{ 'is-constrained': isConstrainedViewport }"
          :style="constrainedViewportStyle"
          data-testid="side-browser-viewport"
        >
          <div v-if="currentError" class="HomeSideBrowserPane-State" role="alert">
            <span class="i-ri-wifi-off-line HomeSideBrowserPane-StateIcon" aria-hidden="true" />
            <p class="HomeSideBrowserPane-StateText">{{ describeBrowserError(currentError, t) }}</p>
            <div class="HomeSideBrowserPane-StateActions">
              <TxButton size="sm" variant="secondary" @click="navigateTo(address || currentUrl)">
                {{ t('home.workspace.retry') }}
              </TxButton>
              <TxButton
                v-if="currentUrl"
                size="sm"
                variant="secondary"
                @click="emit('open-external', currentUrl)"
              >
                {{ t('home.sidePanel.openExternalBrowser') }}
              </TxButton>
            </div>
          </div>

          <div v-else-if="!currentUrl" class="HomeSideBrowserPane-State">
            <span class="i-ri-global-line HomeSideBrowserPane-StateIcon" aria-hidden="true" />
            <p class="HomeSideBrowserPane-StateText">{{ t('home.sidePanel.browserEmptyHint') }}</p>
          </div>

          <img
            v-else-if="snapshot && overlayOpen"
            :src="snapshot"
            alt=""
            class="HomeSideBrowserPane-Snapshot"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeSideBrowserPane {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
}

.HomeSideBrowserPane-Bar {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.HomeSideBrowserPane-Btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.HomeSideBrowserPane-Address {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }
}

.HomeSideBrowserPane-AddressIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 13px;

  &.is-secure {
    color: var(--shell-success);
  }
}

.HomeSideBrowserPane-Input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideBrowserPane-Stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-bg);

  &.is-constrained {
    gap: 8px;
    align-items: center;
    padding: 8px 12px 12px;
    background: var(--shell-surface);
  }
}

.HomeSideBrowserPane-ViewportBadge {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
  max-width: 100%;
  height: 24px;
  padding: 0 6px 0 9px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.HomeSideBrowserPane-ViewportBadgeName {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideBrowserPane-ViewportBadgeDim,
.HomeSideBrowserPane-ViewportBadgeClamped {
  flex: none;
  color: var(--shell-text-muted);
}

.HomeSideBrowserPane-BadgeAction {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.HomeSideBrowserPane-FrameHost {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  &.is-constrained {
    align-items: center;
    justify-content: center;
  }
}

.HomeSideBrowserPane-Viewport {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-bg);

  &.is-constrained {
    flex: 0 1 auto;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--shell-radius-md);
    box-shadow:
      0 0 0 1px var(--shell-border-strong),
      0 10px 28px -12px var(--shell-shadow);
  }
}

.HomeSideBrowserPane-ViewportPopover {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 260px;
}

.HomeSideBrowserPane-ViewportSearch {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-muted);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }
}

.HomeSideBrowserPane-ViewportSearchIcon,
.HomeSideBrowserPane-ViewportOptionIcon,
.HomeSideBrowserPane-ViewportOptionCheck {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}

.HomeSideBrowserPane-ViewportSearchInput {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideBrowserPane-ViewportCats {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.HomeSideBrowserPane-ViewportCatBtn {
  padding: 2px 7px;
  border: none;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.HomeSideBrowserPane-ViewportList {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 240px;
  overflow-y: auto;
}

.HomeSideBrowserPane-ViewportOption {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -1px;
  }
}

.HomeSideBrowserPane-ViewportOptionLead {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.HomeSideBrowserPane-ViewportOptionName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideBrowserPane-ViewportOptionMeta {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.HomeSideBrowserPane-ViewportOptionDim {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.HomeSideBrowserPane-ViewportOptionCheck {
  color: var(--shell-primary);
}

.HomeSideBrowserPane-ViewportEmpty {
  padding: 14px 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  text-align: center;
}

.HomeSideBrowserPane-State {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.HomeSideBrowserPane-StateIcon {
  color: var(--shell-text-muted);
  font-size: 28px;
}

.HomeSideBrowserPane-StateText {
  margin: 0;
  max-width: 280px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.HomeSideBrowserPane-StateActions {
  display: flex;
  gap: 8px;
}

.HomeSideBrowserPane-Snapshot {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
