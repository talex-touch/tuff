import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImagePreviewItem } from '../src/types'
import TxImagePreview from '../src/TxImagePreview.vue'

let clipboardWrite: ReturnType<typeof vi.fn>
let oldClipboard: PropertyDescriptor | undefined
let oldShare: PropertyDescriptor | undefined
let oldCreateUrl: PropertyDescriptor | undefined
let oldRevokeUrl: PropertyDescriptor | undefined

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__stage') ? 1000 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__stage') ? 800 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 600 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 400 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 200 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () {
    return this.classList.contains('tx-image-preview__fit') ? 150 : 0
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))

  clipboardWrite = vi.fn().mockResolvedValue(undefined)
  oldClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } })
  oldShare = Object.getOwnPropertyDescriptor(Navigator.prototype, 'share')
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
  oldCreateUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  oldRevokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:markup') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
  if (oldClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', oldClipboard)
  else Reflect.deleteProperty(Navigator.prototype, 'clipboard')
  if (oldShare) Object.defineProperty(Navigator.prototype, 'share', oldShare)
  else Reflect.deleteProperty(Navigator.prototype, 'share')
  if (oldCreateUrl) Object.defineProperty(URL, 'createObjectURL', oldCreateUrl)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (oldRevokeUrl) Object.defineProperty(URL, 'revokeObjectURL', oldRevokeUrl)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

const shown = () => document.body.querySelector<HTMLElement>('.tx-image-preview__slide:not([aria-hidden])')!
const action = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

async function open(item: ImagePreviewItem, extra: Record<string, unknown> = {}) {
  const wrapper = mount(TxImagePreview, {
    props: { open: true, items: [item], actions: ['copy', 'share', 'download'], ...extra },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('txImagePreview markup actions', () => {
  it.each([
    { name: 'svg', item: { type: 'custom' as const, svg: '<svg><text>A</text></svg>', name: 'A' } },
    { name: 'raw', item: { type: 'custom' as const, raw: '<svg><text>B</text></svg>', name: 'B' } },
  ])('enables copy and download for URL-less custom $name markup while keeping share disabled', async ({ item }) => {
    await open(item)
    expect(action('Copy image').getAttribute('aria-disabled')).toBe(null)
    expect(action('Download').getAttribute('aria-disabled')).toBe(null)
    expect(action('Share').getAttribute('aria-disabled')).toBe('true')
    // Negative control: restoring the old `item.type !== 'custom'`/URL-only guard disables these actions.
    expect(shown().querySelector('.tx-image-preview__status-text')).toBeNull()
  })

  it('copies copyText first and announces success, then reports a rejected clipboard', async () => {
    const item = { type: 'custom' as const, svg: '<svg>markup</svg>', raw: '<svg>raw</svg>', copyText: 'source text' }
    const wrapper = await open(item, { copiedText: 'Copied source', copyFailedText: 'Copy denied' })
    await action('Copy image').click()
    await flushPromises()
    expect(clipboardWrite).toHaveBeenCalledWith('source text')
    expect(document.body.querySelector('.tx-image-preview__status-text')?.textContent).toBe('Copied source')

    clipboardWrite.mockRejectedValueOnce(new Error('denied'))
    await action('Copy image').click()
    await flushPromises()
    // Negative control: breaking `markupOf(item, 'copy')` or the rejection branch loses the source/error contract.
    expect(clipboardWrite).toHaveBeenLastCalledWith('source text')
    expect(document.body.querySelector('.tx-image-preview__status-text')?.textContent).toBe('Copy denied')
    wrapper.unmount()
  })

  it.each([
    { name: 'svg', item: { type: 'custom' as const, svg: '<svg>svg-first</svg>' }, expected: '<svg>svg-first</svg>' },
    { name: 'raw', item: { type: 'custom' as const, raw: '<svg>raw-fallback</svg>' }, expected: '<svg>raw-fallback</svg>' },
  ])('copies the $name fallback markup when copyText is absent', async ({ item, expected }) => {
    await open(item)
    await action('Copy image').click()
    await flushPromises()
    // Negative control: changing `markupOf`'s svg/raw ladder sends empty text instead of the markup.
    expect(clipboardWrite).toHaveBeenCalledWith(expected)
  })

  it('falls back from svg to raw for copy and host preventDefault suppresses built-in copy', async () => {
    const item = { type: 'custom' as const, raw: '<svg>raw-only</svg>' }
    const prevented = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    await open(item, { onAction: prevented })
    await action('Copy image').click()
    await flushPromises()
    expect(prevented).toHaveBeenCalled()
    // Negative control: removing the `if (prevented) return` branch writes to the clipboard anyway.
    expect(clipboardWrite).not.toHaveBeenCalled()
  })

  it('downloads markup as an SVG Blob URL, clicks a named link, and revokes the URL', async () => {
    const item = { type: 'custom' as const, svg: '<svg viewBox="0 0 1 1" />', name: 'Chart' }
    await open(item)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.useFakeTimers()
    await action('Download').click()
    vi.runAllTimers()
    await flushPromises()

    const create = URL.createObjectURL as ReturnType<typeof vi.fn>
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>
    expect(create).toHaveBeenCalledTimes(1)
    const blob = create.mock.calls[0]![0] as Blob
    expect(blob.size).toBe(new Blob([item.svg], { type: 'image/svg+xml' }).size)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:markup')
    // Negative control: removing `downloadMarkup`'s click/revoke pair leaves a Blob but no usable save.
    expect(action('Download').getAttribute('aria-disabled')).toBe(null)
  })

  it('keeps copy and download disabled when a custom item has no URL or markup', async () => {
    await open({ type: 'custom', name: 'Empty' })
    expect(action('Copy image').getAttribute('aria-disabled')).toBe('true')
    expect(action('Download').getAttribute('aria-disabled')).toBe('true')
    // Negative control: changing `markupOf` to return a non-empty fallback would enable both buttons.
  })
})
