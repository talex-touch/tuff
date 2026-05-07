import { afterEach, describe, expect, it } from 'vitest'
import { __syncMigrationTestHooks } from './index'

describe('sync b64 migration payload repush marker', () => {
  afterEach(() => {
    __syncMigrationTestHooks.resetDirtyStateForTest()
  })

  it('marks b64 migration reads dirty and schedules an encrypted repush', () => {
    __syncMigrationTestHooks.resetDirtyStateForTest()

    __syncMigrationTestHooks.markB64PayloadAppliedForTest('app-setting')

    expect(__syncMigrationTestHooks.isDirtyForTest('app-setting')).toBe(true)
    expect(__syncMigrationTestHooks.hasScheduledPushForTest()).toBe(true)
  })
})
