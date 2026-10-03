import { onScopeDispose, readonly, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import { normalizeUserCreditsResponse, normalizeUserSubscription, readCreditDeductRefusal } from '~/utils/admin-users'
import type {
  AdminRequest,
  AdminUserCredits,
  AdminUserSubscription,
  CreditAdjustmentCheck,
  SubscriptionGrantCheck,
  Translate,
} from '~/utils/admin-users'

/**
 * Data behind the user management drawer's subscription and credit views.
 *
 * The drawer shows one account at a time, and an administrator can close it and
 * open the next account before the first one's request answers. Every response
 * here therefore belongs to the account it was asked for and to the request that
 * asked: a slow answer for the previous account, or for a page that was already
 * left, is dropped instead of being painted over the account now on screen
 * (`.trellis/spec/frontend/quality-guidelines.md`, "Administrative subscription
 * responses belong to one open drawer identity and request generation").
 */

/** The outcome of a write, for the page's toast. */
export type AdminDrawerActionResult =
  | { ok: true, /** The drawer still shows the account the write was for. */ applied: boolean }
  | { ok: false, message: string | null }

/**
 * The outcome of a credit adjustment. A deduction the API refused at the quota
 * floor is its own failure: the page words it with `maxDeduct`, the most the API
 * allows now (`creditDeductRefusalMessage`).
 */
export type AdminCreditAdjustResult =
  | AdminDrawerActionResult
  | { ok: false, message: null, maxDeduct: number }

export interface DrawerRequestTracker {
  /** The account the drawer shows, or `null` while it is closed. */
  readonly target: string | null
  open: (target: string) => void
  close: () => void
  /** Starts a read. It stays current while the same account is open and no newer read started. */
  read: () => () => boolean
  /** Starts a write. It stays current while the same account is open. */
  write: () => () => boolean
  /** A write answered with fresher data than any read still in flight: drop those reads. */
  supersedeReads: () => void
}

/**
 * Request generations for a drawer that shows one record at a time: opening or
 * closing it invalidates everything in flight, and a newer read invalidates an
 * older one for the same record.
 */
export function createDrawerRequestTracker(): DrawerRequestTracker {
  let target: string | null = null
  let opened = 0
  let reads = 0
  return {
    get target() {
      return target
    },
    open(next) {
      target = next
      opened += 1
      reads += 1
    },
    close() {
      target = null
      opened += 1
      reads += 1
    },
    read() {
      const openedAt = opened
      const readAt = ++reads
      return () => openedAt === opened && readAt === reads
    },
    write() {
      const openedAt = opened
      return () => openedAt === opened
    },
    supersedeReads() {
      reads += 1
    },
  }
}

function userPath(userId: string, resource: string): string {
  return `/api/admin/users/${encodeURIComponent(userId)}/${resource}`
}

export interface AdminUserDrawerOptions {
  /** `requestJson` on the page; a fake in tests. */
  request: AdminRequest
  t: Translate
}

export interface AdminUserSubscriptionState {
  subscription: Readonly<Ref<AdminUserSubscription | null>>
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  granting: Readonly<Ref<boolean>>
  open: (userId: string) => Promise<void>
  close: () => void
  refresh: () => Promise<void>
  /** Grants the plan, then re-reads the subscription while the drawer still shows the account. */
  grant: (check: Extract<SubscriptionGrantCheck, { ok: true }>) => Promise<AdminDrawerActionResult>
}

export function useAdminUserSubscription(options: AdminUserDrawerOptions): AdminUserSubscriptionState {
  const tracker = createDrawerRequestTracker()
  const subscription = shallowRef<AdminUserSubscription | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const granting = ref(false)

  function reset() {
    subscription.value = null
    error.value = null
    loading.value = false
    granting.value = false
  }

  async function load(): Promise<void> {
    const userId = tracker.target
    if (!userId)
      return
    const isCurrent = tracker.read()
    loading.value = true
    error.value = null
    try {
      const response = await options.request(userPath(userId, 'subscription')) as { subscription?: unknown } | null
      if (!isCurrent())
        return
      subscription.value = normalizeUserSubscription(response?.subscription)
    }
    catch (cause) {
      if (!isCurrent())
        return
      error.value = resolveAdminErrorMessage(cause, options.t('dashboard.sections.users.subscription.loadFailed', 'Failed to load subscription.'))
    }
    finally {
      if (isCurrent())
        loading.value = false
    }
  }

  onScopeDispose(() => tracker.close())

  return {
    subscription,
    loading: readonly(loading),
    error: readonly(error),
    granting: readonly(granting),
    open(userId) {
      tracker.open(userId)
      reset()
      return load()
    },
    close() {
      tracker.close()
      reset()
    },
    refresh: load,
    async grant(check) {
      const userId = tracker.target
      if (!userId || granting.value)
        return { ok: false, message: null }
      const isCurrent = tracker.write()
      granting.value = true
      try {
        await options.request('/api/admin/subscriptions/grant', { method: 'POST', body: { userId, ...check.body } })
        if (isCurrent())
          await load()
        return { ok: true, applied: isCurrent() }
      }
      catch (cause) {
        return {
          ok: false,
          message: resolveAdminErrorMessage(cause, options.t('dashboard.sections.users.subscription.grantFailed', 'Failed to grant subscription.')),
        }
      }
      finally {
        if (isCurrent())
          granting.value = false
      }
    },
  }
}

export interface AdminUserCreditsState {
  credits: Readonly<Ref<AdminUserCredits | null>>
  /** A request is running; with `credits` still `null` it is the first load. */
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  saving: Readonly<Ref<boolean>>
  open: (userId: string) => Promise<void>
  close: () => void
  refresh: () => Promise<void>
  setPage: (page: number) => Promise<void>
  /** Adjusts the quota; the answer carries the new balance, the deduction limit and the first ledger page. */
  adjust: (check: Extract<CreditAdjustmentCheck, { ok: true }>) => Promise<AdminCreditAdjustResult>
}

/** Ledger rows per page in the drawer. */
export const USER_CREDIT_LEDGER_PAGE_SIZE = 10

export function useAdminUserCredits(options: AdminUserDrawerOptions): AdminUserCreditsState {
  const tracker = createDrawerRequestTracker()
  const credits = shallowRef<AdminUserCredits | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  function reset() {
    credits.value = null
    error.value = null
    loading.value = false
    saving.value = false
  }

  function apply(response: unknown) {
    credits.value = normalizeUserCreditsResponse(response, USER_CREDIT_LEDGER_PAGE_SIZE)
  }

  async function load(page: number): Promise<void> {
    const userId = tracker.target
    if (!userId)
      return
    const isCurrent = tracker.read()
    loading.value = true
    error.value = null
    try {
      const response = await options.request(userPath(userId, 'credits'), {
        query: { page, limit: USER_CREDIT_LEDGER_PAGE_SIZE },
      })
      if (!isCurrent())
        return
      apply(response)
    }
    catch (cause) {
      if (!isCurrent())
        return
      // The balance and ledger already on screen stay; the error says the
      // latest request failed. Without them the drawer shows the error alone.
      error.value = resolveAdminErrorMessage(cause, options.t('dashboard.sections.users.credits.loadFailed', 'Failed to load credits.'))
    }
    finally {
      if (isCurrent())
        loading.value = false
    }
  }

  onScopeDispose(() => tracker.close())

  return {
    credits,
    loading: readonly(loading),
    error: readonly(error),
    saving: readonly(saving),
    open(userId) {
      tracker.open(userId)
      reset()
      return load(1)
    },
    close() {
      tracker.close()
      reset()
    },
    refresh() {
      return load(credits.value?.page ?? 1)
    },
    setPage(page) {
      if (!tracker.target || !Number.isInteger(page) || page < 1)
        return Promise.resolve()
      return load(page)
    },
    async adjust(check) {
      const userId = tracker.target
      if (!userId || saving.value)
        return { ok: false, message: null }
      const isCurrent = tracker.write()
      saving.value = true
      try {
        const response = await options.request(userPath(userId, 'credits'), { method: 'PATCH', body: check.body })
        if (isCurrent()) {
          // Newer than any page read still in flight: it carries the balance
          // after the adjustment, so a slower read must not land on top of it.
          tracker.supersedeReads()
          loading.value = false
          error.value = null
          apply(response)
        }
        return { ok: true, applied: isCurrent() }
      }
      catch (cause) {
        const refusal = readCreditDeductRefusal(cause)
        if (refusal) {
          // The limit the API refused against is newer than the one the form
          // checked. It replaces that one only while the drawer still shows the
          // account the deduction was for; nothing else was written.
          if (isCurrent() && credits.value)
            credits.value = { ...credits.value, limits: refusal }
          return { ok: false, message: null, maxDeduct: refusal.maxDeduct }
        }
        return {
          ok: false,
          message: resolveAdminErrorMessage(cause, options.t('dashboard.sections.users.credits.adjustFailed', 'Failed to update credits.')),
        }
      }
      finally {
        if (isCurrent())
          saving.value = false
      }
    },
  }
}
