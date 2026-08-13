import { onBeforeUnmount, readonly, ref, watch, type Ref } from 'vue'
import { buildWidgetSandboxDocument, WIDGET_SANDBOX_MESSAGE } from './sandbox-document'
// The arrow runtime as text, not as a module: the sandbox is a separate
// document with an opaque origin and cannot reach anything in this bundle.
// Served by `widgetSandboxRuntimePlugin` in electron.vite.config.ts — a virtual
// module rather than an alias into node_modules, which the dev server's
// dependency optimizer would try to pre-bundle and then fail to serve.
import arrowRuntimeSource from 'virtual:widget-sandbox-runtime'

/** A widget shorter than this is almost certainly a failed render, not a small one. */
const MIN_HEIGHT = 48
/** Nothing model-authored gets to own the viewport; past this it scrolls itself. */
const MAX_HEIGHT = 640
/** No `ready` by then and the widget is treated as broken, not as slow. */
const READY_TIMEOUT_MS = 4000

export type WidgetSandboxStatus = 'loading' | 'ready' | 'failed'

export interface UseWidgetSandboxReturn {
  status: Readonly<Ref<WidgetSandboxStatus>>
  /** Present only when `status` is `failed`; shown to the user verbatim. */
  error: Readonly<Ref<string>>
  height: Readonly<Ref<number>>
  srcdoc: Readonly<Ref<string>>
}

/**
 * Hosts one model-authored widget in an origin-isolated frame.
 *
 * The isolation is the frame's, not this composable's — an opaque-origin
 * sandbox frame runs in its own process, which is what makes it safe to run
 * code nobody reviewed. Measured in Electron 41: a busy loop inside such a
 * frame leaves the app at full frame rate, while the same loop in a plain
 * same-origin iframe freezes it (see the task's isolation probe).
 *
 * What is left for the host is everything the frame cannot be trusted to do
 * for itself: bound its height, notice when it never came up, and keep the
 * provenance badge outside where the widget cannot paint over it.
 */
export function useWidgetSandbox(
  source: Ref<string>,
  frame: Ref<HTMLIFrameElement | null>
): UseWidgetSandboxReturn {
  const status = ref<WidgetSandboxStatus>('loading')
  const error = ref('')
  const height = ref(MIN_HEIGHT)
  const srcdoc = ref('')
  let readyTimer: ReturnType<typeof setTimeout> | null = null

  function clearReadyTimer(): void {
    if (readyTimer === null) return
    clearTimeout(readyTimer)
    readyTimer = null
  }

  function fail(message: string): void {
    clearReadyTimer()
    status.value = 'failed'
    error.value = message
  }

  function onMessage(event: MessageEvent): void {
    // Identity is the window reference, never `event.origin`: an opaque origin
    // reports the literal string "null", which any other frame can also present.
    if (!frame.value || event.source !== frame.value.contentWindow) return

    const data = event.data
    if (typeof data !== 'object' || data === null) return
    const type = (data as { type?: unknown }).type

    if (type === WIDGET_SANDBOX_MESSAGE.ready) {
      clearReadyTimer()
      status.value = 'ready'
      return
    }
    if (type === WIDGET_SANDBOX_MESSAGE.error) {
      const message = (data as { message?: unknown }).message
      fail(typeof message === 'string' ? message : 'unknown error')
      return
    }
    if (type === WIDGET_SANDBOX_MESSAGE.height) {
      const px = (data as { px?: unknown }).px
      if (typeof px !== 'number' || !Number.isFinite(px)) return
      height.value = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(px)))
    }
  }

  watch(
    source,
    (value) => {
      clearReadyTimer()
      status.value = 'loading'
      error.value = ''
      height.value = MIN_HEIGHT
      srcdoc.value = buildWidgetSandboxDocument({
        source: value,
        runtimeSource: arrowRuntimeSource
      })
      // A frame that never reports back is indistinguishable from one still
      // working; after this it is treated as broken so the reader sees the
      // tool's own output instead of an empty box forever.
      readyTimer = setTimeout(() => {
        if (status.value === 'loading') fail('widget did not start')
      }, READY_TIMEOUT_MS)
    },
    { immediate: true }
  )

  window.addEventListener('message', onMessage)

  onBeforeUnmount(() => {
    clearReadyTimer()
    window.removeEventListener('message', onMessage)
  })

  return {
    status: readonly(status),
    error: readonly(error),
    height: readonly(height),
    srcdoc: readonly(srcdoc)
  }
}
