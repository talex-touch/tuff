// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  FLIP_DIALOG_DEFAULT_MAX_HEIGHT,
  FLIP_DIALOG_FULL_MAX_HEIGHT,
  FLIP_DIALOG_SIZE_WIDTH_MAP,
  hideFlipDialogReference,
  resolveFlipDialogCardStyleVariables,
  resolveFlipDialogHideTarget,
  resolveFlipDialogReference,
  restoreFlipDialogReference,
  shouldFlipDialogAutoOpenOnReferenceClick
} from './flip-dialog.utils'

describe('flip-dialog utils', () => {
  it('reference 参数优先于 reference 插槽（包括显式 null）', () => {
    const propReference = document.createElement('button')
    const slotReference = document.createElement('div')

    expect(
      resolveFlipDialogReference({
        hasReferenceProp: true,
        propReference: propReference,
        slotReference
      })
    ).toBe(propReference)

    expect(
      resolveFlipDialogReference({
        hasReferenceProp: true,
        propReference: null,
        slotReference
      })
    ).toBeNull()

    expect(
      resolveFlipDialogReference({
        hasReferenceProp: false,
        propReference: propReference,
        slotReference
      })
    ).toBe(slotReference)
  })

  it('referenceAutoOpen 控制 reference 点击自动打开', () => {
    expect(
      shouldFlipDialogAutoOpenOnReferenceClick({
        referenceAutoOpen: true,
        visible: false
      })
    ).toBe(true)
    expect(
      shouldFlipDialogAutoOpenOnReferenceClick({
        referenceAutoOpen: false,
        visible: false
      })
    ).toBe(false)
    expect(
      shouldFlipDialogAutoOpenOnReferenceClick({
        referenceAutoOpen: true,
        visible: true
      })
    ).toBe(false)
  })

  it('hideReferenceOnOpen 场景下可正确隐藏并恢复 reference 样式', () => {
    const target = document.createElement('div')
    target.style.opacity = '0.65'
    target.style.pointerEvents = 'auto'

    const snapshot = hideFlipDialogReference(target)
    expect(target.style.opacity).toBe('0')
    expect(target.style.pointerEvents).toBe('none')

    restoreFlipDialogReference(target, snapshot)
    expect(target.style.opacity).toBe('0.65')
    expect(target.style.pointerEvents).toBe('auto')
  })

  it('reference 为 DOMRect 时优先隐藏 reference 插槽元素', () => {
    const slotReference = document.createElement('div')
    const domRectReference = new DOMRect(0, 0, 100, 80)

    expect(
      resolveFlipDialogHideTarget({
        reference: domRectReference,
        slotReference
      })
    ).toBe(slotReference)
  })

  it('size 预设与 width/maxHeight/minHeight 覆盖关系正确', () => {
    const lgStyle = resolveFlipDialogCardStyleVariables({ size: 'lg' })
    expect(lgStyle['--flip-dialog-width']).toBe(FLIP_DIALOG_SIZE_WIDTH_MAP.lg)
    expect(lgStyle['--flip-dialog-max-height']).toBe(FLIP_DIALOG_DEFAULT_MAX_HEIGHT)

    const fullStyle = resolveFlipDialogCardStyleVariables({ size: 'full' })
    expect(fullStyle['--flip-dialog-max-height']).toBe(FLIP_DIALOG_FULL_MAX_HEIGHT)

    const customStyle = resolveFlipDialogCardStyleVariables({
      size: 'md',
      width: '900px',
      maxHeight: '70dvh',
      minHeight: '480px'
    })
    expect(customStyle['--flip-dialog-width']).toBe('900px')
    expect(customStyle['--flip-dialog-max-height']).toBe('70dvh')
    expect(customStyle['--flip-dialog-min-height']).toBe('480px')
  })
})
