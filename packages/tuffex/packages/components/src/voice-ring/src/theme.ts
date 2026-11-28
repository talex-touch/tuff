// Vue composable port of voice-ring/src/theme.ts
// (https://github.com/Jakubantalik/Libraries.dev — MIT © 2026 Jakub Antalik).
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VoiceRingTheme } from './types'
import { onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

function ancestorTheme(el: Element | null): boolean | null {
  let node: Element | null = el
  while (node) {
    const attr = node.getAttribute('data-theme')
    if (attr === 'dark') return true
    if (attr === 'light') return false
    if (node.classList.contains('dark')) return true
    if (node.classList.contains('light')) return false
    node = node.parentElement
  }
  return null
}

function systemDark(): boolean {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve the effective dark/light substrate for a mounted element, observing only ancestors. */
export function useVoiceRingTheme(
  theme: MaybeRefOrGetter<VoiceRingTheme>,
  hostRef: Ref<Element | null>,
): Ref<boolean> {
  const dark = ref(true)
  let mq: MediaQueryList | null = null
  let mo: MutationObserver | null = null

  function cleanup(): void {
    mq?.removeEventListener('change', resolve)
    mq = null
    mo?.disconnect()
    mo = null
  }

  function resolve(): void {
    const mode = toValue(theme)
    if (mode === 'dark') {
      dark.value = true
      return
    }
    if (mode === 'light') {
      dark.value = false
      return
    }
    dark.value = ancestorTheme(hostRef.value) ?? systemDark()
  }

  function bind(): void {
    cleanup()
    resolve()
    if (toValue(theme) !== 'auto' || typeof window === 'undefined') return
    if (typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', resolve)
    }
    if (typeof MutationObserver !== 'undefined' && hostRef.value) {
      mo = new MutationObserver(resolve)
      for (let node: Element | null = hostRef.value; node; node = node.parentElement) {
        mo.observe(node, { attributes: true, attributeFilter: ['class', 'data-theme'] })
      }
    }
  }

  onMounted(bind)
  watch(() => [toValue(theme), hostRef.value], bind, { flush: 'post' })
  onBeforeUnmount(cleanup)

  return dark
}
