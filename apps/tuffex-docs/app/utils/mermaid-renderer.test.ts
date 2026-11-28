// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initializeMock = vi.fn()
const renderMock = vi.fn(async (id: string, source: string) => ({
  svg: `<svg data-id="${id}" data-src="${source}"></svg>`,
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}))

describe('tuffex-docs mermaid-renderer', () => {
  beforeEach(() => {
    vi.resetModules()
    initializeMock.mockClear()
    renderMock.mockClear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uses securityLevel strict and re-renders existing diagrams on theme change or source reset', async () => {
    const { renderMermaidInDocument } = await import('./mermaid-renderer')

    const node = document.createElement('div')
    node.className = 'mermaid'
    node.textContent = 'graph TD; A-->B'
    document.body.appendChild(node)

    await renderMermaidInDocument(document)

    expect(initializeMock).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
    })
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(renderMock).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; A-->B')
    expect(node.getAttribute('data-processed')).toBe('true')

    // Toggling dark mode must re-initialize mermaid and re-render already-processed diagrams.
    document.documentElement.classList.add('dark')
    await renderMermaidInDocument(document)

    expect(initializeMock).toHaveBeenLastCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
    })
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(renderMock).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; A-->B')

    // Updating code clears dataset.mermaidSource and data-processed so fresh source renders.
    node.textContent = 'graph LR; X-->Y'
    delete node.dataset.mermaidSource
    node.removeAttribute('data-processed')
    await renderMermaidInDocument(document)

    expect(renderMock).toHaveBeenCalledTimes(3)
    expect(renderMock).toHaveBeenLastCalledWith(expect.any(String), 'graph LR; X-->Y')
  })
})
