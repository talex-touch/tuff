import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTeamRole } from '~/composables/useTeamRole'
import { noteSessionIdentity, sessionGeneration } from '~/utils/session-generation'

/**
 * The nav's reads at runtime: what it asks the server for when it mounts, when the dashboard is
 * entered again, and on route changes. Its script runs as a plain function with the Nuxt and Vue
 * pieces it uses passed in, the way `governance.runtime.test.ts` runs the governance page.
 */

const navSource = readFileSync(new URL('./DashboardNav.vue', import.meta.url), 'utf8')
const navScript = parse(navSource).descriptor.scriptSetup?.content
if (!navScript)
  throw new Error('Expected DashboardNav script setup.')

// The facade runs in the browser's place: `import.meta.client` is what the component sees there.
const navScriptBody = navScript
  .replace(/^import[\s\S]*?from [^\n]+\n/gm, '')
  .replaceAll('import.meta.client', 'true')

type NavSetup = (dependencies: Record<string, unknown>) => Promise<{ isTeamAdmin: { value: boolean } }>

let setupNav: NavSetup

beforeAll(async () => {
  const { code } = await transform(`
export async function setupNav(dependencies) {
  const { computed, onBeforeUnmount, onMounted, ref, watch } = dependencies.vue
  const { useAccountRole, useAuthUser, useHead, useI18n, useRoute, useState, useTeamRole, useTypedFetch } = dependencies.nuxt
  const { requestJson } = dependencies.request
  const { sessionGeneration } = dependencies.session
${navScriptBody}
  return { isTeamAdmin }
}
`, { format: 'esm', loader: 'ts', target: 'esnext' })
  const compiled = await import(`data:text/javascript,${encodeURIComponent(code)}`) as { setupNav: NavSetup }
  setupNav = compiled.setupNav
})

interface Visit {
  requests: string[]
  states: Map<string, ReturnType<typeof ref>>
  route: { path: string }
}

function createVisit(): Visit {
  return { requests: [], states: new Map(), route: reactive({ path: '/dashboard/overview' }) }
}

/** Mounts one nav into `visit`; the `useState` store is shared by every mount in a visit, as in the app. */
async function mountNav(visit: Visit) {
  const mounted: Array<() => void> = []
  const requestJson = vi.fn(async (url: string, options?: { query?: Record<string, unknown> }) => {
    visit.requests.push(options?.query?.view ? `${url}?view=${String(options.query.view)}` : url)
    if (url === '/api/dashboard/team')
      return { team: { type: 'organization', role: 'owner' } }
    return { unreadCount: 3 }
  })
  const context = await setupNav({
    vue: { computed, onBeforeUnmount: () => {}, onMounted: (callback: () => void) => mounted.push(callback), ref, watch },
    nuxt: {
      useAccountRole: () => ({ isAdmin: computed(() => false) }),
      // `refresh` is a forced profile read; the profile itself is already loaded.
      useAuthUser: () => ({ user: ref({ id: 'user_1' }), refresh: async () => { visit.requests.push('/api/user/me') }, isAuthenticated: computed(() => true) }),
      useHead: () => {},
      useI18n: () => ({ t: (key: string, fallback?: unknown) => typeof fallback === 'string' ? fallback : key }),
      useRoute: () => visit.route,
      useState: (key: string, init: () => unknown) => {
        if (!visit.states.has(key))
          visit.states.set(key, ref(init()))
        return visit.states.get(key)
      },
      useTeamRole,
      // Only the version before the cache read the team through `useFetch`.
      useTypedFetch: () => ({
        data: ref(null),
        refresh: async () => { visit.requests.push('/api/dashboard/team') },
      }),
    },
    request: { requestJson },
    session: { sessionGeneration },
  })
  for (const callback of mounted)
    callback()
  await flush()
  return context
}

async function flush() {
  await nextTick()
  for (let index = 0; index < 5; index += 1)
    await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'))
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  })
  noteSessionIdentity('user_1')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('dashboardNav reads', () => {
  it('reads the team summary and the unread count once when it mounts', async () => {
    const visit = createVisit()
    const nav = await mountNav(visit)

    expect(visit.requests).toEqual([
      '/api/dashboard/team?view=summary',
      '/api/dashboard/notifications/inbox/unread-count',
    ])
    expect(nav.isTeamAdmin.value).toBe(true)
  })

  it('asks nothing again when the dashboard is entered again within a minute', async () => {
    const visit = createVisit()
    await mountNav(visit)
    visit.requests.length = 0

    vi.setSystemTime(Date.now() + 30_000)
    const nav = await mountNav(visit)

    expect(visit.requests).toEqual([])
    expect(nav.isTeamAdmin.value).toBe(true)
  })

  it('refreshes the badge on a route change only once its answer is a minute old', async () => {
    const visit = createVisit()
    await mountNav(visit)
    visit.requests.length = 0

    visit.route.path = '/dashboard/devices'
    await flush()
    visit.route.path = '/dashboard/storage'
    await flush()
    expect(visit.requests).toEqual([])

    vi.setSystemTime(Date.now() + 61_000)
    visit.route.path = '/dashboard/account'
    await flush()
    expect(visit.requests).toEqual(['/api/dashboard/notifications/inbox/unread-count'])
  })

  it('reads the team again on the way into the team page, where it changes', async () => {
    const visit = createVisit()
    await mountNav(visit)
    visit.requests.length = 0

    visit.route.path = '/dashboard/team'
    await flush()

    expect(visit.requests).toEqual(['/api/dashboard/team?view=summary'])
  })

  it('does not reuse one account\'s answers for the next', async () => {
    const visit = createVisit()
    await mountNav(visit)
    visit.requests.length = 0

    noteSessionIdentity('user_2')
    await mountNav(visit)

    expect(visit.requests).toEqual([
      '/api/dashboard/team?view=summary',
      '/api/dashboard/notifications/inbox/unread-count',
    ])
  })
})
