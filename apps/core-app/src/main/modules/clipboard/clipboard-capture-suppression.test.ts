/**
 * Selection capture sends a real Cmd/Ctrl+C and then restores the previous clipboard. The native
 * watcher cannot tell those writes from a user copy, so the selected text was persisted to
 * clipboard_history and the restore added a duplicate row (#769).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isClipboardCaptureSuppressed,
  resetClipboardCaptureSuppression,
  withClipboardCaptureSuppressed
} from './clipboard-capture-suppression'

afterEach(() => {
  resetClipboardCaptureSuppression()
  vi.useRealTimers()
})

describe('clipboard capture suppression', () => {
  it('默认不抑制', () => {
    expect(isClipboardCaptureSuppressed()).toBe(false)
  })

  it('作用域内抑制,退出后恢复', async () => {
    let insideScope = false

    await withClipboardCaptureSuppressed(async () => {
      insideScope = isClipboardCaptureSuppressed()
    })

    expect(insideScope).toBe(true)
    expect(isClipboardCaptureSuppressed()).toBe(false)
  })

  it('任务抛错也会恢复,不会永久抑制', async () => {
    await expect(
      withClipboardCaptureSuppressed(async () => {
        throw new Error('copy failed')
      })
    ).rejects.toThrow('copy failed')

    expect(isClipboardCaptureSuppressed()).toBe(false)
  })

  it('嵌套作用域:内层结束不会提前解除抑制', async () => {
    let afterInner = false

    await withClipboardCaptureSuppressed(async () => {
      await withClipboardCaptureSuppressed(async () => {})
      afterInner = isClipboardCaptureSuppressed()
    })

    expect(afterInner).toBe(true)
    expect(isClipboardCaptureSuppressed()).toBe(false)
  })

  it('超过上限后自行过期,卡住的作用域不会静默吞掉后续复制', async () => {
    const start = Date.now()
    let stillSuppressedLater = true

    await withClipboardCaptureSuppressed(async () => {
      // A scope that outlives its budget: a hung shortcut, or a crash before the finally runs.
      stillSuppressedLater = isClipboardCaptureSuppressed(start + 5_001)
    })

    expect(stillSuppressedLater).toBe(false)
  })
})
