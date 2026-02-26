export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage:
      'Deprecated provider test endpoint. Use /api/dashboard/intelligence/providers/:id/test instead.',
  })
})
