import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useThinkingTicker } from '../composables/useThinkingTicker'

describe('useThinkingTicker', () => {
  it('rolls a fresh verb when activated and morphs on intervals', () => {
    vi.useFakeTimers()
    const active = ref(false)
    const ticker = useThinkingTicker({ active, intervalMs: 1000 })

    expect(active.value).toBe(false)
    active.value = true

    const initialVerb = ticker.activeVerb.value
    expect(initialVerb).toBeTruthy()
    expect(ticker.activeLabel.value).toBe(`${initialVerb}…`)

    // Advance 1000ms -> should morph to a new verb
    vi.advanceTimersByTime(1000)
    const secondVerb = ticker.activeVerb.value
    expect(secondVerb).toBeTruthy()
    expect(secondVerb).not.toBe(initialVerb)
    expect(ticker.activeLabel.value).toBe(`${secondVerb}…`)

    // Turn finishes -> stop ticker
    active.value = false
    vi.advanceTimersByTime(2000)
    expect(ticker.activeVerb.value).toBe(secondVerb)

    vi.useRealTimers()
  })
})
