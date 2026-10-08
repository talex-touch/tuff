import type { H3Event } from 'h3'
import type { SubscriptionPlan } from './subscriptionStore'
import type { TeamMemberRole, TeamRecord } from './creditsStore'
import { createError } from 'h3'
import {
  ensureCreditsTables,
  listUserTeams,
  preparePersonalTeamStatements,
  prepareTeamMemberCountQuery,
  requireDatabase,
} from './creditsStore'
import { ensureSubscriptionTables, mapLatestActivation, prepareLatestActivationQuery } from './subscriptionStore'
import { type D1QuotaRow, ensureTeamTables, planTeamQuota, prepareTeamQuotaQuery, prepareTeamSeatsUpdate, type TeamQuota } from './teamStore'

export interface TeamPermissions {
  canInvite: boolean
  canManageMembers: boolean
  canDisband: boolean
  canCreateTeam: boolean
  canViewUsage: boolean
}

export interface TeamUpgradeHint {
  required: boolean
  targetPlan: 'TEAM' | null
}

export interface ActiveTeamContext {
  userId: string
  team: TeamRecord
  role: TeamMemberRole
  ownerPlan: SubscriptionPlan
  collaborationEnabled: boolean
  seatsUsed: number
  seatsLimit: number
  quota: TeamQuota
  permissions: TeamPermissions
  upgrade: TeamUpgradeHint
}

export type TeamCapability = keyof TeamPermissions

function isCollaborationPlan(plan: SubscriptionPlan): boolean {
  return plan === 'TEAM' || plan === 'ENTERPRISE'
}

function buildPermissions(
  team: TeamRecord,
  role: TeamMemberRole,
  collaborationEnabled: boolean,
): TeamPermissions {
  const isOwner = role === 'owner'
  const isAdminLike = role === 'owner' || role === 'admin'
  const isOrganization = team.type === 'organization'

  return {
    canInvite: collaborationEnabled && isOrganization && isAdminLike,
    canManageMembers: collaborationEnabled && isOrganization && isAdminLike,
    canDisband: isOrganization && isOwner,
    canCreateTeam: collaborationEnabled && !isOrganization && isOwner,
    canViewUsage: isOrganization ? isAdminLike : true,
  }
}

function buildUpgradeHint(
  team: TeamRecord,
  collaborationEnabled: boolean,
): TeamUpgradeHint {
  if (team.type === 'organization' || collaborationEnabled) {
    return { required: false, targetPlan: null }
  }

  return { required: true, targetPlan: 'TEAM' }
}

function resolveActiveTeam(userId: string, teams: Awaited<ReturnType<typeof listUserTeams>>) {
  const organizationTeam = teams.find(team => team.type === 'organization')
  if (organizationTeam) {
    return organizationTeam
  }

  return teams.find(team => team.id === `team_${userId}`) || teams[0] || null
}

/**
 * The caller's active team and everything the team endpoints derive from it, in two round trips in
 * the steady state and no writes: the user's teams, then one batch for the owner's plan, the quota
 * row and the member count. It was eight sequential statements, two of them writes on every call
 * (the personal team's `INSERT OR IGNORE`s), plus a team read and a role read that the team list
 * already answers. Writes happen only when something is missing or stale: the personal team, a
 * quota row that rolled over to a new week or changed plan, a seat count that drifted.
 */
export async function resolveActiveTeamContext(
  event: H3Event,
  userId: string,
): Promise<ActiveTeamContext> {
  const db = requireDatabase(event)
  await Promise.all([ensureCreditsTables(db), ensureSubscriptionTables(db), ensureTeamTables(db)])

  let teams = await listUserTeams(event, userId)
  if (!teams.some(team => team.id === `team_${userId}`)) {
    await db.batch(preparePersonalTeamStatements(db, userId))
    teams = await listUserTeams(event, userId)
  }

  const active = resolveActiveTeam(userId, teams)
  if (!active) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  const { role, joinedAt: _joinedAt, ...team } = active
  if (!role) {
    throw createError({ statusCode: 403, statusMessage: 'Not a team member' })
  }

  const [subscriptionResult, quotaResult, countResult] = await db.batch([
    prepareLatestActivationQuery(db, team.ownerUserId),
    prepareTeamQuotaQuery(db, team.id),
    prepareTeamMemberCountQuery(db, team.id),
  ])
  const ownerPlan = mapLatestActivation(subscriptionResult?.results?.[0] as Parameters<typeof mapLatestActivation>[0]).plan
  const { quota, write: quotaWrite } = planTeamQuota(
    db,
    team.id,
    (quotaResult?.results?.[0] as D1QuotaRow | undefined) ?? null,
    ownerPlan,
  )
  const seatsUsed = Number((countResult?.results?.[0] as { total?: number | string } | undefined)?.total ?? 0)

  const writes = quotaWrite ? [quotaWrite] : []
  if (quota.seatsUsed !== seatsUsed) {
    writes.push(prepareTeamSeatsUpdate(db, team.id, seatsUsed))
    quota.seatsUsed = seatsUsed
  }
  if (writes.length)
    await db.batch(writes)

  const collaborationEnabled = isCollaborationPlan(ownerPlan)
  const permissions = buildPermissions(team, role, collaborationEnabled)
  const upgrade = buildUpgradeHint(team, collaborationEnabled)

  return {
    userId,
    team,
    role,
    ownerPlan,
    collaborationEnabled,
    seatsUsed,
    seatsLimit: quota.seatsLimit,
    quota,
    permissions,
    upgrade,
  }
}

export function assertTeamCapability(
  context: ActiveTeamContext,
  capability: TeamCapability,
  message?: string,
): void {
  if (context.permissions[capability]) {
    return
  }

  throw createError({
    statusCode: 403,
    statusMessage: message || `Permission denied: ${capability}`,
  })
}

export function isTeamRoleAdminLike(role: TeamMemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canJoinOrganizationTeam(plan: SubscriptionPlan): boolean {
  return isCollaborationPlan(plan)
}
