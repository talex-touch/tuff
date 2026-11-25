import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from '../src/reactivity'
import { createFloatingController } from '../src/controllers/floating'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createFloatingController (@floating-ui/dom)', () => {
  it('computes position and reactive floatingStyles from reference and floating elements', async () => {
    const refEl = document.createElement('button')
    const floatEl = document.createElement('div')
    document.body.append(refEl, floatEl)

    vi.spyOn(refEl, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 80,
      left: 100,
      top: 80,
      right: 200,
      bottom: 112,
      width: 100,
      height: 32,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(floatEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 90,
      width: 160,
      height: 90,
      toJSON: () => ({}),
    } as DOMRect)

    const onPosition = vi.fn()
    const controller = createFloatingController({
      placement: 'bottom-start',
      strategy: 'fixed',
      offset: 8,
      flip: false,
      shift: false,
      autoUpdate: false,
      onPosition,
    })

    controller.mount(refEl, floatEl)
    const result = await controller.update()

    expect(result).not.toBeNull()
    expect(controller.isPositioned.value).toBe(true)
    expect(controller.x.value).toBe(100)
    expect(controller.y.value).toBe(120)
    expect(controller.floatingStyles.value).toEqual({
      position: 'fixed',
      left: '100px',
      top: '120px',
    })
    expect(onPosition).toHaveBeenCalled()

    controller.destroy()
  })

  it('supports transform mode and reactive open toggle', async () => {
    const refEl = document.createElement('div')
    const floatEl = document.createElement('div')
    document.body.append(refEl, floatEl)

    vi.spyOn(refEl, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 20,
      left: 40,
      top: 20,
      right: 120,
      bottom: 50,
      width: 80,
      height: 30,
      toJSON: () => ({}),
    } as DOMRect)

    const open = shallowRef(false)
    const controller = createFloatingController({
      placement: 'bottom-start',
      offset: 10,
      flip: false,
      shift: false,
      transform: true,
      autoUpdate: false,
      open,
    })

    controller.mount(refEl, floatEl)
    expect(controller.isPositioned.value).toBe(false)

    open.value = true
    await controller.update()
    expect(controller.isPositioned.value).toBe(true)
    expect(controller.floatingStyles.value.transform).toBe('translate(40px, 60px)')

    open.value = false
    expect(controller.isPositioned.value).toBe(false)
    controller.destroy()
  })
})
