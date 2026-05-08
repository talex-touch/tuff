import { issueAppSignInToken } from '../../utils/appAuthToken'

/**
 * Create a sign-in token for the desktop app using the current browser session
 * or a refreshable app bearer token.
 */
export default defineEventHandler(async (event) => {
  return await issueAppSignInToken(event)
})
