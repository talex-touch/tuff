import { describe, expect, it } from 'vitest'
import { createUpdateDialogSession } from './update-dialog-session'

describe('update dialog session', () => {
  it('deduplicates repeated presentations for the same tag', () => {
    const session = createUpdateDialogSession()

    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(true)
    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(false)
  })

  it('blocks a new presentation while an action is still pending', () => {
    const session = createUpdateDialogSession()

    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(true)
    expect(session.beginAction('v2.4.9-beta.15')).toBe(true)
    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(false)
  })

  it('suppresses automatic re-open after a successful action', () => {
    const session = createUpdateDialogSession()

    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(true)
    expect(session.beginAction('v2.4.9-beta.15')).toBe(true)
    session.finishAction('v2.4.9-beta.15', true)

    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(false)
  })

  it('allows manual reopen when suppression is bypassed', () => {
    const session = createUpdateDialogSession()

    expect(session.beginPresentation('v2.4.9-beta.15')).toBe(true)
    expect(session.beginAction('v2.4.9-beta.15')).toBe(true)
    session.finishAction('v2.4.9-beta.15', true)

    expect(session.beginPresentation('v2.4.9-beta.15', { bypassSuppression: true })).toBe(true)
  })
})
