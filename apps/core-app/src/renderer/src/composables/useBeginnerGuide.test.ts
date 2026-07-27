import { beforeEach, describe, expect, it } from 'vitest'
import { useBeginnerGuide } from './useBeginnerGuide'

describe('useBeginnerGuide', () => {
  beforeEach(() => {
    useBeginnerGuide().close()
  })

  it('shares visibility across callers', () => {
    const appOwner = useBeginnerGuide()
    const settingsCaller = useBeginnerGuide()

    settingsCaller.open()

    expect(appOwner.visible.value).toBe(true)
  })

  it('reruns through an unmounted frame before reopening', async () => {
    const guide = useBeginnerGuide()
    guide.open()

    const rerun = guide.rerun()
    expect(guide.visible.value).toBe(false)

    await rerun
    expect(guide.visible.value).toBe(true)
  })
})
