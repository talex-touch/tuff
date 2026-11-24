<script lang="ts" name="HomeSideBrowserPane" setup>
import type {
  BrowserSideState,
  BrowserViewportRequest
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { TxButton } from '@talex-touch/tuffex/button'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
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
const viewportRef = ref<HTMLElement | null>(null)
const snapshot = ref<string | null>(null)
const overlayOpen = ref(false)
const localError = ref('')

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
  const x = Math.max(0, Math.ceil(rect.left))
  const y = Math.max(0, Math.ceil(rect.top))
  const width = Math.max(0, Math.floor(Math.min(rect.right, window.innerWidth)) - x)
  const height = Math.max(0, Math.floor(Math.min(rect.bottom, window.innerHeight)) - y)
  enqueueViewport({ visible: width > 0 && height > 0, bounds: { x, y, width, height } })
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

onMounted(() => {
  if (sdk) {
    unsubscribeChanged = sdk.onSideChanged(applyState)
    unsubscribeSnapshot = sdk.onSideSnapshot(({ snapshot: next }) => {
      if (!disposed) snapshot.value = next
    })
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleViewport)
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

    <div ref="viewportRef" class="HomeSideBrowserPane-Viewport">
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

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
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

.HomeSideBrowserPane-Viewport {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-bg);
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
