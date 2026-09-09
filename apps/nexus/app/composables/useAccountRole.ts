import { computed } from 'vue'
import { isAdminAccountRole, normalizeAccountRole } from '~/utils/account-role'

/**
 * Reactive access to the signed-in account's platform role.
 *
 * Replaces the copy of `computed(() => user.value?.role === 'admin')` that had
 * been written out in ~20 pages and components. The copies had already drifted:
 * some lower-cased the value first and some compared it raw, so a stored role
 * that differed only in case would have been admin on one page and not on the
 * next.
 *
 * Reads the shared `auth-user` state directly instead of calling
 * `useAuthUser()`. That composable installs a watcher on auth status and fires
 * a profile request when authenticated — a graph the docs pages deliberately
 * keep out of their setup (see `docs-page-performance.test.ts`). Whoever owns
 * that fetch on a given route (useAuthUser on dashboard routes, app.vue
 * elsewhere) writes into this same key, so reading it is all a gate needs, and
 * this composable stays safe to call from anywhere.
 *
 * `isAdmin` is false while the payload is still loading, which is what every
 * call site wants for gating UI. It is deliberately not a "still loading"
 * signal — a component that must tell the two apart (the dashboard nav does,
 * to avoid hydrating an admin section that was absent from the SSR markup)
 * should pair this with its own mounted flag.
 */
interface AccountRoleState {
  role?: string | null
}

export function useAccountRole() {
  const userState = useState<AccountRoleState | null>('auth-user', () => null)

  const role = computed(() => normalizeAccountRole(userState.value?.role))
  const isAdmin = computed(() => isAdminAccountRole(userState.value?.role))

  return { role, isAdmin }
}
