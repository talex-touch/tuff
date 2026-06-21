import { createError } from 'h3'

export default defineEventHandler(async () => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Invite-code join flow has been retired. Use team invitations instead.',
  })
})
