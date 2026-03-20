export type AuthMountAction = 'initialize' | 'check'

export interface LoginResumePromptPolicyInput {
  beginnerInit: boolean | undefined
  hasPendingBrowserLogin: boolean
  isSignedIn: boolean
  isHandlingExternalAuthCallback: boolean
  promptActive: boolean
}

export function resolveAuthMountAction(isInitialized: boolean): AuthMountAction {
  return isInitialized ? 'check' : 'initialize'
}

export function canShowLoginResumePrompt(input: LoginResumePromptPolicyInput): boolean {
  if (!input.beginnerInit) return false
  if (!input.hasPendingBrowserLogin) return false
  if (input.isSignedIn) return false
  if (input.isHandlingExternalAuthCallback) return false
  if (input.promptActive) return false
  return true
}
