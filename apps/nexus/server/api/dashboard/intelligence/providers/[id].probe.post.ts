export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage:
      'Deprecated provider probe endpoint. Use /api/dashboard/intelligence/providers/:id/probe instead.',
  })
})
