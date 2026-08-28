import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const users = readFileSync(new URL('./users.vue', import.meta.url), 'utf8')
const subscriptions = readFileSync(new URL('./subscriptions.vue', import.meta.url), 'utf8')
const codes = readFileSync(new URL('./codes.vue', import.meta.url), 'utf8')
const credits = readFileSync(new URL('./credits.vue', import.meta.url), 'utf8')

const pages = [
  ['users.vue', users],
  ['subscriptions.vue', subscriptions],
] as const

/**
 * ofetch builds `err.message` as `[GET] "/api/admin/users?page=1&limit=20":
 * <no response> Failed to fetch`. Every `|| err.message ||` fallback in these
 * pages put that string straight into the operator-facing banner, leaking the
 * internal route and telling them nothing they could act on.
 */
const OFETCH_MESSAGE_FALLBACK = /\|\|\s*(?:err|e)\s*\??\.\s*message/

describe('account cluster failure reporting', () => {
  for (const [name, source] of pages) {
    it(`${name} never surfaces the raw ofetch message`, () => {
      expect(source).not.toMatch(OFETCH_MESSAGE_FALLBACK)
    })

    it(`${name} reads the failure text from the endpoint response only`, () => {
      expect(source).toContain('function resolveErrorMessage(err: unknown, fallback: string)')
      expect(source).toContain('(err as { data?: { message?: unknown } })?.data?.message')
    })
  }
})

/**
 * The list, subscription and code panels all rendered their "nothing here" copy
 * whenever the array was empty — including when the request had failed — so a
 * dead endpoint read as an empty account list.
 */
describe('account cluster failure is never drawn as emptiness', () => {
  interface ListCase {
    page: string
    source: string
    errorFlag: string
    emptyTitleKey: string
  }

  const lists: ListCase[] = [
    { page: 'users.vue', source: users, errorFlag: 'error', emptyTitleKey: 'dashboard.sections.users.empty' },
    { page: 'subscriptions.vue', source: subscriptions, errorFlag: 'subscriptionError', emptyTitleKey: 'dashboard.sections.subscriptions.empty' },
    { page: 'subscriptions.vue', source: subscriptions, errorFlag: 'codesError', emptyTitleKey: 'dashboard.sections.codes.empty' },
  ]

  for (const { page, source, errorFlag, emptyTitleKey } of lists) {
    it(`${page} branches on ${errorFlag} before it reaches the ${emptyTitleKey} copy`, () => {
      const errorBranch = source.indexOf(`v-else-if="${errorFlag}"`)
      const emptyCopy = source.indexOf(emptyTitleKey)

      expect(errorBranch, `${errorFlag} has no error branch`).toBeGreaterThan(-1)
      expect(emptyCopy, `${emptyTitleKey} is not rendered`).toBeGreaterThan(-1)
      expect(errorBranch).toBeLessThan(emptyCopy)
    })

    it(`${page} offers a retry when ${errorFlag} is set`, () => {
      const branch = source.slice(source.indexOf(`v-else-if="${errorFlag}"`))
      expect(branch.slice(0, 600)).toContain('common.retry')
    })
  }

  it('users.vue keeps the stale-list banner off the screen when there is nothing to be stale', () => {
    expect(users).toContain('v-if="error && users.length"')
  })

  it('subscriptions.vue keeps the stale-list banners off an empty screen', () => {
    expect(subscriptions).toContain('v-if="subscriptionError && subscriptionList.length"')
    expect(subscriptions).toContain('v-if="codesError && codes.length"')
  })

  it('users.vue does not format a missing credit balance as a zero balance', () => {
    const creditsError = users.indexOf('v-else-if="userCreditsError"')
    const balanceTiles = users.indexOf('dashboard.sections.users.credits.remaining')

    expect(creditsError).toBeGreaterThan(-1)
    expect(creditsError).toBeLessThan(balanceTiles)
  })

  /**
   * "Generate some above" is an instruction, and it was the only thing on screen
   * when the request failed. The copy itself is fine — it just has to sit behind
   * the branch that means the list is genuinely empty.
   */
  it('subscriptions.vue only tells the operator to generate codes once the load succeeded', () => {
    const codesErrorBranch = subscriptions.indexOf('v-else-if="codesError"')
    const generateInstruction = subscriptions.indexOf('No activation codes yet. Generate some above.')

    expect(codesErrorBranch).toBeGreaterThan(-1)
    expect(generateInstruction).toBeGreaterThan(-1)
    expect(codesErrorBranch).toBeLessThan(generateInstruction)
  })
})

/**
 * Two stacked grey blocks are not the table that lands in their place, so the
 * page jumped on every first load. TxRowSkeleton draws the title/description/
 * trailing-control shape these lists actually use.
 */
describe('account cluster loading placeholders track the real layout', () => {
  for (const [name, source] of pages) {
    it(`${name} uses row-shaped skeletons`, () => {
      expect(source).toContain('TxRowSkeleton')
      expect(source).not.toMatch(/<TxSkeleton :loading="true" :lines="2" \/>\s*<\/div>\s*<div class="rounded-2xl bg-black\/\[0\.02\]/)
    })
  }
})

describe('account cluster localisation', () => {
  it('users.vue resolves status and email-state labels per render', () => {
    expect(users).toContain('const statusLabels = computed<Record<string, string>>')
    expect(users).toContain('const emailStateLabels = computed<Record<string, string>>')
  })

  it('subscriptions.vue resolves subscription status labels per render', () => {
    expect(subscriptions).toContain('const subscriptionStatusLabels = computed<Record<string, string>>')
  })

  for (const [name, source] of pages) {
    it(`${name} formats dates in the active locale`, () => {
      expect(source).not.toContain('toLocaleDateString(\'en-US\'')
      expect(source).toContain('toLocaleDateString(locale.value')
    })
  }

})

/**
 * codes and credits exist only to forward onto the two pages that absorbed
 * them. A forwarding route that pushes instead of replacing traps Back: the
 * reader returns to it and is sent straight forward again.
 */
describe('account cluster redirects leave history usable', () => {
  it('codes.vue replaces itself in history', () => {
    expect(codes).toContain("navigateTo('/dashboard/admin/subscriptions', { replace: true })")
    expect(codes).toContain("navigateTo('/dashboard/overview', { replace: true })")
  })

  it('credits.vue replaces itself in history', () => {
    expect(credits).toContain("navigateTo('/dashboard/admin/users', { replace: true })")
  })
})

describe('account cluster destructive actions', () => {
  it('subscriptions.vue arms a revoke before it fires', () => {
    expect(subscriptions).toContain('function requestRevoke(code: ActivationCode)')
    expect(subscriptions).toContain('@click="requestRevoke(code)"')
    expect(subscriptions).not.toContain('@click="revokeCode(code)"')
  })

  it('subscriptions.vue confirms a clipboard copy instead of failing silently', () => {
    expect(subscriptions).toContain('async function copyCode(id: string, code: string)')
    expect(subscriptions).toContain('await navigator.clipboard.writeText(code)')
    expect(subscriptions).toContain('copiedCodeId')
    // The bare call swallowed a rejected permission with no sign on screen.
    expect(subscriptions).not.toContain('navigator.clipboard.writeText(code)\n}')
  })

  /**
   * `actionsLocked` folds in the list-level `loading` flag. saveEditor is the
   * only caller, so a refresh in flight — the search debounce fires one on every
   * keystroke — made both writes return without doing anything while saveEditor
   * still reported "User updated."
   */
  it('users.vue does not let a list refresh silently drop the editor writes', () => {
    const roleFn = users.slice(users.indexOf('async function updateUserRole'), users.indexOf('async function updateUserProfile'))

    expect(roleFn).toContain('async function updateUserStatus')
    expect(roleFn).not.toContain('actionsLocked.value')
  })
})
