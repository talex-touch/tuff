import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type NexusAuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface RefLike<T> {
  value: T
}

interface NexusAuth {
  data: Readonly<RefLike<{ user?: { email?: string | null } | null } | null | undefined>>
  status: Readonly<RefLike<NexusAuthStatus>>
}

interface AppRootModule {
  initializeApp: (dependencies: Record<string, unknown>) => Promise<void>
}

const nuxtState = new Map<string, Ref<unknown>>()
const fetchSession = vi.fn()
let initializeApp: AppRootModule['initializeApp'] | null = null

function useTestState<T>(key: string, initializer: () => T): Ref<T> {
  const existing = nuxtState.get(key)
  if (existing)
    return existing as Ref<T>

  const state = ref(initializer()) as Ref<T>
  nuxtState.set(key, state)
  return state
}

function isAppRootModule(value: unknown): value is AppRootModule {
  return typeof value === 'object'
    && value !== null
    && 'initializeApp' in value
    && typeof value.initializeApp === 'function'
}

async function loadAuth(): Promise<{ useNexusAuth: () => NexusAuth }> {
  return await import('~/composables/useNexusAuth')
}

async function compileAppInitializer(): Promise<AppRootModule['initializeApp']> {
  const source = readFileSync(new URL('../app.vue', import.meta.url), 'utf8')
  const script = parse(source).descriptor.scriptSetup?.content
  if (!script)
    throw new Error('Expected app.vue to use script setup.')

  const scriptWithoutImports = script.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')
  const executable = `
export async function initializeApp(dependencies) {
  const { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch, watchEffect } = dependencies.vue
  const { resolveDocsLocaleFromRoute } = dependencies.docs
  const { sanitizeRedirect } = dependencies.oauth
  const { appName, toastHostRequestedEvent } = dependencies.constants
  const {
    useCookie,
    useGlobalSearchState,
    useHead,
    useLocaleOrchestrator,
    useNexusAuth,
    useRoute,
    useRouter,
    useState,
  } = dependencies.nuxt
${scriptWithoutImports}
}
`
  const { code } = await transform(executable, {
    format: 'esm',
    loader: 'ts',
    target: 'esnext',
  })
  const compiledModule: unknown = await import(`data:text/javascript,${encodeURIComponent(code)}`)
  if (!isAppRootModule(compiledModule))
    throw new Error('Expected compiled app root initializer.')

  return compiledModule.initializeApp
}

beforeAll(() => {
  vi.stubGlobal('$fetch', fetchSession)
  vi.stubGlobal('useRequestEvent', () => ({ path: '/' }))
  vi.stubGlobal('useRequestHeaders', () => ({}))
  vi.stubGlobal('useState', useTestState)
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

beforeEach(() => {
  nuxtState.clear()
  fetchSession.mockReset()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('Nexus public-session lifecycle', () => {
  it('keeps an uninitialized session in loading state', async () => {
    const { useNexusAuth } = await loadAuth()

    expect(useNexusAuth().status.value).toBe('loading')
  })

  it('reconciles a valid browser session from the root mount and exposes it as authenticated', async () => {
    const { useNexusAuth } = await loadAuth()
    const auth = useNexusAuth()
    const mountedCallbacks: Array<() => void> = []
    fetchSession.mockResolvedValue({
      user: { email: 'member@example.com' },
    })

    initializeApp ??= await compileAppInitializer()
    await initializeApp({
      constants: {
        appName: 'Tuff',
        toastHostRequestedEvent: 'nexus:toast-host',
      },
      docs: {
        resolveDocsLocaleFromRoute: () => null,
      },
      nuxt: {
        useCookie: () => ref(null),
        useGlobalSearchState: () => ({
          closeSearch: () => undefined,
          open: ref(false),
          summonSearch: () => undefined,
        }),
        useHead: () => undefined,
        useLocaleOrchestrator: () => ({
          initLocale: async () => undefined,
          reconcileClientLocale: async () => undefined,
          setLocaleSerial: async () => undefined,
          syncFromProfileOnAuth: async () => undefined,
        }),
        useNexusAuth,
        useRoute: () => ({
          fullPath: '/',
          meta: {},
          path: '/',
          query: {},
        }),
        useRouter: () => ({ replace: vi.fn() }),
        useState: useTestState,
      },
      oauth: {
        sanitizeRedirect: (_value: unknown, fallback: string) => fallback,
      },
      vue: {
        computed,
        defineAsyncComponent: () => ({}),
        onBeforeUnmount: () => undefined,
        onMounted: (callback: () => void) => mountedCallbacks.push(callback),
        ref,
        watch: () => () => undefined,
        watchEffect: () => undefined,
      },
    })

    for (const callback of mountedCallbacks)
      callback()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchSession).toHaveBeenCalledOnce()
    expect(auth.status.value).toBe('authenticated')
    expect(auth.data.value?.user?.email).toBe('member@example.com')
  })
})
