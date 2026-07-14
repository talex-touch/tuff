import { hasWindow } from '@talex-touch/utils/env'
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface DialogAutoSizerResizeObserver {
  observe: (element: HTMLElement) => void
  disconnect: () => void
}

export interface DialogAutoSizerDomAdapter {
  schedule: (callback: () => void) => void
  getViewportHeight: () => number | null
  addViewportResizeListener: (listener: () => void) => void
  removeViewportResizeListener: (listener: () => void) => void
  createResizeObserver?: (callback: () => void) => DialogAutoSizerResizeObserver | null
}

export interface DialogAutoSizerLifecycleOptions {
  isOpen: () => boolean
  getContentElement: () => HTMLElement | null
  minScrollableHeight: number
  minViewportScrollableHeight: number
  maxViewportScrollableHeight: number
  reset: () => void
  setScrollAreaHeight: (height: number) => void
  setMaxScrollableHeight: (height: number) => void
  dom: DialogAutoSizerDomAdapter
}

export interface DialogAutoSizerOptions {
  isOpen: Readonly<Ref<boolean>>
  contentRef: Readonly<Ref<HTMLElement | null>>
  minScrollableHeight: number
  minViewportScrollableHeight: number
  maxViewportScrollableHeight: number
  reset: () => void
  dom?: DialogAutoSizerDomAdapter
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum))
}

function createBrowserDomAdapter(): DialogAutoSizerDomAdapter {
  return {
    schedule: callback => nextTick(callback),
    getViewportHeight: () => hasWindow() ? window.innerHeight : null,
    addViewportResizeListener: (listener) => {
      if (hasWindow())
        window.addEventListener('resize', listener, { passive: true })
    },
    removeViewportResizeListener: (listener) => {
      if (hasWindow())
        window.removeEventListener('resize', listener)
    },
    createResizeObserver: typeof ResizeObserver === 'undefined'
      ? undefined
      : callback => new ResizeObserver(callback),
  }
}

export function createDialogAutoSizerLifecycle(options: DialogAutoSizerLifecycleOptions) {
  let observer: DialogAutoSizerResizeObserver | null = null
  let disposed = false

  const resolveMaxScrollableHeight = () => {
    const viewportHeight = options.dom.getViewportHeight()
    if (viewportHeight === null)
      return 620

    return clamp(
      Math.floor(viewportHeight * 0.68),
      options.minViewportScrollableHeight,
      options.maxViewportScrollableHeight,
    )
  }

  const cleanupObserver = () => {
    observer?.disconnect()
    observer = null
  }

  const scheduleMeasure = () => {
    if (disposed || !options.isOpen())
      return

    options.dom.schedule(() => {
      if (disposed || !options.isOpen())
        return

      const contentElement = options.getContentElement()
      if (!contentElement)
        return

      const measuredHeight = Math.ceil(contentElement.scrollHeight)
      if (measuredHeight <= 0)
        return

      options.setScrollAreaHeight(clamp(
        measuredHeight,
        options.minScrollableHeight,
        resolveMaxScrollableHeight(),
      ))
    })
  }

  const setupObserver = () => {
    cleanupObserver()

    const contentElement = options.getContentElement()
    if (!contentElement)
      return

    observer = options.dom.createResizeObserver?.(scheduleMeasure) ?? null
    observer?.observe(contentElement)
  }

  const open = () => {
    if (disposed)
      return

    options.reset()
    options.setMaxScrollableHeight(resolveMaxScrollableHeight())
    options.dom.schedule(() => {
      if (disposed || !options.isOpen())
        return

      setupObserver()
      scheduleMeasure()
    })
  }

  const close = () => {
    cleanupObserver()
  }

  const resize = () => {
    if (disposed || !options.isOpen())
      return

    options.setMaxScrollableHeight(resolveMaxScrollableHeight())
    scheduleMeasure()
  }

  const mount = () => {
    if (!disposed)
      options.dom.addViewportResizeListener(resize)
  }

  const dispose = () => {
    if (disposed)
      return

    disposed = true
    cleanupObserver()
    options.dom.removeViewportResizeListener(resize)
  }

  return { open, close, dispose, mount, scheduleMeasure }
}

export function useDialogAutoSizer(options: DialogAutoSizerOptions) {
  const scrollAreaHeight = ref(420)
  const maxScrollableHeight = ref(620)
  const lifecycle = createDialogAutoSizerLifecycle({
    isOpen: () => options.isOpen.value,
    getContentElement: () => options.contentRef.value,
    minScrollableHeight: options.minScrollableHeight,
    minViewportScrollableHeight: options.minViewportScrollableHeight,
    maxViewportScrollableHeight: options.maxViewportScrollableHeight,
    reset: options.reset,
    setScrollAreaHeight: height => scrollAreaHeight.value = height,
    setMaxScrollableHeight: height => maxScrollableHeight.value = height,
    dom: options.dom ?? createBrowserDomAdapter(),
  })

  watch(options.isOpen, isOpen => isOpen ? lifecycle.open() : lifecycle.close(), { immediate: true })
  onMounted(lifecycle.mount)
  onBeforeUnmount(lifecycle.dispose)

  return { maxScrollableHeight, scheduleMeasure: lifecycle.scheduleMeasure, scrollAreaHeight }
}
