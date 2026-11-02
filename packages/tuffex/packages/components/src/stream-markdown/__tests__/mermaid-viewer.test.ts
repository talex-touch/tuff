import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import TxMermaidBlock from '../src/TxMermaidBlock.vue'
import TxStreamMarkdown from '../src/TxStreamMarkdown.vue'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 10 10"></svg>' })),
  },
}))

const renderMock = vi.mocked(mermaid.render)

let oldClipboard: PropertyDescriptor | undefined
let clipboardWrite: ReturnType<typeof vi.fn>

beforeEach(() => {
  renderMock.mockReset()
  renderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"></svg>' })
  clipboardWrite = vi.fn().mockResolvedValue(undefined)
  oldClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } })
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
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  if (oldClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', oldClipboard)
  else Reflect.deleteProperty(Navigator.prototype, 'clipboard')
})

async function openViewer(code = 'graph TD; A-->B', props: Record<string, unknown> = {}) {
  const wrapper = mount(TxMermaidBlock, {
    props: { code, closed: true, ...props },
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.find('.tx-mermaid-block__figure').trigger('click')
  await flushPromises()
  return wrapper
}

describe('txMermaidBlock zoom viewer', () => {
  it('offers rotate, copy, and download actions and copies the source rather than rendered SVG', async () => {
    const source = 'graph TD; A-->B'
    await openViewer(source, { copyLabel: 'Copy source', downloadLabel: 'Save SVG' })
    const dialog = document.body.querySelector<HTMLElement>('.tx-image-preview[role="dialog"]')!
    const copy = dialog.querySelector<HTMLButtonElement>('button[aria-label="Copy source"]')!
    const download = dialog.querySelector<HTMLButtonElement>('button[aria-label="Save SVG"]')!
    const rotate = dialog.querySelector<HTMLButtonElement>('button[aria-label="Rotate"]')!
    expect(copy).toBeTruthy()
    expect(download).toBeTruthy()
    expect(rotate).toBeTruthy()

    await copy.click()
    await flushPromises()
    expect(clipboardWrite).toHaveBeenCalledWith(source)
    expect(clipboardWrite).not.toHaveBeenCalledWith('<svg viewBox="0 0 10 10"></svg>')
    // Negative control: changing `copyText: props.code` to `copyText: svg.value` makes this source assertion red.
  })

  it('uses the forwarded markdown labels in a real mermaid fence viewer', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: {
        content: '```mermaid\ngraph TD; A-->B\n```',
        sanitize: false,
        diagramZoomLabel: 'Open chart',
        diagramPreviewLabel: 'Chart viewer',
        diagramCloseLabel: 'Close chart',
        diagramDownloadLabel: 'Save chart',
        diagramCopyFailedText: 'Chart copy failed',
      },
      attachTo: document.body,
    })
    await flushPromises()
    const figure = wrapper.find('button.tx-mermaid-block__figure')
    expect(figure.attributes('aria-label')).toBe('Open chart')
    await figure.trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector<HTMLElement>('.tx-image-preview[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toContain('Chart viewer')
    expect(dialog.querySelector('button[aria-label="Save chart"]')).toBeTruthy()

    clipboardWrite.mockRejectedValueOnce(new Error('denied'))
    await document.body.querySelector<HTMLButtonElement>('button[aria-label="Copy image"], button[aria-label="Copy"]')!.click()
    await flushPromises()
    // Negative control: removing `diagramCopyFailedText` from builtInCopy makes the rejection status use the wrong wording.
    expect(document.body.querySelector('.tx-image-preview__status-text')?.textContent).toBe('Chart copy failed')
    wrapper.unmount()
  })
})
