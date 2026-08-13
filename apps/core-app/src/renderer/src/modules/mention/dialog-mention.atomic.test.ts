// @vitest-environment jsdom

/**
 * The atomic entry was removed only inside the dialog's close callback. `renderComponent` throws
 * when no app context has been captured, and that throw happens inside the promise executor — so
 * the rejected promise was still stored under `atomicKey`, and every later call with that key
 * returned the same rejection instead of showing a dialog (#834).
 *
 * The failure is permanent by construction, so a single "it rejects" assertion proves nothing. The
 * point is what the *second* call does, which is what these drive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn()
}))

vi.mock('./dialog-manager', () => ({
  useDialogManager: () => ({ register: mocks.register, unregister: mocks.unregister })
}))

vi.mock('@talex-touch/tuffex/utils', () => ({ nextZIndex: () => 1000 }))

vi.mock('~/components/base/dialog/TouchTip.vue', () => ({ default: { name: 'TouchTip' } }))
vi.mock('~/components/base/dialog/TBlowDialog.vue', () => ({ default: { name: 'TBlowDialog' } }))
vi.mock('~/components/base/dialog/TBottomDialog.vue', () => ({
  default: { name: 'TBottomDialog' }
}))
vi.mock('~/components/base/dialog/TDialogMention.vue', () => ({
  default: { name: 'TDialogMention' }
}))
vi.mock('~/components/base/dialog/TPopperDialog.vue', () => ({
  default: { name: 'TPopperDialog' }
}))

import { forTouchTip } from './dialog-mention'

/** No captureAppContext() has run, so renderComponent throws — the failure mode from the report. */
async function attempt(key: string): Promise<unknown> {
  return await forTouchTip('Title', 'Message', undefined, key).catch((error) => error)
}

describe('a dialog that never rendered does not poison its atomic key', () => {
  beforeEach(() => {
    mocks.register.mockClear()
    mocks.unregister.mockClear()
    document.body.innerHTML = ''
  })

  it('第一次尝试如实失败', async () => {
    const error = await attempt('audit-834-a')

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('No app context')
  })

  it('第二次调用会重新尝试,而不是原样吐回同一个失败的 promise', async () => {
    const first = await attempt('audit-834-b')
    const second = await attempt('audit-834-b')

    expect(first).toBeInstanceOf(Error)
    expect(second).toBeInstanceOf(Error)
    // Same message, different object: a fresh attempt rather than the cached rejection.
    expect(second).not.toBe(first)
  })

  it('失败后 DOM 里不留下宿主节点', async () => {
    await attempt('audit-834-c')
    await attempt('audit-834-c')

    expect(document.body.children).toHaveLength(0)
  })

  it('不同的 key 之间互不影响', async () => {
    const first = await attempt('audit-834-d')
    const second = await attempt('audit-834-e')

    expect(second).not.toBe(first)
  })

  it('不带 atomicKey 时同样只是失败,不做任何缓存', async () => {
    const first = await forTouchTip('Title', 'Message').catch((error) => error)
    const second = await forTouchTip('Title', 'Message').catch((error) => error)

    expect(first).toBeInstanceOf(Error)
    expect(second).not.toBe(first)
  })
})
