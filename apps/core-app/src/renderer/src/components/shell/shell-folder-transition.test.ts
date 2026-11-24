// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  onFolderAfterEnter,
  onFolderAfterLeave,
  onFolderBeforeEnter,
  onFolderBeforeLeave,
  onFolderEnter,
  onFolderLeave
} from './shell-folder-transition'

function createClipPair(options: {
  outerRectHeight: number
  outerScrollHeight: number
  innerRectHeight: number
  innerOffsetHeight?: number
  connected?: boolean
}): { outer: HTMLDivElement; inner: HTMLDivElement } {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  outer.appendChild(inner)
  if (options.connected) document.body.appendChild(outer)

  Object.defineProperty(outer, 'scrollHeight', {
    configurable: true,
    get: () => options.outerScrollHeight
  })
  Object.defineProperty(inner, 'offsetHeight', {
    configurable: true,
    get: () => options.innerOffsetHeight ?? Math.round(options.innerRectHeight)
  })
  outer.getBoundingClientRect = () =>
    ({
      height: options.outerRectHeight
    }) as DOMRect
  inner.getBoundingClientRect = () =>
    ({
      height: options.innerRectHeight
    }) as DOMRect

  return { outer, inner }
}

describe('shell-folder-transition', () => {
  it('opens from 0px to the inner layout height without flex-shrink undershoot', () => {
    const { outer } = createClipPair({
      outerRectHeight: 0,
      outerScrollHeight: 638,
      innerRectHeight: 710.5
    })

    onFolderBeforeEnter(outer)
    expect(outer.style.height).toBe('0px')

    onFolderEnter(outer)
    // Uses exact subpixel inner height rather than a compressed outer scrollHeight.
    expect(outer.style.height).toBe('710.5px')

    onFolderAfterEnter(outer)
    expect(outer.style.height).toBe('')
  })

  it('reverses smoothly from the current visual height when collapsed mid-open', () => {
    const { outer } = createClipPair({
      outerRectHeight: 312.5,
      outerScrollHeight: 710.5,
      innerRectHeight: 710.5,
      connected: true
    })

    try {
      onFolderBeforeLeave(outer)
      expect(outer.style.height).toBe('312.5px')

      onFolderLeave(outer)
      expect(outer.style.height).toBe('0px')

      onFolderAfterLeave(outer)
      expect(outer.style.height).toBe('')
    } finally {
      outer.remove()
    }
  })

  it('keeps the current height when re-entering an already connected element mid-leave', () => {
    const { outer } = createClipPair({
      outerRectHeight: 240,
      outerScrollHeight: 710,
      innerRectHeight: 710,
      connected: true
    })

    try {
      onFolderBeforeEnter(outer)
      expect(outer.style.height).toBe('240px')

      onFolderEnter(outer)
      expect(outer.style.height).toBe('710px')
    } finally {
      outer.remove()
    }
  })
})
