import { createError, readBody } from 'h3'
import { appendAdminBreakglassAudit } from '../../../../utils/adminBreakglassAuditStore'
import { requireAdminControlPlaneAuth } from '../../../../utils/adminControlPlaneGuard'
import {
  confirmDualControlOperation,
  getDualControlOperation,
  rejectDualControlOperation,
} from '../../../../utils/adminDualControlStore'
import {
  digestRiskPayload,
  executeRiskActorUnblock,
  executeRiskCaseReview,
  executeRiskModeOverride,
} from '../../../../utils/adminRiskActions'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdminControlPlaneAuth(event, undefined, {
    auditAction: 'risk.dual-control.confirm.auth',
  })

  const body = await readBody<{
    operation_id?: unknown
    decision?: unknown
    reason?: unknown
  }>(event)
  const operationId = typeof body?.operation_id === 'string' ? body.operation_id.trim() : ''
  const decision = typeof body?.decision === 'string' ? body.decision.trim().toLowerCase() : 'confirm'
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  if (!operationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'operation_id is required.',
    })
  }

  const operation = await getDualControlOperation(event, operationId)
  if (!operation || operation.status !== 'pending') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pending operation not found.',
    })
  }
  if (Date.parse(operation.expiresAt) <= Date.now()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pending operation expired.',
    })
  }

  if (ctx.actorId === operation.submitterActorId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Submitter cannot confirm own operation.',
    })
  }
  if (ctx.adminId && operation.submitterAdminId && ctx.adminId === operation.submitterAdminId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Submitter cannot confirm own operation.',
    })
  }

  if (ctx.channel !== 'A' && !ctx.scope.includes(operation.scope as any)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Scope mismatch for dual-control confirm.',
    })
  }

  if (decision === 'reject') {
    const rejected = await rejectDualControlOperation(event, {
      operationId,
      confirmerActorId: ctx.actorId,
      confirmerAdminId: ctx.adminId,
      reason,
    })
    if (!rejected) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Pending operation already processed.',
      })
    }

    await appendAdminBreakglassAudit(event, {
      actorId: ctx.actorId,
      actorAdminId: ctx.adminId,
      channel: ctx.channel,
      action: operation.action,
      target: operation.id,
      scope: operation.scope,
      decision: 'rejected',
      evidenceRef: reason,
    })
    return { success: true, decision: 'rejected', operation_id: operation.id }
  }

  const confirmed = await confirmDualControlOperation(event, {
    operationId,
    confirmerActorId: ctx.actorId,
    confirmerAdminId: ctx.adminId,
    reason,
  })
  if (!confirmed) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Pending operation already processed.',
    })
  }

  const payload = JSON.parse(operation.payloadJson)
  const digest = digestRiskPayload(payload)
  if (digest !== operation.payloadDigest) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Pending operation payload mismatch.',
    })
  }

  if (operation.action === 'risk.mode.override') {
    await executeRiskModeOverride(event, payload, ctx.actorId)
  }
  else if (operation.action === 'risk.actor.unblock') {
    await executeRiskActorUnblock(event, payload)
  }
  else if (operation.action === 'risk.case.review') {
    await executeRiskCaseReview(event, payload)
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported pending operation action.',
    })
  }

  await appendAdminBreakglassAudit(event, {
    actorId: ctx.actorId,
    actorAdminId: ctx.adminId,
    channel: ctx.channel,
    action: operation.action,
    target: operation.id,
    scope: operation.scope,
    decision: 'confirmed',
    evidenceRef: reason,
  })

  return {
    success: true,
    decision: 'confirmed',
    operation_id: operation.id,
  }
})
