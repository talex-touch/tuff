import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { isAdminAccountRole } from '~/utils/account-role'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

/**
 * `AdminNav` holds three parallel tables that have to agree — `sectionPaths`
 * (id → href), `menuItems` (id → label) and `activeSection` (path → id) — plus
 * a fourth thing that lives elsewhere entirely: the pages in
 * `app/pages/admin/`. Nothing connects them, so they drift; the same three
 * tables drifted in `DashboardNav` before this harness was written for it
 * (risk.vue rendered "Analytics Dashboard", provider-registry became URL-only),
 * and the console carried them out of that file when it moved into its own
 * shell.
 *
 * The tables are executed rather than re-stated: a hand-copied version would go
 * on passing after the component changed under it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NAV_SOURCE = readFileSync(path.join(HERE, 'AdminNav.vue'), 'utf8')

/**
 * The type annotations inside the lifted blocks. Stripped from the whole file
 * before slicing, because the braces inside `Array<{ … }>` otherwise balance
 * the declaration early and truncate it to its signature.
 *
 * Order matters: the `Array<{ … }>` and `Record<…>` forms are removed first,
 * so the trailing rules only ever see the simple `: Foo` / `: Foo[]` shapes
 * and cannot eat the `<`-delimited ones halfway.
 */
const RUNNABLE_SOURCE = NAV_SOURCE
  .replace(/: Record<[^>]*>/g, '')
  .replace(/: Array<\{[^}]*\}>/g, '')
  // `computed<NavGroup[]>(…)` / `computed<NavItem[]>(…)` — the generic sits on
  // the call, not after a colon, so the rules below never reach it.
  .replace(/computed<[^>]*>/g, 'computed')
  // Return annotations: `): NavItem[] {` and `): NavItem {`.
  .replace(/\): [A-Z]\w*(?:\[\])? \{/g, ') {')
  // Local annotations: `const groups: NavGroup[] = [`.
  .replace(/(const \w+): [A-Z]\w*(?:\[\])? =/g, '$1 =')

/** Reads `const <name> = …` / `function <name>(…)` up to its balanced end. */
function declaration(name: string): string {
  const header = new RegExp(`^(?:const|function) ${name}\\b`, 'm').exec(RUNNABLE_SOURCE)
  if (!header)
    throw new Error(`AdminNav no longer declares "${name}" — update this test with it.`)

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
  query?: Record<string, string>
  riskFlag?: unknown
  mounted?: boolean
}

interface MenuItem { id: string, label: string, icon: string, to: string }
interface MenuGroup { id: string, label: string, items: MenuItem[] }

interface NavBindings {
  sectionPaths: Record<string, string>
  menuGroups: MenuGroup[]
  menuItems: MenuItem[]
  activeSection: string
  activeLabel: string
  riskControlEnabled: boolean
}

const LIFTED = [
  'isAdmin',
  'riskControlEnabled',
  'sectionPaths',
  'ANALYTICS_SECTIONS',
  'mapItems',
  'menuGroups',
  'menuItems',
  'activeSection',
  'activeLabel',
] as const

function evaluateNav(state: NavState = {}): NavBindings {
  const body = LIFTED.map(name => declaration(name)).join('\n\n')
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'deps',
    `const { computed, t, route, mounted, isAccountAdmin, runtimeConfig, isFeatureFlagEnabled } = deps
${body}
return {
  sectionPaths,
  menuGroups: menuGroups.value,
  menuItems: menuItems.value,
  activeSection: activeSection.value,
  activeLabel: activeLabel.value,
  riskControlEnabled: riskControlEnabled.value,
}`,
  ) as (deps: Record<string, unknown>) => NavBindings

  const role = state.role === undefined ? 'admin' : state.role

  return factory({
    computed,
    // Returning the key keeps assertions locale-independent; the locale files
    // are covered by dashboard-admin-i18n-coverage / i18n-key-existence.
    t: (key: string) => key,
    // `query` matters as much as `path` now: the analytics panels are one
    // route addressed nine ways, so the section they light comes from here.
    route: { path: state.path ?? '/admin/updates', query: state.query ?? {} },
    mounted: ref(state.mounted ?? true),
    // The component resolves the role through useAccountRole(); injecting the
    // flag keeps this test on the routing and menu tables it exists for. The
    // predicate has its own coverage in utils/account-role.test.ts.
    isAccountAdmin: computed(() => isAdminAccountRole(role)),
    runtimeConfig: { public: { riskControl: { enabled: state.riskFlag } } },
    isFeatureFlagEnabled,
  })
}

/**
 * The mapping every console route resolves to. `activeSection` is an ordered
 * if-chain, so `/admin/intelligence-overview` only resolves to itself because
 * its branch sits above the `…/intelligence` prefix branch, and `…/codes`
 * reaches `subscriptions` only because an explicit branch carries it.
 * Reordering them is silent; this table is what makes it loud.
 */
const SECTION_FOR_PATH: Record<string, string> = {
  '/admin/updates': 'updates',
  '/admin/images': 'images',
  '/admin/users': 'users',
  '/admin/users/123': 'users',
  '/admin/credits': 'users',
  '/admin/subscriptions': 'subscriptions',
  '/admin/codes': 'subscriptions',
  '/admin/audits': 'audits',
  '/admin/reviews': 'reviews',
  '/admin/doc-comments': 'doc-comments',
  '/admin/analytics': 'analytics:overview',
  '/admin/governance': 'governance',
  '/admin/risk': 'risk',
  '/admin/intelligence': 'intelligence',
  '/admin/intelligence-overview': 'intelligence-overview',
  '/admin/intelligence-audits': 'intelligence-audits',
  '/admin/intelligence-agent': 'intelligence',
  '/admin/intelligence-lab': 'intelligence',
  '/admin/intelligence-chat': 'intelligence-chat',
  '/admin/provider-registry': 'provider-registry',
  '/admin/unknown-section': 'updates',
}

/**
 * The analytics panels are the one place where the query, not the path,
 * decides the section. A bare `/admin/analytics` and an unrecognised
 * `?section=` both fall back to the overview, matching the page's own default.
 */
const SECTION_FOR_ANALYTICS_QUERY: Record<string, string> = {
  overview: 'analytics:overview',
  performance: 'analytics:performance',
  search: 'analytics:search',
  usage: 'analytics:usage',
  intelligence: 'analytics:intelligence',
  docs: 'analytics:docs',
  geo: 'analytics:geo',
  exchange: 'analytics:exchange',
  messages: 'analytics:messages',
  'not-a-panel': 'analytics:overview',
}

/** Splits a menu href into the shape `evaluateNav` wants. */
function routeOf(href: string): { path: string, query: Record<string, string> } {
  const [path, search = ''] = href.split('?')
  return { path: path!, query: Object.fromEntries(new URLSearchParams(search)) }
}

describe('adminNav harness', () => {
  it('executes the declarations it means to test', () => {
    // Positive control. A harness that silently produced an empty menu would
    // let every "is not shown" assertion below pass for the wrong reason.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    expect(LIFTED.every(name => declaration(name).length > 0)).toBe(true)
    expect(nav.menuItems.length).toBeGreaterThan(5)
    expect(Object.keys(nav.sectionPaths).length).toBeGreaterThan(10)
  })

  it('fails loudly when a declaration is gone', () => {
    expect(() => declaration('sectionPathsThatDoNotExist')).toThrow(/no longer declares/)
  })
})

describe('activeSection routing', () => {
  it.each(Object.entries(SECTION_FOR_PATH))('maps %s to the %s section', (routePath, section) => {
    expect(evaluateNav({ path: routePath }).activeSection).toBe(section)
  })

  it.each(Object.entries(SECTION_FOR_ANALYTICS_QUERY))('maps ?section=%s to %s', (query, expected) => {
    expect(evaluateNav({ path: '/admin/analytics', query: { section: query } }).activeSection).toBe(expected)
  })

  it('keeps the intelligence prefixes ordered so the -agent branch wins', () => {
    // The bug this guards: moving `startsWith('/admin/intelligence')` above the
    // `-agent` branch swallows it, and the sub-route stops highlighting
    // anything distinguishable.
    const chain = declaration('activeSection')
    expect(chain.indexOf('/admin/intelligence-agent'))
      .toBeLessThan(chain.indexOf("startsWith('/admin/intelligence')"))
  })

  it('highlights exactly one menu entry on every console route', () => {
    for (const [routePath, section] of Object.entries(SECTION_FOR_PATH)) {
      const nav = evaluateNav({ path: routePath, role: 'admin', riskFlag: true })
      const selected = nav.menuItems.filter(item => item.id === section)
      expect(selected, `${routePath} → ${section}`).toHaveLength(1)
    }
  })
})

describe('menu / sectionPaths agreement', () => {
  it('gives every rendered menu item a real sectionPaths entry', () => {
    // mapItems falls back to /admin/updates for an unknown id, so a typo'd id
    // produces a link that silently goes to the wrong page.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    // The analytics entries carry their own hrefs rather than going through
    // sectionPaths, so they are exempt by construction - `keeps every href
    // inside the console namespace` below still covers where they point.
    const unmapped = nav.menuItems.filter(item => !item.id.startsWith('analytics:') && !nav.sectionPaths[item.id])
    expect(unmapped.map(item => item.id)).toEqual([])
  })

  it('round-trips every menu href back to the same section', () => {
    // sectionPaths says where the entry goes; activeSection says what is lit up
    // when you get there. If they disagree, clicking a menu entry highlights a
    // different one.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    for (const item of nav.menuItems)
      expect(evaluateNav(routeOf(item.to)).activeSection, `${item.id} → ${item.to}`).toBe(item.id)
  })

  it('keeps every href inside the console namespace', () => {
    // The console is a separate shell: a `/dashboard/*` href here would leave it
    // and silently drop the reader into the account workspace.
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    for (const [id, href] of Object.entries(nav.sectionPaths))
      expect(href, id).toMatch(/^\/admin\//)
  })

  it('labels every entry from the dashboard.sections.menu namespace', () => {
    const nav = evaluateNav({ role: 'admin', riskFlag: true })
    for (const item of nav.menuItems) {
      // The analytics panels name themselves from their own page's namespace,
      // sharing the key with the heading so the two cannot drift.
      const namespace = item.id.startsWith('analytics:')
        ? /^dashboard\.sections\.analytics\.sections\./
        : /^dashboard\.sections\.menu\./
      expect(item.label, item.id).toMatch(namespace)
    }
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
    expect(nav.menuItems.map(item => item.id)).toContain('risk')
  })

  it.each(HIDDEN)('hides the risk entry for %o', (flag) => {
    const nav = evaluateNav({ role: 'admin', riskFlag: flag })
    expect(nav.riskControlEnabled).toBe(false)
    expect(nav.menuItems.map(item => item.id)).not.toContain('risk')
  })

  it('keeps the rest of the menu identical either way', () => {
    const off = evaluateNav({ role: 'admin', riskFlag: false }).menuItems.map(item => item.id)
    const on = evaluateNav({ role: 'admin', riskFlag: 1 }).menuItems.map(item => item.id)
    expect(on.filter(id => id !== 'risk')).toEqual(off)
  })

  it('points the risk entry at the risk page', () => {
    const nav = evaluateNav({ role: 'admin', riskFlag: '1' })
    expect(nav.menuItems.find(item => item.id === 'risk')?.to).toBe('/admin/risk')
  })
})

describe('console menu visibility', () => {
  it.each(['user', 'USER', 'moderator', '', 'administrator'])('renders no menu for role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).menuItems).toEqual([])
  })

  it.each(['admin', 'ADMIN', 'Admin'])('renders the menu for role %o', (role) => {
    expect(evaluateNav({ role, riskFlag: true }).menuItems.length).toBeGreaterThan(5)
  })

  it('renders no menu when signed out', () => {
    expect(evaluateNav({ role: null }).menuItems).toEqual([])
  })

  it('renders no menu before hydration, whatever the role', () => {
    // isAdmin is gated on `mounted` so the server-rendered markup never contains
    // console links: the server has no role payload, and rendering them on the
    // first client tick would be a hydration mismatch.
    expect(evaluateNav({ role: 'admin', mounted: false, riskFlag: true }).menuItems).toEqual([])
  })
})

describe('document title', () => {
  /**
   * The console is no longer inside the dashboard shell, so the title it used
   * to inherit from `DashboardNav` had to come with it — otherwise every
   * `/admin/*` route falls back to app.vue's global `appName`, which is the
   * documentation site's name.
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
    expect(`${evaluateNav({ path: '/admin/audits' }).activeLabel} · Tuff Nexus`).toContain('Tuff')
  })
})

describe('mobile disclosure', () => {
  /**
   * Below `lg` the console shell stacks, so this rail would sit above the page.
   * It is a `<details>` forced open from 1024px up and collapsed below it,
   * which is load-bearing in three separate places; changing any one of them
   * alone brings the regression back.
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
    // A mismatch here shows the disclosure toggle on desktop, where the rail is
    // already open and the toggle cannot close it.
    const style = NAV_SOURCE.slice(NAV_SOURCE.indexOf('<style scoped>'))
    const desktopBlock = style.slice(style.indexOf('@media (min-width: 1024px)'))
    expect(desktopBlock).toMatch(/\.admin-nav-summary\s*\{[^}]*display:\s*none/)
  })

  it('releases the media query listener on unmount', () => {
    expect(NAV_SOURCE).toContain("desktopQuery?.removeEventListener('change', syncDesktop)")
  })

  it('labels the collapsed summary with the active section', () => {
    // Collapsed, the summary is the only thing naming where you are.
    expect(evaluateNav({ path: '/admin/analytics', role: 'admin' }).activeLabel)
      .toBe('dashboard.sections.analytics.sections.overview')
    expect(NAV_SOURCE).toContain('{{ activeLabel }}')
  })
})

/**
 * Reachability inventory. Every page under `app/pages/admin/` has to be
 * reachable from the UI somehow; "somehow" is the part that kept being skipped,
 * which is how provider-registry and intelligence-chat ended up as URL-only
 * pages. Each route declares which mechanism carries it, and an undeclared page
 * fails rather than being quietly unreachable.
 *
 * There is no `tab` mechanism any more. Tab strips used to carry four screens
 * the rail never named (the Intelligence panel's overview/channels/audits, the
 * second half of the account and comment pairs), which meant two different
 * controls for the same kind of move and made those screens invisible to anyone
 * reading the rail. They are all `menu` now.
 */
const ADMIN_PAGES_DIR = path.join(HERE, '../../pages/admin')

type Reachability =
  | { via: 'menu', section: string }
  | { via: 'redirect', to: string }
  | { via: 'link', from: string }

const REACHABILITY: Record<string, Reachability> = {
  'analytics.vue': { via: 'menu', section: 'analytics:overview' },
  'audits.vue': { via: 'menu', section: 'audits' },
  'governance.vue': { via: 'menu', section: 'governance' },
  'images.vue': { via: 'menu', section: 'images' },
  'intelligence.vue': { via: 'menu', section: 'intelligence' },
  'intelligence-overview.vue': { via: 'menu', section: 'intelligence-overview' },
  'intelligence-audits.vue': { via: 'menu', section: 'intelligence-audits' },
  'provider-registry.vue': { via: 'menu', section: 'provider-registry' },
  'reviews.vue': { via: 'menu', section: 'reviews' },
  'doc-comments.vue': { via: 'menu', section: 'doc-comments' },
  'risk.vue': { via: 'menu', section: 'risk' },
  'updates.vue': { via: 'menu', section: 'updates' },
  'users.vue': { via: 'menu', section: 'users' },
  'subscriptions.vue': { via: 'menu', section: 'subscriptions' },
  'codes.vue': { via: 'redirect', to: '/admin/subscriptions' },
  'credits.vue': { via: 'redirect', to: '/admin/users' },
  'intelligence-agent.vue': { via: 'redirect', to: '/admin/intelligence' },
  'intelligence-lab.vue': { via: 'redirect', to: '/admin/intelligence' },
  // The only UI for POST /api/admin/intelligence/chat. It was URL-only for as
  // long as the console navigated by tabs — a full console page nothing linked.
  'intelligence-chat.vue': { via: 'menu', section: 'intelligence-chat' },
  // Standalone WebAuthn recovery page, outside the console shell (`layout:
  // false`) and reachable without a session. It shares this directory because
  // it shares the namespace, not the shell.
  'emergency.vue': { via: 'link', from: 'risk.vue' },
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
    const ids = new Set(nav.menuItems.map(item => item.id))
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'menu')
        continue
      expect(ids, file).toContain(entry.section)
      // The analytics entries address their page with `?section=`, so their
      // hrefs are their own rather than a sectionPaths row.
      if (entry.section.startsWith('analytics:'))
        continue
      expect(nav.sectionPaths[entry.section]).toBe(`/admin/${file.replace('.vue', '')}`)
    }
  })

  it('routes every console page through the rail rather than an in-page tab strip', () => {
    // The rail is the console's only navigation surface. A page that links a
    // sibling console route from its own body is how tab strips came back the
    // last time: the destination stops being a rail entry, and the only way to
    // find it is to already be on the page next to it.
    const railPaths = new Set(
      Object.entries(REACHABILITY)
        .filter(([, entry]) => entry.via === 'menu')
        .map(([file]) => `/admin/${file.replace('.vue', '')}`),
    )

    const offenders: string[] = []
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'menu')
        continue
      const source = readFileSync(path.join(ADMIN_PAGES_DIR, file), 'utf8')
      const self = `/admin/${file.replace('.vue', '')}`
      for (const target of railPaths) {
        if (target === self)
          continue
        // Quoted, so `/api/admin/...` prefixes and longer sibling paths
        // (`/admin/users` inside `/admin/users/123`) are not false positives.
        if (source.includes(`"${target}"`) || source.includes(`'${target}'`))
          offenders.push(`${file} -> ${target}`)
      }
    }

    expect(offenders, 'console page navigates to a sibling rail route from its own body').toEqual([])
  })

  it('backs every link-reachable page with a page that links to it', () => {
    for (const [file, entry] of Object.entries(REACHABILITY)) {
      if (entry.via !== 'link')
        continue
      const source = readFileSync(path.join(ADMIN_PAGES_DIR, entry.from), 'utf8')
      expect(source, `${entry.from} must link /admin/${file.replace('.vue', '')}`)
        .toContain(`"/admin/${file.replace('.vue', '')}"`)
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

  it('puts every console page in the console shell', () => {
    // The shell is what makes these routes full-bleed and what renders this
    // rail. A page that forgets `layout: 'admin'` renders in the default site
    // layout with no navigation at all. Redirect stubs never render, and
    // emergency.vue opts out on purpose (`layout: false`).
    const shellless = pages.filter((file) => {
      const entry = REACHABILITY[file]
      if (!entry || entry.via === 'redirect' || file === 'emergency.vue')
        return false
      const source = readFileSync(path.join(ADMIN_PAGES_DIR, file), 'utf8')
      return !source.includes("layout: 'admin'") || !source.includes('requiresAuth: true')
    })
    expect(shellless, 'console pages missing layout/auth meta').toEqual([])
  })
})
