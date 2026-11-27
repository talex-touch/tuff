import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachRipple, createRippleEffect } from '../src/controllers/ripple'

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('createRippleEffect', () => {
  it('mounts a ripple wave on pointerdown and cleans it up after duration', () => {
    vi.useFakeTimers()
    const button = document.createElement('button')
    document.body.appendChild(button)

    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 40,
      width: 120,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect)

    const ripple = createRippleEffect({ duration: 300 })
    ripple.attach(button)

    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 60, clientY: 20, button: 0 }))
    expect(button.querySelector('.tx-ripple-container')).not.toBeNull()
    expect(button.querySelector('.tx-ripple-wave')).not.toBeNull()

    vi.advanceTimersByTime(360)
    expect(button.querySelector('.tx-ripple-container')).toBeNull()

    ripple.destroy()
  })

  it('skips ripple on disabled elements and cleans up immediately on destroy', () => {
    vi.useFakeTimers()
    const button = document.createElement('button')
    button.disabled = true
    document.body.appendChild(button)

    const teardown = attachRipple(button, { duration: 400 })
    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0 }))
    expect(button.querySelector('.tx-ripple-container')).toBeNull()

    button.disabled = false
    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0 }))
    expect(button.querySelector('.tx-ripple-container')).not.toBeNull()

    teardown()
    expect(button.querySelector('.tx-ripple-container')).toBeNull()
  })
})
