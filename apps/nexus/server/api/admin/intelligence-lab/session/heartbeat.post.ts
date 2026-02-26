export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Deprecated intelligence-lab endpoint. Use /api/admin/intelligence-agent/* instead.'
  })
})
