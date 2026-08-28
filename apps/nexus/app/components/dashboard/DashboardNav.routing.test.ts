import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

/**
 * DashboardNav holds three parallel tables that have to agree — `sectionPaths`
 * (id → href), `adminMenuItems` (id → label) and `activeSection` (path → id) —
 * plus a fourth thing that lives elsewhere entirely: the page's own heading.
 * Nothing connected them, so they drifted: risk.vue rendered "Analytics
 * Dashboard" under a menu entry labelled Risk control, and two admin pages had
 * no path into them from any menu at all.
 *
 * The nav is `<script setup>`, and this package has no jsdom / test-utils, so
 * rather than restate the tables here — which is how a test starts agreeing
 * with a bug — the declarations are lifted out of the SFC and executed. If the
 * component is refactored so a declaration no longer exists, `declaration()`
 * throws instead of quietly testing nothing.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NAV_SOURCE = readFileSync(path.join(HERE, 'DashboardNav.vue'), 'utf8')

/**
 * The handful of type annotations inside the lifted blocks. Stripped from the
 * whole file before slicing, because the braces inside `Array<{ … }>` otherwise
 * balance the declaration early and truncate it to its signature.
 */
const RUNNABLE_SOURCE = NAV_SOURCE
  .replace(/: Record<[^>]*>/g, '')
  .replace(/: Array<\{[^}]*\}>/g, '')

/** Reads `const <name> = …` / `function <name>(…)` up to its balanced end. */
function declaration(name: string): string {
  const header = new RegExp(`^(?:const|function) ${name}\\b`, 'm').exec(RUNNABLE_SOURCE)
  if (!header)
    throw new Error(`DashboardNav no longer declares "${name}" — update this test with it.`)

  // For a `function`, the parameter list balances before the body does, so
  // start counting at the opening brace instead of at the name.
  const scanFrom = RUNNABLE_SOURCE.startsWith('function', header.index)
    ? RUNNABLE_SOURCE.indexOf('{', RUNNABLE_SOURCE.indexOf(')', header.index))
    : header.index

  let depth = 0
  let seenOpen = false
  for (let i = scanFrom; i < RUNNABLE_SOURCE.length; i++) {
    const char = RUNNABLE_SOURCE[i]!
    if ('{(['.includes(char)) {
      depth++
      seenOpen = true
    }
    else if ('})]'.includes(char)) {
      depth--
      if (seenOpen && depth === 0)
        return RUNNABLE_SOURCE.slice(header.index, i + 1)
    }
  }
  throw new Error(`Unbalanced declaration for "${name}".`)
}

interface NavState {
  role?: string | null
  path?: string
  riskFlag?: unknown
  mounted?: boolean
  canManageOauthApps?: boolean
}

interface MenuItem { id: string, label: string, icon: string, to: string }

interface NavBindings {
  sectionPaths: Record<string, string>
  adminMenuItems: MenuItem[]
  workspaceMenuItems: MenuItem[]
  accountMenuItems: MenuItem[]
  activeSection: string
  activeLabel: string
  riskControlEnabled: boolean
}

const LIFTED = [
  'isAdmin',
  'riskControlEnabled',
  'sectionPaths',
  'mapItems',
  'workspaceMenuItems',
  'accountMenuItems',
  'adminMenuItems',
  'activeLabel',
  'activeSection',
] as const

function evaluateNav(state: NavState = {}): NavBindings {
  const body = LIFTED.map(name => declaration(name)).join('\n\n')
  // Running the component's own source is the point: a hand-copied version of
  // these tables would go on passing after the component changed under it.
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'deps',
    `const { computed, t, route, mounted, user, runtimeConfig, isFeatureFlagEnabled, canManageOauthApps } = deps
${body}
return {
  sectionPaths,
  adminMenuItems: adminMenuItems.value,
  workspaceMenuItems: workspaceMenuItems.value,
  accountMenuItems: accountMenuItems.value,
  activeSection: activeSection.value,
  activeLabel: activeLabel.value,
  riskControlEnabled: riskControlEnabled.value,
}`,
  ) as (deps: Record<string, unknown>) => NavBindings

  return factory({
    computed,
    // Returning the key keeps assertions locale-independent; the locale files
    // are covered by dashboard-i18n-coverage / i18n-cjk-fallback-coverage.
    t: (key: string) => key,
    route: { path: state.path ?? '/dashboard/overview' },
    mounted: ref(state.mounted ?? true),
    user: ref(state.role === undefined ? { role: 'admin' } : state.role === null ? null : { role: state.role }),
    runtimeConfig: { public: { riskControl: { enabled: state.riskFlag } } },
    isFeatureFlagEnabled,
    canManageOauthApps: computed(() => state.canManageOauthApps ?? true),
  })
}

/**
 * The mapping every admin route resolves to today, captured off the component
 * before this test existed. `activeSection` is an ordered if-chain, so
 * `/dashboard/admin/intelligence-agent` only reaches `intelligence` because its
 * branch sits above the `…/intelligence` prefix branch. Reordering them is
 * silent; this table is what makes it loud.
 */
const SECTION_FOR_PATH: Record<string, string> = {
  '/dashboard': 'overview',
  '/dashboard/overview': 'overview',
  '/dashboard/assets': 'assets',
  '/dashboard/plugins': 'assets',
  '/dashboard/team': 'team',
  '/dashboard/account': 'account',
  '/dashboard/api-keys': 'api-keys',
  '/dashboard/oauth': 'oauth',
  '/dashboard/devices': 'devices',
  '/dashboard/storage': 'storage',
  '/dashboard/notifications': 'notifications',
  '/dashboard/privacy': 'privacy',
  '/dashboard/updates': 'updates',
  '/dashboard/images': 'images',
  '/dashboard/admin/users': 'users',
  '/dashboard/admin/users/123': 'users',
  '/dashboard/admin/subscriptions': 'users',
  '/dashboard/admin/codes': 'users',
  '/dashboard/admin/audits': 'audits',
  '/dashboard/admin/reviews': 'reviews',
  '/dashboard/admin/doc-comments': 'reviews',
  '/dashboard/admin/analytics': 'analytics',
  '/dashboard/admin/governance': 'governance',
  '/dashboard/admin/risk': 'risk',
  '/dashboard/admin/intelligence': 'intelligence',
  '/dashboard/admin/intelligence-agent': 'intelligence',
  '/dashboard/admin/intelligence-lab': 'intelligence',
  '/dashboard/admin/intelligence-chat': 'intelligence',
  '/dashboard/admin/provider-registry': 'intelligence',
  '/dashboard/unknown-section': 'overview',
}

describe('dashboardNav harness', () => {
  it('executes the declarations it means to test', () => {
    // Positive control. A harness that silently produced empty menus would let
    // every "is not shown" assertion below pass for the wrong reason.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    expect(LIFTED.every(name => declaration(name).length > 0)).toBe(true)
    expect(nav.adminMenuItems.length).toBeGreaterThan(5)
    expect(nav.workspaceMenuItems.length).toBeGreaterThan(1)
    expect(Object.keys(nav.sectionPaths).length).toBeGreaterThan(15)
  })

  it('fails loudly when a declaration is gone', () => {
    expect(() => declaration('sectionPathsThatDoNotExist')).toThrow(/no longer declares/)
  })
})

describe('activeSection routing', () => {
  it.each(Object.entries(SECTION_FOR_PATH))('maps %s to the %s section', (routePath, section) => {
    expect(evaluateNav({ path: routePath }).activeSection).toBe(section)
  })

  it('keeps the intelligence prefixes ordered so the -agent branch wins', () => {
    // The bug this guards: moving `startsWith('/dashboard/admin/intelligence')`
    // above the `-agent` branch swallows it, and the sub-route stops
    // highlighting anything distinguishable.
    const chain = declaration('activeSection')
    expect(chain.indexOf('/dashboard/admin/intelligence-agent'))
      .toBeLessThan(chain.indexOf("startsWith('/dashboard/admin/intelligence')"))
  })

  it('highlights exactly one menu entry on every admin route', () => {
    for (const [routePath, section] of Object.entries(SECTION_FOR_PATH)) {
      const nav = evaluateNav({ path: routePath, role: 'admin', riskFlag: true })
      const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems, ...nav.adminMenuItems]
      const selected = all.filter(item => item.id === section)
      expect(selected, `${routePath} → ${section}`).toHaveLength(1)
    }
  })
})

describe('menu / sectionPaths agreement', () => {
  it('gives every rendered menu item a real sectionPaths entry', () => {
    // mapItems falls back to /dashboard/overview for an unknown id, so a typo'd
    // id produces a link that silently goes to the wrong page.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems, ...nav.adminMenuItems]
    const unmapped = all.filter(item => !nav.sectionPaths[item.id])
    expect(unmapped.map(item => item.id)).toEqual([])
  })

  it('round-trips every menu href back to the same section', () => {
    // sectionPaths says where the entry goes; activeSection says what is lit up
    // when you get there. If they disagree, clicking a menu entry highlights a
    // different one.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems, ...nav.adminMenuItems]
    for (const item of all)
      expect(evaluateNav({ path: item.to }).activeSection, `${item.id} → ${item.to}`).toBe(item.id)
  })

  it('labels every admin entry from the dashboard.sections.menu namespace', () => {
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    for (const item of nav.adminMenuItems)
      expect(item.label, item.id).toMatch(/^dashboard\.sections\.menu\./)
  })
})

describe('risk control feature flag', () => {
  // The deployed value arrives as whatever Nitro coerced the env var to, so a
  // strict `=== true` read hid the entry on every real deployment while looking
  // correct locally.
  const SHOWN = [true, 1, '1', 'true', 'on', 'yes']
  const HIDDEN = [false, 0, '0', 'false', 'off', 'no', undefined, null, '', 'maybe']

  it.each(SHOWN)('shows the risk entry for %o', (flag) => {
    const nav = evaluateNav({ role: 'admin', riskFlag: flag })
    expect(nav.riskControlEnabled).toBe(true)
    expect(nav.adminMenuItems.map(item => item.id)).toContain('risk')
  })

  it.each(HIDDEN)('hides the risk entry for %o', (flag) => {
    const nav = evaluateNav({ role: 'admin', riskFlag: flag })
    expect(nav.riskControlEnabled).toBe(false)
    expect(nav.adminMenuItems.map(item => item.id)).not.toContain('risk')
  })

  it('keeps the rest of the admin menu identical either way', () => {
    const off = evaluateNav({ role: 'admin', riskFlag: false }).adminMenuItems.map(item => item.id)
    const on = evaluateNav({ role: 'admin', riskFlag: 1 }).adminMenuItems.map(item => item.id)
    expect(on.filter(id => id !== 'risk')).toEqual(off)
  })

  it('points the risk entry at the risk page', () => {
    const nav = evaluateNav({ role: 'admin', riskFlag: '1' })
    expect(nav.adminMenuItems.find(item => item.id === 'risk')?.to).toBe('/dashboard/admin/risk')
  })
})

describe('admin menu visibility', () => {
  it.each(['user', 'USER', 'moderator', '', 'administrator'])('renders no admin menu for role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).adminMenuItems).toEqual([])
  })

  it.each(['admin', 'ADMIN', 'Admin'])('renders the admin menu for role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).adminMenuItems.length).toBeGreaterThan(5)
  })

  it('renders no admin menu when signed out', () => {
    expect(evaluateNav({ role: null }).adminMenuItems).toEqual([])
  })

  it('renders no admin menu before hydration, whatever the role', () => {
    // isAdmin is gated on `mounted` so the server-rendered markup never contains
    // admin links. The cost is that the section appears one tick after paint;
    // the section is `v-show`n rather than `v-if`d so nothing below it shifts.
    expect(evaluateNav({ role: 'admin', mounted: false, riskFlag: true }).adminMenuItems).toEqual([])
    expect(NAV_SOURCE).toContain('v-show="adminMenuItems.length > 0"')
  })
})

describe('document title', () => {
  /**
   * Every dashboard route reported `document.title` as `Tuff Docs` — app.vue's
   * global `appName` default, which is the documentation site's name, on the
   * admin console. Measured after the fix on the running dev server:
   * /dashboard/admin/users → "Account Management · Tuff Nexus",
   * /dashboard/admin/analytics → "Analytics · Tuff Nexus",
   * /dashboard/overview → "Overview · Tuff Nexus".
   */
  it('derives the title from the active menu label', () => {
    // Reading `activeLabel` rather than a second lookup table is what keeps the
    // tab title and the highlighted entry from drifting.
    expect(NAV_SOURCE).toMatch(/useHead\(\(\) => \(\{\s*title: `\$\{activeLabel\.value\} · Tuff Nexus`/)
  })

  it('produces a title app.vue will not append the docs name to', () => {
    // app.vue only leaves a title alone when it already contains "Tuff";
    // anything else gets ` · Tuff Nexus` appended a second time.
    const appSource = readFileSync(path.join(HERE, '../../app.vue'), 'utf8')
    expect(appSource).toContain("title.includes('Tuff')")
    expect(`${evaluateNav({ path: '/dashboard/admin/audits' }).activeLabel} · Tuff Nexus`).toContain('Tuff')
  })
})

describe('mobile disclosure', () => {
  /**
   * Below `lg` this nav used to stack above the page — ~270px of links before
   * the heading on every dashboard route. It is a `<details>` that is forced
   * open from 1024px up and collapsed below it, which is load-bearing in three
   * separate places; changing any one of them alone brings the regression back.
   *
   * Measured on the running dev server at 375×812 with an admin session
   * (/dashboard/admin/users): nav height 40px, heading at y=165, disclosure
   * closed, summary visible. At 1440px: nav height 551px, summary hidden.
   */
  it('drives the disclosure from a 1024px media query rather than a click', () => {
    expect(NAV_SOURCE).toContain(':open="isDesktop"')
    expect(NAV_SOURCE).toContain("window.matchMedia('(min-width: 1024px)')")
    expect(NAV_SOURCE).toContain('addEventListener(\'change\', syncDesktop)')
  })

  it('starts collapsed, so the server-rendered markup is the small one', () => {
    expect(declaration('isDesktop')).toContain('ref(false)')
  })

  it('hides the summary above the same breakpoint the query uses', () => {
    // A mismatch here shows the disclosure toggle on desktop, where the nav is
    // already open and the toggle cannot close it.
    const style = NAV_SOURCE.slice(NAV_SOURCE.indexOf('<style scoped>'))
    const desktopBlock = style.slice(style.indexOf('@media (min-width: 1024px)'))
    expect(desktopBlock).toMatch(/\.dashboard-nav-summary\s*\{[^}]*display:\s*none/)
  })

  it('releases the media query listener on unmount', () => {
    expect(NAV_SOURCE).toContain("desktopQuery?.removeEventListener('change', syncDesktop)")
  })

  it('labels the collapsed summary with the active section', () => {
    // Collapsed, the summary is the only thing naming where you are.
    expect(evaluateNav({ path: '/dashboard/admin/analytics', role: 'admin' }).activeLabel)
      .toBe('dashboard.sections.menu.analytics')
    expect(NAV_SOURCE).toContain('{{ activeLabel }}')
  })
})

/**
 * Reachability inventory. Every page under the admin directory has to be
 * reachable from the UI somehow; "somehow" is the part that kept being skipped,
 * which is how provider-registry and intelligence-chat ended up as URL-only
 * pages. Each route declares which mechanism carries it, and an undeclared page
 * fails rather than being quietly unreachable.
 */
const ADMIN_PAGES_DIR = path.join(HERE, '../../pages/dashboard/admin')

type Reachability =
  | { via: 'menu', section: string }
  | { via: 'tab', component: string }
  | { via: 'redirect', to: string }
  | { via: 'panel-tab', host: string, tab: string }

const REACHABILITY: Record<string, Reachability> = {
  'analytics.vue': { via: 'menu', section: 'analytics' },
  'audits.vue': { via: 'menu', section: 'audits' },
  'governance.vue': { via: 'menu', section: 'governance' },
  'intelligence.vue': { via: 'menu', section: 'intelligence' },
  'reviews.vue': { via: 'menu', section: 'reviews' },
  'risk.vue': { via: 'menu', section: 'risk' },
  'users.vue': { via: 'menu', section: 'users' },
  'subscriptions.vue': { via: 'tab', component: 'admin/AccountTabs.vue' },
  'doc-comments.vue': { via: 'tab', component: 'admin/CommentTabs.vue' },
  'codes.vue': { via: 'redirect', to: '/dashboard/admin/subscriptions' },
  'credits.vue': { via: 'redirect', to: '/dashboard/admin/users' },
  'intelligence-agent.vue': { via: 'redirect', to: '/dashboard/admin/intelligence' },
  'intelligence-lab.vue': { via: 'redirect', to: '/dashboard/admin/intelligence' },
  // Renders the same LazyDashboardProviderRegistryAdminPanel that the
  // Intelligence console embeds as its Service Channels tab (351c289e2), so the
  // capability is reachable; this route is the deep link to it.
  'provider-registry.vue': { via: 'panel-tab', host: 'intelligence', tab: 'serviceChannels' },
  // The only UI for POST /api/admin/intelligence/chat. Not yet folded into the
  // Intelligence console — tracked in the admin IA report; until it is, this
  // entry is the record that it is URL-only.
  'intelligence-chat.vue': { via: 'panel-tab', host: 'intelligence', tab: 'chat' },
}

describe('admin route reachability', () => {
  const pages = readdirSync(ADMIN_PAGES_DIR).filter(file => file.endsWith('.vue'))

  it('finds the admin pages it means to check', () => {
    // Positive control: a wrong directory yields an empty list, and every
    // assertion below would then pass on nothing.
    expect(pages.length).toBeGreaterThan(10)
    expect(pages).toContain('users.vue')
  })

  it('declares how every admin page is reached', () => {
    const undeclared = pages.filter(file => !REACHABILITY[file])
    expect(undeclared, 'new admin page with no route into it from the UI').toEqual([])
  })

  it('has no stale reachability entries', () => {
    expect(Object.keys(REACHABILITY).filter(file => !pages.includes(file))).toEqual([])
  })

  it('backs every menu-reachable page with a real menu entry', () => {
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    const ids = new Set(nav.adminMenuItems.map(item => item.id))
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'menu')
        continue
      expect(ids, file).toContain(entry.section)
      expect(nav.sectionPaths[entry.section]).toBe(`/dashboard/admin/${file.replace('.vue', '')}`)
    }
  })

  it('backs every tab-reachable page with a tab component that links to it', () => {
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'tab')
        continue
      const source = readFileSync(path.join(HERE, entry.component), 'utf8')
      expect(source, entry.component).toContain(`/dashboard/admin/${file.replace('.vue', '')}`)
      // The tab bar is useless unless the page actually renders it. Nuxt only
      // auto-imports components from the top level of app/components, so these
      // nested ones need an explicit import or they resolve to nothing.
      const page = readFileSync(path.join(ADMIN_PAGES_DIR, file), 'utf8')
      const tag = path.basename(entry.component, '.vue')
      expect(page, file).toMatch(new RegExp(`<${tag}\\b`))
      expect(page, `${file} must import ${tag} explicitly`).toMatch(
        new RegExp(`import ${tag} from`),
      )
    }
  })

  it('actually forwards from every page declared as a redirect', () => {
    // Two mechanisms are in use and both are legitimate, so this asserts the
    // destination rather than the call. `definePageMeta({ redirect })` is the
    // better one — it emits a real 302 and never instantiates the component,
    // where `await navigateTo()` in setup still serves a 200 HTML shell and only
    // forwards once hydration runs. Pinning the weaker form here would have
    // blocked that upgrade.
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'redirect')
        continue
      const source = readFileSync(path.join(ADMIN_PAGES_DIR, file), 'utf8')
      const forwards = source.includes(`navigateTo('${entry.to}'`)
        || new RegExp(`redirect:\\s*'${entry.to}'`).test(source)
      expect(forwards, `${file} must forward to ${entry.to}`).toBe(true)
    }
  })

  it('finds both forwarding mechanisms in the tree it is checking', () => {
    // Positive control: if every stub migrated to one form, the other branch
    // above would stop being exercised and could rot unnoticed.
    const stubs = Object.entries(REACHABILITY)
      .filter(([, entry]) => entry.via === 'redirect')
      .map(([file]) => readFileSync(path.join(ADMIN_PAGES_DIR, file), 'utf8'))
    expect(stubs.some(source => source.includes('navigateTo('))).toBe(true)
    expect(stubs.some(source => /redirect:\s*'/.test(source))).toBe(true)
  })
})
