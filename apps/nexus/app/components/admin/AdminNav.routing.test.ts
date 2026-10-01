import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import { computed, ref } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ComputedRef } from 'vue'
import { isAdminAccountRole } from '~/utils/account-role'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

interface NavState {
  role?: string | null
  path?: string
  query?: Record<string, string>
  riskFlag?: unknown
  mounted?: boolean
}

interface MenuItem {
  id: string
  label: string
  icon: string
  to: string
}

interface MenuGroup {
  id: string
  label: string
  items: MenuItem[]
}

interface AdminNavFacade {
  sectionPaths: Record<string, string>
  menuGroups: ComputedRef<MenuGroup[]>
  menuItems: ComputedRef<MenuItem[]>
  activeSection: ComputedRef<string>
  activeLabel: ComputedRef<string>
  riskControlEnabled: ComputedRef<boolean>
}

interface AdminNavModule {
  setupAdminNav: (dependencies: Record<string, unknown>) => AdminNavFacade
}

const source = readFileSync(new URL('./AdminNav.vue', import.meta.url), 'utf8')
const scriptSetup = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]

if (!scriptSetup)
  throw new Error('Expected AdminNav script setup.')

const scriptWithoutImports = scriptSetup.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')

async function compileAdminNav(): Promise<AdminNavModule['setupAdminNav']> {
  const executable = `
export function setupAdminNav(dependencies) {
  const { computed, onBeforeUnmount, onMounted, ref } = dependencies.vue
  const { useAccountRole, useHead, useI18n, useRoute, useRuntimeConfig } = dependencies.nuxt
  const { isFeatureFlagEnabled } = dependencies.featureFlags
  const window = dependencies.window
${scriptWithoutImports}
  return {
    sectionPaths,
    menuGroups,
    menuItems,
    activeSection,
    activeLabel,
    riskControlEnabled,
  }
}
`
  const { code } = await transform(executable, {
    format: 'esm',
    loader: 'ts',
    target: 'esnext',
  })
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const compiledModule: unknown = await import(moduleUrl)

  if (!isAdminNavModule(compiledModule))
    throw new Error('Expected AdminNav module to export setupAdminNav.')

  return compiledModule.setupAdminNav
}

function isAdminNavModule(value: unknown): value is AdminNavModule {
  return typeof value === 'object'
    && value !== null
    && 'setupAdminNav' in value
    && typeof value.setupAdminNav === 'function'
}

let setupAdminNav: AdminNavModule['setupAdminNav']

beforeAll(async () => {
  setupAdminNav = await compileAdminNav()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function evaluateNav(state: NavState = {}): AdminNavFacade {
  const role = state.role === undefined ? 'admin' : state.role
  const matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

  return setupAdminNav({
    featureFlags: { isFeatureFlagEnabled },
    nuxt: {
      useAccountRole: () => ({ isAdmin: computed(() => isAdminAccountRole(role)) }),
      useHead: vi.fn(),
      useI18n: () => ({ t: (key: string) => key }),
      useRoute: () => ({
        path: state.path ?? '/admin/updates',
        query: state.query ?? {},
      }),
      useRuntimeConfig: () => ({ public: { riskControl: { enabled: state.riskFlag } } }),
    },
    vue: {
      computed,
      onBeforeUnmount: vi.fn(),
      onMounted: (callback: () => void) => {
        if (state.mounted !== false)
          callback()
      },
      ref,
    },
    window: { matchMedia },
  })
}

function routeOf(href: string): { path: string, query: Record<string, string> } {
  const [path, search = ''] = href.split('?')
  return { path: path!, query: Object.fromEntries(new URLSearchParams(search)) }
}

const ANALYTICS_SECTION_CASES = [
  'overview',
  'performance',
  'search',
  'intelligence',
  'docs',
  'exchange',
  'messages',
  'unknown',
] as const

describe('AdminNav consumer routing', () => {
  it('publishes the current AI, comment, and activation-code destinations', () => {
    const nav = evaluateNav({ riskFlag: false })
    const groups = new Map(nav.menuGroups.value.map(group => [group.id, group]))

    expect(groups.get('intelligence')?.items.map(item => [item.id, item.to])).toEqual([
      ['intelligence-overview', '/admin/intelligence-overview'],
      ['provider-registry', '/admin/provider-registry'],
      ['intelligence-audits', '/admin/intelligence-audits'],
    ])
    expect(groups.get('content')?.items.filter(item => ['reviews', 'doc-comments'].includes(item.id)).map(item => [item.id, item.to]))
      .toEqual([['reviews', '/admin/reviews?tab=plugins']])
    expect(groups.get('accounts')?.items.map(item => [item.id, item.to])).toEqual([
      ['users', '/admin/users'],
      ['subscriptions', '/admin/subscriptions'],
    ])
    expect(groups.get('analytics')?.items.map(item => [item.id, item.to]))
      .toEqual([['analytics', '/admin/analytics']])
  })

  it('does not expose deleted intelligence or comment destinations', () => {
    const nav = evaluateNav()
    const ids = nav.menuItems.value.map(item => item.id)

    for (const removedId of [
      'intelligence',
      'intelligence-agent',
      'intelligence-chat',
      'intelligence-lab',
      'doc-comments',
    ])
      expect(ids).not.toContain(removedId)

    for (const removedId of [
      'intelligence',
      'intelligence-chat',
      'doc-comments',
    ])
      expect(Object.keys(nav.sectionPaths)).not.toContain(removedId)
  })

  it('round-trips every rendered href through the production active-route resolver', () => {
    const nav = evaluateNav({ riskFlag: true })

    for (const item of nav.menuItems.value) {
      const route = routeOf(item.to)
      expect(evaluateNav(route).activeSection.value, `${item.id} -> ${item.to}`).toBe(item.id)
    }
  })

  it.each([
    [{ path: '/admin/reviews', query: { tab: 'plugins' } }, 'reviews'],
    [{ path: '/admin/reviews', query: { tab: 'docs' } }, 'reviews'],
    [{ path: '/admin/codes', query: {} }, 'subscriptions'],
    [{ path: '/admin/credits', query: {} }, 'users'],
    [{ path: '/admin/users/123', query: {} }, 'users'],
  ])('resolves %o to the single owning rail entry', (route, expected) => {
    expect(evaluateNav(route).activeSection.value).toBe(expected)
  })

  it.each([
    '/admin/intelligence',
    '/admin/intelligence-agent',
    '/admin/intelligence-chat',
    '/admin/intelligence-lab',
    '/admin/doc-comments',
    '/admin/unknown-section',
  ])('falls back safely for removed or unknown route %s', (path) => {
    expect(evaluateNav({ path }).activeSection.value).toBe('updates')
  })

  it.each(ANALYTICS_SECTION_CASES)('keeps analytics section %s on the one analytics rail destination', (section) => {
    expect(evaluateNav({ path: '/admin/analytics', query: { section } }).activeSection.value).toBe('analytics')
  })
})

describe('AdminNav visibility boundaries', () => {
  const SHOWN = [true, 1, '1', 'true', 'on', 'yes']
  const HIDDEN = [false, 0, '0', 'false', 'off', 'no', undefined, null, '', 'maybe']

  it.each(SHOWN)('shows the risk destination for enabled flag %o', (flag) => {
    const nav = evaluateNav({ riskFlag: flag })
    expect(nav.riskControlEnabled.value).toBe(true)
    expect(nav.menuItems.value.find(item => item.id === 'risk')?.to).toBe('/admin/risk')
  })

  it.each(HIDDEN)('hides only the risk destination for disabled flag %o', (flag) => {
    const withoutRisk = evaluateNav({ riskFlag: flag }).menuItems.value.map(item => item.id)
    const withRisk = evaluateNav({ riskFlag: true }).menuItems.value.map(item => item.id)

    expect(withoutRisk).not.toContain('risk')
    expect(withRisk.filter(id => id !== 'risk')).toEqual(withoutRisk)
  })

  it.each(['user', 'USER', 'moderator', '', 'administrator'])('denies menu disclosure to role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).menuItems.value).toEqual([])
  })

  it.each(['admin', 'ADMIN', 'Admin'])('allows menu disclosure to administrator role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).menuItems.value.length).toBeGreaterThan(0)
  })

  it('keeps signed-out and pre-hydration consumers closed', () => {
    expect(evaluateNav({ role: null, riskFlag: true }).menuItems.value).toEqual([])
    expect(evaluateNav({ role: 'admin', mounted: false, riskFlag: true }).menuItems.value).toEqual([])
  })
})
