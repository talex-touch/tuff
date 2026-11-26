import { describe, expect, it } from 'vitest'
import { createDocsPrimaryDemoTracker } from './docs-primary-demo'

describe('createDocsPrimaryDemoTracker', () => {
  it('assigns primary status only to the first demo registered for a component slug', () => {
    const tracker = createDocsPrimaryDemoTracker()

    expect(tracker.claimPrimary('button', 'ButtonVariantsDemo:v-1')).toBe(true)
    expect(tracker.claimPrimary('button', 'ButtonDisabledDemo:v-2')).toBe(false)
    expect(tracker.claimPrimary('button', 'ButtonLoadingDemo:v-3')).toBe(false)

    expect(tracker.isPrimary('button', 'ButtonVariantsDemo:v-1')).toBe(true)
    expect(tracker.isPrimary('button', 'ButtonDisabledDemo:v-2')).toBe(false)
    expect(tracker.isPrimary('button', 'ButtonLoadingDemo:v-3')).toBe(false)
  })

  it('tracks independent slugs separately and supports release and reset', () => {
    const tracker = createDocsPrimaryDemoTracker()

    expect(tracker.claimPrimary('Button', 'ButtonVariantsDemo:v-1')).toBe(true)
    expect(tracker.claimPrimary('Tag', 'TagBasicDemo:v-2')).toBe(true)
    expect(tracker.isPrimary('button', 'ButtonVariantsDemo:v-1')).toBe(true)
    expect(tracker.isPrimary('tag', 'TagBasicDemo:v-2')).toBe(true)

    // Non-owner release is ignored.
    tracker.releasePrimary('button', 'ButtonDisabledDemo:v-3')
    expect(tracker.isPrimary('button', 'ButtonVariantsDemo:v-1')).toBe(true)

    // Owner release allows a new demo to claim primary.
    tracker.releasePrimary('button', 'ButtonVariantsDemo:v-1')
    expect(tracker.claimPrimary('button', 'ButtonDisabledDemo:v-3')).toBe(true)
    expect(tracker.isPrimary('button', 'ButtonDisabledDemo:v-3')).toBe(true)

    tracker.reset()
    expect(tracker.claimPrimary('tag', 'TagNextDemo:v-4')).toBe(true)
  })
})
