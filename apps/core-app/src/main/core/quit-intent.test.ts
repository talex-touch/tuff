import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureUserNormalQuitIntent,
  getQuitIntent,
  resetQuitIntentForTest,
  setQuitIntent
} from './quit-intent'

describe('quit intent', () => {
  beforeEach(() => {
    resetQuitIntentForTest()
  })

  afterEach(() => {
    resetQuitIntentForTest()
  })

  it('starts without a process quit intent', () => {
    expect(getQuitIntent()).toBeNull()
  })

  it('classifies an unspecified quit as a user-normal intent', () => {
    expect(ensureUserNormalQuitIntent('electron-before-quit')).toMatchObject({
      kind: 'user-normal',
      reason: 'electron-before-quit'
    })
  })

  it('retains update-now when a later normal quit is observed', () => {
    setQuitIntent('update-now', 'update-install:attempt-1')

    expect(ensureUserNormalQuitIntent('electron-before-quit')).toMatchObject({
      kind: 'update-now',
      reason: 'update-install:attempt-1'
    })
  })

  it.each([
    ['system shutdown', 'system-shutdown'],
    ['startup failure', 'startup-failure'],
    ['duplicate instance', 'duplicate-instance']
  ] as const)('preserves %s intent over update and normal quits', (_name, kind) => {
    setQuitIntent('update-now', 'update-install:attempt-1')
    setQuitIntent(kind, 'safe-exit')

    expect(ensureUserNormalQuitIntent('electron-before-quit')).toMatchObject({
      kind,
      reason: 'safe-exit'
    })
  })

  it('clears an existing intent for the next isolated process lifecycle', () => {
    setQuitIntent('update-now', 'update-install:attempt-1')

    resetQuitIntentForTest()

    expect(getQuitIntent()).toBeNull()
  })
})
