import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

interface AsyncRecord {
  key: string
  refresh: Mock
}

interface GovernancePageContext {
  summaryDays: { value: number }
  refreshAll: () => Promise<void>
  notifyStorageAlerts: (mode: 'plan' | 'send') => Promise<void>
  saveMessage: { value: string }
  storageAlertNotifyError: { value: string }
  storageAlertNotifying: { value: boolean }
  storageAlertNotifyResult: { value: unknown }
}

interface GovernancePageOptions {
  role: 'admin' | 'member'
  failStorageNotification?: boolean
}

interface GovernancePageInstance {
  context: GovernancePageContext
  asyncRecords: AsyncRecord[]
  navigateTo: Mock
  requestJson: Mock
  refreshOrder: string[]
  dispose: () => void
}

interface AsyncDataOptions {
  default?: () => unknown
  watch?: unknown[]
}

interface GovernancePageDependencies {
  locale: { value: string }
  user: { value: { role: 'admin' | 'member' } }
  navigateTo: Mock
  requestJson: Mock
  useAsyncData: (key: string, loader: () => Promise<unknown>, config?: AsyncDataOptions) => Promise<unknown>
  onMounted: (callback: () => void) => void
}

interface GovernanceFacadeModule {
  setupGovernanceFacade: (dependencies: unknown) => Promise<GovernancePageContext>
}

interface GovernanceFacadeSetup {
  (dependencies: GovernancePageDependencies): Promise<GovernancePageContext>
}

const governancePageSource = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')
const governancePageScript = parse(governancePageSource).descriptor.scriptSetup?.content

if (!governancePageScript)
  throw new Error('Expected governance page script setup.')

const governancePageScriptWithoutImports = governancePageScript.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')

function isGovernanceFacadeModule(value: unknown): value is GovernanceFacadeModule {
  return typeof value === 'object'
    && value !== null
    && 'setupGovernanceFacade' in value
    && typeof value.setupGovernanceFacade === 'function'
}

async function compileGovernanceFacade(): Promise<GovernanceFacadeSetup> {
  const executable = `
export async function setupGovernanceFacade(dependencies) {
  const { computed, onMounted, reactive, ref, watch } = dependencies.vue
  const { createGovernanceFormatters } = dependencies.governance
  const { defineI18nRoute, definePageMeta, navigateTo, useAuthUser, useAsyncData, useI18n } = dependencies.nuxt
  const { requestJson } = dependencies.request
${governancePageScriptWithoutImports}
  return {
    summaryDays,
    refreshAll,
    notifyStorageAlerts,
    saveMessage,
    storageAlertNotifyError,
    storageAlertNotifying,
    storageAlertNotifyResult,
  }
}
`
  const { code } = await transform(executable, {
    format: 'esm',
    loader: 'ts',
    target: 'esnext',
  })
  // The current SFC script is assembled at runtime, so no static module specifier exists.
  const compiledModule: unknown = await import(`data:text/javascript,${encodeURIComponent(code)}`)

  if (!isGovernanceFacadeModule(compiledModule))
    throw new Error('Expected governance page module to export setupGovernanceFacade.')

  return async page => await compiledModule.setupGovernanceFacade({
    governance: {
      createGovernanceFormatters: () => ({}),
    },
    request: {
      requestJson: page.requestJson,
    },
    vue: {
      computed,
      onMounted: page.onMounted,
      reactive,
      ref,
      watch,
    },
    nuxt: {
      defineI18nRoute: () => undefined,
      definePageMeta: () => undefined,
      navigateTo: page.navigateTo,
      useAuthUser: () => ({ user: page.user }),
      useAsyncData: page.useAsyncData,
      useI18n: () => ({ t: (_key: string, fallback: string) => fallback, te: () => false, locale: page.locale }),
    },
  })
}

let setupGovernanceFacade: GovernanceFacadeSetup

beforeAll(async () => {
  setupGovernanceFacade = await compileGovernanceFacade()
})

async function createGovernancePage(options: GovernancePageOptions): Promise<GovernancePageInstance> {
  const asyncRecords: AsyncRecord[] = []
  const refreshOrder: string[] = []
  const stopWatchers: Array<() => void> = []
  const mountedCallbacks: Array<() => void> = []
  const navigateTo = vi.fn()
  const user = ref({ role: options.role })
  const requestJson = vi.fn(async (url: string) => {
    if (url === '/api/dashboard/storage/policies') {
      return {
        policies: [],
        evaluations: [],
        alerts: [{
          policyId: 'r2-primary',
          name: 'Primary storage',
          channel: 'r2',
          provider: 'cloudflare-r2',
          status: 'warning',
          metric: 'storedBytes',
          limitKey: 'maxBytes',
          usage: 90,
          limit: 100,
          utilization: 0.9,
          reasons: ['max-bytes-warning'],
        }],
        profiles: [],
        generatedAt: '2026-07-12T00:00:00.000Z',
      }
    }

    if (url === '/api/dashboard/storage/alerts/notify') {
      if (options.failStorageNotification)
        throw new Error('delivery gateway unavailable')

      return {
        mode: 'send',
        days: 30,
        alerts: [],
        dispatches: [{ alert: { policyId: 'r2-primary' }, deliveries: [] }],
        generatedAt: '2026-07-12T00:00:00.000Z',
      }
    }

    return {}
  })

  const trackedWatch = (...args: Parameters<typeof watch>) => {
    const stop = watch(...args)
    stopWatchers.push(stop)
    return stop
  }

  const useAsyncData = async (key: string, loader: () => Promise<unknown>, config: AsyncDataOptions = {}) => {
    const data = ref(config.default?.())
    const pending = ref(false)
    const error = ref<unknown>(null)
    const refresh = vi.fn(async () => {
      refreshOrder.push(key)
      pending.value = true
      try {
        data.value = await loader()
        error.value = null
      }
      catch (cause) {
        error.value = cause
      }
      finally {
        pending.value = false
      }
    })

    asyncRecords.push({ key, refresh })
    await refresh()
    for (const source of config.watch ?? [])
      trackedWatch(source as never, () => { void refresh() })

    return { data, pending, error, refresh }
  }

  const context = await setupGovernanceFacade({
    locale: ref('en'),
    user,
    navigateTo,
    requestJson,
    useAsyncData,
    onMounted: callback => mountedCallbacks.push(callback),
  })
  for (const callback of mountedCallbacks)
    callback()
  return {
    context,
    asyncRecords,
    navigateTo,
    requestJson,
    refreshOrder,
    dispose: () => stopWatchers.splice(0).forEach(stop => stop()),
  }
}

async function flushReactiveWork(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('dashboard governance page runtime contract', () => {
  it('redirects signed-in non-admins while allowing administrators to retain the page', async () => {
    const memberPage = await createGovernancePage({ role: 'member' })
    const adminPage = await createGovernancePage({ role: 'admin' })

    expect(memberPage.navigateTo).toHaveBeenCalledOnce()
    expect(memberPage.navigateTo).toHaveBeenCalledWith('/dashboard/overview')
    expect(adminPage.navigateTo).not.toHaveBeenCalled()

    memberPage.dispose()
    adminPage.dispose()
  })

  it('keeps stable async-data identities and refreshes the scoped storage aggregate when its summary range changes', async () => {
    const page = await createGovernancePage({ role: 'admin' })

    expect(page.asyncRecords.map(record => record.key)).toEqual([
      'dashboard-governance-summary',
      'dashboard-governance-configs',
      'dashboard-governance-d1-readiness',
      'dashboard-governance-analytics',
      'dashboard-governance-report',
      'dashboard-governance-storage-policies',
      'dashboard-governance-storage-credentials',
      'dashboard-governance-notification-credentials',
      'dashboard-governance-notification-channels',
      'dashboard-governance-storage-channel-analytics',
    ])

    page.requestJson.mockClear()
    const storageChannelRefresh = page.asyncRecords.find(record => record.key === 'dashboard-governance-storage-channel-analytics')!.refresh
    storageChannelRefresh.mockClear()

    page.context.summaryDays.value = 7
    await flushReactiveWork()

    expect(storageChannelRefresh).toHaveBeenCalledOnce()
    expect(page.requestJson).toHaveBeenCalledWith('/api/dashboard/storage/channels/analytics', {
      query: expect.objectContaining({ days: 7 }),
    })

    page.dispose()
  })

  it('starts every governance aggregate refresh in the facade-defined order', async () => {
    const page = await createGovernancePage({ role: 'admin' })
    page.refreshOrder.splice(0)

    await page.context.refreshAll()

    expect(page.refreshOrder).toEqual([
      'dashboard-governance-summary',
      'dashboard-governance-configs',
      'dashboard-governance-analytics',
      'dashboard-governance-report',
      'dashboard-governance-storage-policies',
      'dashboard-governance-storage-channel-analytics',
      'dashboard-governance-storage-credentials',
      'dashboard-governance-notification-credentials',
      'dashboard-governance-notification-channels',
      'dashboard-governance-d1-readiness',
    ])

    page.dispose()
  })

  it.each([
    {
      name: 'reports successful storage alert dispatches to the governance feedback surface',
      failStorageNotification: false,
      expectedMessage: 'Storage alert notifications sent.',
      expectedError: '',
    },
    {
      name: 'surfaces storage alert delivery failures without retaining a stale success message',
      failStorageNotification: true,
      expectedMessage: '',
      expectedError: 'delivery gateway unavailable',
    },
  ])('$name', async ({ failStorageNotification, expectedMessage, expectedError }) => {
    const page = await createGovernancePage({ role: 'admin', failStorageNotification })
    page.requestJson.mockClear()
    page.context.summaryDays.value = 21
    await page.context.notifyStorageAlerts('send')

    expect(page.requestJson).toHaveBeenCalledWith('/api/dashboard/storage/alerts/notify', {
      method: 'POST',
      body: { mode: 'send', days: 21 },
    })
    expect(page.context.saveMessage.value).toBe(expectedMessage)
    expect(page.context.storageAlertNotifyError.value).toBe(expectedError)
    expect(page.context.storageAlertNotifying.value).toBe(false)

    if (failStorageNotification)
      expect(page.context.storageAlertNotifyResult.value).toBeNull()
    else
      expect(page.context.storageAlertNotifyResult.value).toMatchObject({ mode: 'send' })

    page.dispose()
  })
})
