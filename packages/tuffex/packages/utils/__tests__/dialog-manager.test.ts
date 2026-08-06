import { describe, expect, it, vi } from 'vitest'
import { DialogManager } from '../dialog-manager'

function makeDialog(id: string, priority?: 'low' | 'normal' | 'high') {
  const setVisible = vi.fn()
  const cleanup = vi.fn()
  const onDestroy = vi.fn()
  return {
    config: { id, priority, setVisible, cleanup, onDestroy },
    setVisible,
    cleanup,
    onDestroy,
  }
}

describe('dialogManager', () => {
  it('keeps LIFO order for dialogs of equal priority', () => {
    const manager = new DialogManager()
    const first = makeDialog('first')
    const second = makeDialog('second')

    manager.register(first.config)
    manager.register(second.config)

    expect(manager.getVisibleDialog()?.id).toBe('second')
    expect(first.setVisible).toHaveBeenLastCalledWith(false)
    expect(second.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('lets a high-priority dialog jump ahead of the visible normal one', () => {
    const manager = new DialogManager()
    const normal = makeDialog('normal')
    const high = makeDialog('high', 'high')

    manager.register(normal.config)
    manager.register(high.config)

    expect(manager.getVisibleDialog()?.id).toBe('high')
    expect(manager.getAllDialogs().map(d => d.id)).toEqual(['normal', 'high'])
  })

  it('queues a low-priority dialog below the visible one instead of stealing focus', () => {
    const manager = new DialogManager()
    const high = makeDialog('high', 'high')
    const low = makeDialog('low', 'low')

    manager.register(high.config)
    manager.register(low.config)

    // The queued dialog must not become visible, and the incumbent must not be hidden.
    expect(manager.getVisibleDialog()?.id).toBe('high')
    expect(manager.getAllDialogs().map(d => d.id)).toEqual(['low', 'high'])
    expect(low.setVisible).not.toHaveBeenCalledWith(true)
    expect(high.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('promotes the queued dialog once the visible one unregisters', () => {
    const manager = new DialogManager()
    const high = makeDialog('high', 'high')
    const low = makeDialog('low', 'low')

    manager.register(high.config)
    manager.register(low.config)
    manager.unregister('high')

    expect(manager.getVisibleDialog()?.id).toBe('low')
    expect(low.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('runs cleanup on unregister, not only on clearAll', () => {
    const manager = new DialogManager()
    const dialog = makeDialog('only')

    manager.register(dialog.config)
    manager.unregister('only')

    expect(dialog.onDestroy).toHaveBeenCalledTimes(1)
    // clearAll() runs both hooks; unregister() must not leak what cleanup releases.
    expect(dialog.cleanup).toHaveBeenCalledTimes(1)
  })

  it('still runs both hooks on clearAll', () => {
    const manager = new DialogManager()
    const a = makeDialog('a')
    const b = makeDialog('b')

    manager.register(a.config)
    manager.register(b.config)
    manager.clearAll()

    expect(manager.getStackSize()).toBe(0)
    expect(a.cleanup).toHaveBeenCalledTimes(1)
    expect(b.cleanup).toHaveBeenCalledTimes(1)
  })
})
