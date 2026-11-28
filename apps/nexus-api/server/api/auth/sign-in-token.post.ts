import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  throw createError({
    statusCode: 410,
    statusMessage: 'This endpoint has moved to /api/app-auth/sign-in-token.',
    data: {
      errorCode: 'AUTH_SIGN_IN_TOKEN_RETIRED',
      message: 'Use /api/app-auth/sign-in-token for desktop app sign-in token issuance.',
      replacement: '/api/app-auth/sign-in-token',
    },
  })
})
