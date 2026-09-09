import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

/**
 * Reactive access to a team membership role — `'owner' | 'admin' | 'member'`
 * (`TeamMemberRole` in `server/utils/creditsStore.ts`).
 *
 * Separate namespace from the account role in `useAccountRole()`: a team owner
 * is not a platform administrator and `requireAdmin` will refuse them. The
 * only thing this currently unlocks is OAuth app management, which an
 * organization's owner or admin may reach without being a platform admin.
 *
 * The team object is passed in rather than fetched here because both call
 * sites already load `/api/dashboard/team` for their own reasons, and a second
 * fetch inside the composable would double the request on every dashboard
 * route.
 */
export interface TeamRoleSource {
  type?: string | null
  role?: string | null
}

export function useTeamRole(team: MaybeRefOrGetter<TeamRoleSource | null | undefined>) {
  const role = computed(() => String(toValue(team)?.role ?? '').trim().toLowerCase())
  const isOrganization = computed(() => toValue(team)?.type === 'organization')

  /**
   * Owner and admin are equivalent here, matching `teamContext.ts`'s
   * `isAdminLike`. Membership in a personal team grants nothing, hence the
   * organization check.
   */
  const isTeamAdmin = computed(() =>
    isOrganization.value && (role.value === 'owner' || role.value === 'admin'),
  )

  return { role, isOrganization, isTeamAdmin }
}
