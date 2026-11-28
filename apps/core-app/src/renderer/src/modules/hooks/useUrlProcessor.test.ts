// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(async () => undefined),
  confirmExternalLinkOpen: vi.fn(async () => true)
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({
    openExternal: mocks.openExternal
  })
}))

vi.mock('./confirm-external-link', () => ({
  confirmExternalLinkOpen: mocks.confirmExternalLinkOpen
}))

import { useUrlProcessor } from './useUrlProcessor'

describe('useUrlProcessor', () => {
  let dispose: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.replaceChildren()
  })

  afterEach(() => {
    dispose?.()
    dispose = null
    document.body.replaceChildren()
  })

  it('confirms and opens valid http(s) external links including clicks on nested anchor children', async () => {
    dispose = await useUrlProcessor()

    const anchor = document.createElement('a')
    anchor.href = 'https://example.com/docs'
    const span = document.createElement('span')
    span.textContent = 'Docs'
    anchor.appendChild(span)
    document.body.appendChild(anchor)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    span.dispatchEvent(click)
    await Promise.resolve()
    await Promise.resolve()

    expect(click.defaultPrevented).toBe(true)
    expect(mocks.confirmExternalLinkOpen).toHaveBeenCalledWith('https://example.com/docs')
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('blocks non-http(s) external protocols and skips fragment / same-origin links', async () => {
    dispose = await useUrlProcessor()

    const badLink = document.createElement('a')
    badLink.setAttribute('href', 'file:///etc/passwd')
    const hashLink = document.createElement('a')
    hashLink.setAttribute('href', '#section-1')
    document.body.append(badLink, hashLink)

    const badClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    badLink.dispatchEvent(badClick)
    const hashClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    hashLink.dispatchEvent(hashClick)
    await Promise.resolve()

    expect(badClick.defaultPrevented).toBe(true)
    expect(hashClick.defaultPrevented).toBe(false)
    expect(mocks.confirmExternalLinkOpen).not.toHaveBeenCalled()
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('intercepts protocol-relative external links (//evil.com and /\\evil.com) instead of treating them as same-origin', async () => {
    dispose = await useUrlProcessor()

    for (const rawHref of ['//evil.com/phish', '/\\evil.com/phish']) {
      mocks.confirmExternalLinkOpen.mockClear()
      mocks.openExternal.mockClear()
      const link = document.createElement('a')
      link.setAttribute('href', rawHref)
      document.body.appendChild(link)

      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(click)
      await Promise.resolve()
      await Promise.resolve()

      expect(click.defaultPrevented).toBe(true)
      expect(mocks.confirmExternalLinkOpen).toHaveBeenCalledWith('http://evil.com/phish')
      expect(mocks.openExternal).toHaveBeenCalledWith('http://evil.com/phish')
    }
  })

  it('stops intercepting clicks after the returned disposer is called', async () => {
    dispose = await useUrlProcessor()
    dispose()
    dispose = null

    const anchor = document.createElement('a')
    anchor.href = 'https://example.com/after-dispose'
    document.body.appendChild(anchor)

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(click)
    await Promise.resolve()

    expect(click.defaultPrevented).toBe(false)
    expect(mocks.confirmExternalLinkOpen).not.toHaveBeenCalled()
  })
})
