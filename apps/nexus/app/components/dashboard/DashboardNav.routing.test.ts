import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { isAdminAccountRole } from '~/utils/account-role'

/**
 * DashboardNav holds three parallel tables that have to agree — `sectionPaths`
 * (id → href), the menu items (id → label) and `activeSection` (path → id) —
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
 *
 * Scope: the account workspace only. The administrator console moved into its
 * own shell (`app/components/admin/AdminNav.vue`), and the same harness runs
 * over it in `AdminNav.routing.test.ts` — including the reachability inventory
 * for `app/pages/admin/`, which came with it.
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
  mounted?: boolean
  canManageOauthApps?: boolean
}

interface MenuItem { id: string, label: string, icon: string, to: string }

interface NavBindings {
  sectionPaths: Record<string, string>
  workspaceMenuItems: MenuItem[]
  accountMenuItems: MenuItem[]
  activeSection: string
  activeLabel: string
}

const LIFTED = [
  'isAdmin',
  'sectionPaths',
  'mapItems',
  'workspaceMenuItems',
  'accountMenuItems',
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
    `const { computed, t, route, mounted, user, isAccountAdmin, canManageOauthApps } = deps
${body}
return {
  sectionPaths,
  workspaceMenuItems: workspaceMenuItems.value,
  accountMenuItems: accountMenuItems.value,
  activeSection: activeSection.value,
  activeLabel: activeLabel.value,
}`,
  ) as (deps: Record<string, unknown>) => NavBindings

  const user = ref(state.role === undefined ? { role: 'admin' } : state.role === null ? null : { role: state.role })

  return factory({
    computed,
    // Returning the key keeps assertions locale-independent; the locale files
    // are covered by dashboard-i18n-coverage / i18n-cjk-fallback-coverage.
    t: (key: string) => key,
    route: { path: state.path ?? '/dashboard/overview' },
    mounted: ref(state.mounted ?? true),
    user,
    // The component resolves the role through useAccountRole(); injecting the
    // flag keeps this test on the routing and menu tables it exists for, while
    // still driving it from the same `role` fixture. The predicate has its own
    // coverage in utils/account-role.test.ts.
    isAccountAdmin: computed(() => isAdminAccountRole(user.value?.role)),
    canManageOauthApps: computed(() => state.canManageOauthApps ?? true),
  })
}

/**
 * The mapping every workspace route resolves to. `activeSection` ends in a
 * generic segment lookup, so a route whose segment is missing from
 * `sectionPaths` silently lands on `overview` instead of lighting nothing —
 * this table is what makes that loud. The console's own map lives in
 * `AdminNav.routing.test.ts`.
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
  '/dashboard/unknown-section': 'overview',
}

describe('dashboardNav harness', () => {
  it('executes the declarations it means to test', () => {
    // Positive control. A harness that silently produced empty menus would let
    // every "is not shown" assertion below pass for the wrong reason.
    const nav = evaluateNav({ role: 'admin' })
    expect(LIFTED.every(name => declaration(name).length > 0)).toBe(true)
    expect(nav.workspaceMenuItems.length).toBeGreaterThan(1)
    expect(nav.accountMenuItems.length).toBeGreaterThan(3)
    expect(Object.keys(nav.sectionPaths).length).toBeGreaterThan(8)
  })

  it('fails loudly when a declaration is gone', () => {
    expect(() => declaration('sectionPathsThatDoNotExist')).toThrow(/no longer declares/)
  })
})

describe('activeSection routing', () => {
  it.each(Object.entries(SECTION_FOR_PATH))('maps %s to the %s section', (routePath, section) => {
    expect(evaluateNav({ path: routePath }).activeSection).toBe(section)
  })

  it('highlights exactly one menu entry on every workspace route', () => {
    for (const [routePath, section] of Object.entries(SECTION_FOR_PATH)) {
      const nav = evaluateNav({ path: routePath, role: 'admin' })
      const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems]
      const selected = all.filter(item => item.id === section)
      expect(selected, `${routePath} → ${section}`).toHaveLength(1)
    }
  })

  it('no longer answers for the administrator console', () => {
    // The console is a separate shell with its own rail. Leaving its branches
    // here would light a workspace entry for a route this nav cannot even be
    // rendered on, and would quietly resurrect the split-brain the move fixed.
    expect(NAV_SOURCE).not.toContain('/admin/')
    expect(evaluateNav({ path: '/admin/users', role: 'admin' }).activeSection).toBe('overview')
  })
})

describe('menu / sectionPaths agreement', () => {
  it('gives every rendered menu item a real sectionPaths entry', () => {
    // mapItems falls back to /dashboard/overview for an unknown id, so a typo'd
    // id produces a link that silently goes to the wrong page.
    const nav = evaluateNav({ role: 'admin' })
    const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems]
    const unmapped = all.filter(item => !nav.sectionPaths[item.id])
    expect(unmapped.map(item => item.id)).toEqual([])
  })

  it('round-trips every menu href back to the same section', () => {
    // sectionPaths says where the entry goes; activeSection says what is lit up
    // when you get there. If they disagree, clicking a menu entry highlights a
    // different one.
    const nav = evaluateNav({ role: 'admin' })
    const all = [...nav.workspaceMenuItems, ...nav.accountMenuItems]
    for (const item of all)
      expect(evaluateNav({ path: item.to }).activeSection, `${item.id} → ${item.to}`).toBe(item.id)
  })

  it('leaves no sectionPaths entry that neither renders nor aliases a route', () => {
    // The admin ids were removed from both tables together; an id left behind in
    // one of them is dead weight the next reader has to re-derive. `plugins` is
    // the one legitimate exception and stays: it is not rendered, it is the
    // alias that lets the retired /dashboard/plugins URL resolve to `assets`.
    const nav = evaluateNav({ role: 'admin' })
    const rendered = [...nav.workspaceMenuItems, ...nav.accountMenuItems].map(item => item.id)
    const orphans = Object.keys(nav.sectionPaths).filter((id) => {
      if (rendered.includes(id))
        return false
      // An alias earns its entry by resolving to a section that does render.
      const section = evaluateNav({ path: `/dashboard/${id}`, role: 'admin' }).activeSection
      return !rendered.includes(section) || section === 'overview'
    })
    expect(orphans).toEqual([])
  })

  it('labels every entry from the dashboard.sections.menu namespace', () => {
    const nav = evaluateNav({ role: 'admin' })
    for (const item of [...nav.workspaceMenuItems, ...nav.accountMenuItems])
      expect(item.label, item.id).toMatch(/^dashboard\.sections\.menu\./)
  })
})

describe('oauth entry visibility', () => {
  it.each(['user', 'USER', 'moderator', '', 'administrator'])('renders no OAuth entry for role %o', (role) => {
    const nav = evaluateNav({ role, canManageOauthApps: false })
    expect(nav.accountMenuItems.map(item => item.id)).not.toContain('oauth')
  })

  it('renders the OAuth entry for anyone who can manage apps', () => {
    const nav = evaluateNav({ role: 'admin', canManageOauthApps: true })
    expect(nav.accountMenuItems.map(item => item.id)).toContain('oauth')
  })

  it('keeps the rest of the account menu identical either way', () => {
    const off = evaluateNav({ role: 'user', canManageOauthApps: false }).accountMenuItems.map(item => item.id)
    const on = evaluateNav({ role: 'admin', canManageOauthApps: true }).accountMenuItems.map(item => item.id)
    expect(on.filter(id => id !== 'oauth')).toEqual(off)
  })
})

describe('document title', () => {
  /**
   * Every dashboard route reported `document.title` as `Tuff Docs` — app.vue's
   * global `appName` default, which is the documentation site's name. Measured
   * after the fix on the running dev server: /dashboard/overview → "Overview ·
   * Tuff Nexus", /dashboard/devices → "Devices · Tuff Nexus".
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
    expect(`${evaluateNav({ path: '/dashboard/devices' }).activeLabel} · Tuff Nexus`).toContain('Tuff')
  })
})

describe('mobile disclosure', () => {
  /**
   * Below `lg` this nav used to stack above the page — ~270px of links before
   * the heading on every dashboard route. It is a `<details>` that is forced
   * open from 1024px up and collapsed below it, which is load-bearing in three
   * separate places; changing any one of them alone brings the regression back.
   *
   * Measured on the running dev server at 375×812 with a signed-in session
   * (/dashboard/devices): nav height 40px, heading at y=165, disclosure closed,
   * summary visible. At 1440px: nav height 551px, summary hidden.
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
    expect(evaluateNav({ path: '/dashboard/storage', role: 'admin' }).activeLabel)
      .toBe('dashboard.sections.menu.storage')
    expect(NAV_SOURCE).toContain('{{ activeLabel }}')
  })
})
