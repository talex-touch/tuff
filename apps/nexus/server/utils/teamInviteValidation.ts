import type { H3Event } from 'h3'
import type { SubscriptionPlan } from './subscriptionStore'
import type { TeamInvite } from './teamStore'
import type { TeamRecord } from './creditsStore'
import { createError } from 'h3'
import { addTeamMember, countTeamMembers, getTeamById, isUserTeamMember, listUserTeams } from './creditsStore'
import { getUserById } from './authStore'
import { getUserSubscription } from './subscriptionStore'
import { getInviteByCode, getTeamQuota, updateTeamSeats, useInvite } from './teamStore'

export type InviteValidationReason =
  | 'ok'
  | 'expired'
  | 'revoked'
  | 'used_up'
  | 'email_mismatch'
  | 'already_member'
  | 'seat_full'
  | 'plan_locked'

export interface InviteValidationResult {
  canJoin: boolean
  reason: InviteValidationReason
  invite: TeamInvite
  team: TeamRecord
  ownerPlan: SubscriptionPlan
  seatsUsed: number
  seatsLimit: number
}

function normalizeEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

function isCollaborationPlan(plan: SubscriptionPlan): boolean {
  return plan === 'TEAM' || plan === 'ENTERPRISE'
}

function resolveValidationErrorMessage(reason: InviteValidationReason): string {
  const messageMap: Record<InviteValidationReason, string> = {
    ok: 'OK',
    expired: 'Invite has expired',
    revoked: 'Invite has been revoked',
    used_up: 'Invite has reached max uses',
    email_mismatch: 'Invite email does not match current account',
    already_member: 'You are already in a team',
    seat_full: 'Team seats are full',
    plan_locked: 'Team plan does not allow collaboration',
  }

  return messageMap[reason]
}

export async function validateInviteForUser(
  event: H3Event,
  userId: string,
  code: string,
): Promise<InviteValidationResult> {
  const invite = await getInviteByCode(event, code)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }

  const team = await getTeamById(event, invite.organizationId)
  if (!team) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  const ownerPlan = (await getUserSubscription(event, team.ownerUserId)).plan
  const seatsUsed = await countTeamMembers(event, team.id)
  const quota = await getTeamQuota(event, team.id, ownerPlan)
  const seatsLimit = quota.seatsLimit

  const fail = (reason: InviteValidationReason): InviteValidationResult => ({
    canJoin: false,
    reason,
    invite,
    team,
    ownerPlan,
    seatsUsed,
    seatsLimit,
  })

  if (invite.status === 'revoked') {
    return fail('revoked')
  }

  if (invite.status === 'expired') {
    return fail('expired')
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return fail('expired')
  }

  if (invite.uses >= invite.maxUses || invite.status === 'accepted') {
    return fail('used_up')
  }

  const currentUser = await getUserById(event, userId)
  if (!currentUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const boundEmail = normalizeEmail(invite.email)
  if (boundEmail) {
    const userEmail = normalizeEmail(currentUser.email)
    if (!userEmail || boundEmail !== userEmail) {
      return fail('email_mismatch')
    }
  }

  const userTeams = await listUserTeams(event, userId)
  const organizationTeam = userTeams.find(item => item.type === 'organization')
  if (organizationTeam) {
    if (organizationTeam.id === team.id) {
      return fail('already_member')
    }

    return fail('already_member')
  }

  const alreadyMember = await isUserTeamMember(event, team.id, userId)
  if (alreadyMember) {
    return fail('already_member')
  }

  if (!isCollaborationPlan(ownerPlan)) {
    return fail('plan_locked')
  }

  if (seatsUsed >= seatsLimit) {
    return fail('seat_full')
  }

  return {
    canJoin: true,
    reason: 'ok',
    invite,
    team,
    ownerPlan,
    seatsUsed,
    seatsLimit,
  }
}

export async function joinTeamWithInvite(
  event: H3Event,
  userId: string,
  code: string,
) {
  const validation = await validateInviteForUser(event, userId, code)
  if (!validation.canJoin) {
    throw createError({
      statusCode: 400,
      statusMessage: resolveValidationErrorMessage(validation.reason),
      data: {
        reason: validation.reason,
      },
    })
  }

  await useInvite(event, validation.invite.code)
  await addTeamMember(event, validation.team.id, userId, validation.invite.role || 'member')

  const nextSeatsUsed = await countTeamMembers(event, validation.team.id)
  await updateTeamSeats(event, validation.team.id, nextSeatsUsed)

  return {
    validation,
    seatsUsed: nextSeatsUsed,
    seatsLimit: validation.seatsLimit,
  }
}
