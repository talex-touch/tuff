import { describe, expect, it } from 'vitest'
import { canShowLoginResumePrompt, resolveAuthMountAction } from './use-auth-policies'

describe('use-auth-policies', () => {
  it('resolves mount action without beginner gate', () => {
    expect(resolveAuthMountAction(false)).toBe('initialize')
    expect(resolveAuthMountAction(true)).toBe('check')
  })

  it('keeps login resume prompt gated by beginner.init', () => {
    expect(
      canShowLoginResumePrompt({
        beginnerInit: false,
        hasPendingBrowserLogin: true,
        isSignedIn: false,
        isHandlingExternalAuthCallback: false,
        promptActive: false
      })
    ).toBe(false)

    expect(
      canShowLoginResumePrompt({
        beginnerInit: true,
        hasPendingBrowserLogin: true,
        isSignedIn: false,
        isHandlingExternalAuthCallback: false,
        promptActive: false
      })
    ).toBe(true)
  })

  it('blocks login resume prompt for active blockers', () => {
    expect(
      canShowLoginResumePrompt({
        beginnerInit: true,
        hasPendingBrowserLogin: false,
        isSignedIn: false,
        isHandlingExternalAuthCallback: false,
        promptActive: false
      })
    ).toBe(false)

    expect(
      canShowLoginResumePrompt({
        beginnerInit: true,
        hasPendingBrowserLogin: true,
        isSignedIn: true,
        isHandlingExternalAuthCallback: false,
        promptActive: false
      })
    ).toBe(false)

    expect(
      canShowLoginResumePrompt({
        beginnerInit: true,
        hasPendingBrowserLogin: true,
        isSignedIn: false,
        isHandlingExternalAuthCallback: true,
        promptActive: false
      })
    ).toBe(false)

    expect(
      canShowLoginResumePrompt({
        beginnerInit: true,
        hasPendingBrowserLogin: true,
        isSignedIn: false,
        isHandlingExternalAuthCallback: false,
        promptActive: true
      })
    ).toBe(false)
  })
})
