export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage:
      'Deprecated orchestrator endpoint. Use /api/admin/intelligence-agent/session/stream instead.',
  })
})
