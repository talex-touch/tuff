import type { H3Event } from 'h3'
import type { SubscriptionPlan } from './subscriptionStore'
import type { TeamMemberRole, TeamRecord } from './creditsStore'
import type { TeamQuota } from './teamStore'
import { createError } from 'h3'
import {
  countTeamMembers,
  ensurePersonalTeam,
  getTeamById,
  getUserRoleInTeam,
  listUserTeams,
} from './creditsStore'
import { getUserSubscription } from './subscriptionStore'
import { getTeamQuota, updateTeamSeats } from './teamStore'

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

export async function resolveActiveTeamContext(
  event: H3Event,
  userId: string,
): Promise<ActiveTeamContext> {
  await ensurePersonalTeam(event, userId)

  const teams = await listUserTeams(event, userId)
  const active = resolveActiveTeam(userId, teams)
  if (!active) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  const team = await getTeamById(event, active.id)
  if (!team) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  const role = (await getUserRoleInTeam(event, team.id, userId)) || active.role
  if (!role) {
    throw createError({ statusCode: 403, statusMessage: 'Not a team member' })
  }

  const ownerSubscription = await getUserSubscription(event, team.ownerUserId)
  const ownerPlan = ownerSubscription.plan
  const quota = await getTeamQuota(event, team.id, ownerPlan)
  const seatsUsed = await countTeamMembers(event, team.id)

  if (quota.seatsUsed !== seatsUsed) {
    await updateTeamSeats(event, team.id, seatsUsed)
    quota.seatsUsed = seatsUsed
  }

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
