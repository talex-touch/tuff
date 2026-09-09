/**
 * The platform account role — the `role` column on `auth_users`.
 *
 * Only ever `admin` or `user`: the column defaults to `'user'`, and the one
 * endpoint that writes it (`server/api/admin/users/index.get.ts`) validates
 * against exactly that pair. The server gate is `requireAdmin`
 * (`server/utils/auth.ts`), which rejects anything that is not `'admin'`, so a
 * client check looser than this one renders a view whose own requests 403.
 *
 * This is NOT the team role. `owner` belongs to `TeamMemberRole`
 * (`'owner' | 'admin' | 'member'`, see `server/utils/creditsStore.ts`) and
 * lives in the team-membership table — a team owner has no platform
 * privileges at all. Use `useTeamRole()` for that namespace; conflating the
 * two is what the deleted `isAdminRole()` helper did.
 */
export type AccountRole = 'admin' | 'user'

export function isAdminAccountRole(role?: string | null): boolean {
  return normalizeAccountRole(role) === 'admin'
}

export function normalizeAccountRole(role?: string | null): string {
  return String(role ?? '').trim().toLowerCase()
}
