import { hasDocument } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Resolves `'auto'` against the document root the same way TxMarkdownView
 * does (data-theme attribute first, then light/dark classes), kept as a
 * composable so TxStreamMarkdown and its fenced-block renderers share one
 * observer instead of three.
 */
export function useAutoTheme(theme: () => 'light' | 'dark' | 'auto') {
  const autoTheme = ref<'light' | 'dark'>('light')
  let observer: MutationObserver | null = null

  function detect(): 'light' | 'dark' {
    if (!hasDocument())
      return 'light'

    const root = document.documentElement
    const body = document.body
    const dataTheme = root.getAttribute('data-theme') || body?.getAttribute('data-theme')

    if (dataTheme === 'dark')
      return 'dark'
    if (dataTheme === 'light')
      return 'light'
    if (root.classList.contains('dark') || body?.classList.contains('dark'))
      return 'dark'

    return 'light'
  }

  function observe(): void {
    if (!hasDocument() || typeof MutationObserver === 'undefined')
      return

    observer?.disconnect()
    observer = new MutationObserver(() => {
      autoTheme.value = detect()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
  }

  function disconnect(): void {
    observer?.disconnect()
    observer = null
  }

  watch(
    theme,
    (next) => {
      if (next === 'auto') {
        autoTheme.value = detect()
        observe()
        return
      }
      disconnect()
    },
    { immediate: true },
  )

  onBeforeUnmount(disconnect)

  return computed<'light' | 'dark'>(() => {
    const preference = theme()
    return preference === 'auto' ? autoTheme.value : preference
  })
}
