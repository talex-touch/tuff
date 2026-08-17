import { issueAppSignInToken } from '../../utils/appAuthToken'

/**
 * Create a device-bound access/refresh token pair for the desktop app using
 * the current browser session. App bearer tokens must use the refresh route.
 */
export default defineEventHandler(async (event) => {
  return await issueAppSignInToken(event)
})
