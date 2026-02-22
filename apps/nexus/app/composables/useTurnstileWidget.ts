import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'

type TurnstileState = 'idle' | 'loading' | 'ready' | 'error'
type TurnstileWidgetId = string | number

interface TurnstileRenderOptions {
  sitekey: string
  theme?: 'light' | 'dark' | 'auto'
  action?: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

interface TurnstileApi {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId
  reset: (widgetId?: TurnstileWidgetId) => void
  remove?: (widgetId?: TurnstileWidgetId) => void
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let turnstileScriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (turnstileScriptPromise)
    return turnstileScriptPromise
  if (!hasDocument()) {
    turnstileScriptPromise = Promise.resolve()
    return turnstileScriptPromise
  }
  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
  if (existing) {
    turnstileScriptPromise = Promise.resolve()
    return turnstileScriptPromise
  }
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.dataset.turnstile = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('turnstile_script_load_failed'))
    document.head.appendChild(script)
  })
  return turnstileScriptPromise
}

function getTurnstileApi(): TurnstileApi | null {
  if (!hasWindow())
    return null
  return (window as any).turnstile as TurnstileApi | undefined || null
}

export function useTurnstileWidget() {
  const runtimeConfig = useRuntimeConfig()
  const token = ref('')
  const state = ref<TurnstileState>('idle')
  const widgetId = ref<TurnstileWidgetId | null>(null)
  const action = ref<string | null>(null)

  const siteKey = computed(() => {
    return typeof runtimeConfig.public?.turnstile?.siteKey === 'string'
      ? runtimeConfig.public.turnstile.siteKey.trim()
      : ''
  })

  async function render(container: string | HTMLElement, nextAction = 'watermark') {
    if (!siteKey.value)
      return
    state.value = 'loading'
    action.value = nextAction
    try {
      await loadScript()
      await nextTick()
      const turnstile = getTurnstileApi()
      if (!turnstile)
        throw new Error('turnstile_unavailable')
      widgetId.value = turnstile.render(container, {
        sitekey: siteKey.value,
        action: nextAction,
        callback: (value: string) => {
          token.value = value
        },
        'expired-callback': () => {
          token.value = ''
        },
        'error-callback': () => {
          state.value = 'error'
        },
      })
      state.value = 'ready'
    }
    catch {
      state.value = 'error'
    }
  }

  function reset() {
    const turnstile = getTurnstileApi()
    if (turnstile && widgetId.value !== null)
      turnstile.reset(widgetId.value)
    token.value = ''
    state.value = 'idle'
  }

  function remove() {
    const turnstile = getTurnstileApi()
    if (turnstile && widgetId.value !== null)
      turnstile.remove?.(widgetId.value)
    widgetId.value = null
    token.value = ''
    state.value = 'idle'
  }

  onBeforeUnmount(remove)

  return {
    token,
    state,
    action,
    siteKey,
    render,
    reset,
    remove,
  }
}
