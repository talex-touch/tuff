/**
 * MetaOverlay built a WebContentsView with no navigation guards at all, and
 * plugin-view-controller / division-box only installed the plugin policy when a plugin was
 * present - with no plugin the view ran the app profile with no window-open handler and no
 * navigation restriction (#793).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  installAppViewNavigationPolicy,
  isAppViewNavigationAllowed
} from './app-view-navigation-policy'

const devEntry = { entryUrl: 'http://localhost:5173/index.html' }
const packagedEntry = { entryUrl: 'file:///Applications/Tuff.app/renderer/index.html' }

describe('isAppViewNavigationAllowed', () => {
  it('允许应用自身入口', () => {
    expect(isAppViewNavigationAllowed(devEntry, 'http://localhost:5173/index.html')).toBe(true)
    expect(
      isAppViewNavigationAllowed(packagedEntry, 'file:///Applications/Tuff.app/renderer/index.html')
    ).toBe(true)
  })

  it('允许同文档的 hash 路由(渲染层就是这么导航的)', () => {
    // The overlay loads `...index.html#/meta-overlay`; treating that as navigation would break
    // the very views this protects.
    expect(
      isAppViewNavigationAllowed(devEntry, 'http://localhost:5173/index.html#/meta-overlay')
    ).toBe(true)
    expect(
      isAppViewNavigationAllowed(
        packagedEntry,
        'file:///Applications/Tuff.app/renderer/index.html#/meta-overlay'
      )
    ).toBe(true)
  })

  it('拒绝外部站点', () => {
    expect(isAppViewNavigationAllowed(devEntry, 'https://evil.example/')).toBe(false)
    expect(isAppViewNavigationAllowed(packagedEntry, 'https://evil.example/')).toBe(false)
  })

  it('拒绝磁盘上的其它文件(file: 的 origin 都是 null,只有路径能区分)', () => {
    expect(isAppViewNavigationAllowed(packagedEntry, 'file:///Users/someone/.ssh/id_rsa')).toBe(
      false
    )
    expect(
      isAppViewNavigationAllowed(packagedEntry, 'file:///Applications/Tuff.app/renderer/other.html')
    ).toBe(false)
  })

  it('拒绝无法解析的目标', () => {
    expect(isAppViewNavigationAllowed(devEntry, 'not a url')).toBe(false)
    expect(isAppViewNavigationAllowed(devEntry, '')).toBe(false)
  })
})

describe('installAppViewNavigationPolicy', () => {
  function fakeWebContents() {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    return {
      handlers,
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        handlers.set(event, listener)
      }),
      setWindowOpenHandler: vi.fn()
    }
  }

  it('拒绝一切 window.open', () => {
    const wc = fakeWebContents()

    installAppViewNavigationPolicy(wc as never, devEntry)

    expect(wc.setWindowOpenHandler).toHaveBeenCalledTimes(1)
    const handler = wc.setWindowOpenHandler.mock.calls[0]?.[0] as () => { action: string }
    expect(handler()).toEqual({ action: 'deny' })
  })

  it('阻止导航到外部地址,放行自身入口', () => {
    const wc = fakeWebContents()
    installAppViewNavigationPolicy(wc as never, devEntry)
    const willNavigate = wc.handlers.get('will-navigate')!

    const blocked = { preventDefault: vi.fn() }
    willNavigate(blocked as never, 'https://evil.example/')
    expect(blocked.preventDefault).toHaveBeenCalled()

    const allowed = { preventDefault: vi.fn() }
    willNavigate(allowed as never, 'http://localhost:5173/index.html#/meta-overlay')
    expect(allowed.preventDefault).not.toHaveBeenCalled()
  })

  it('阻止 webview 附加', () => {
    const wc = fakeWebContents()
    installAppViewNavigationPolicy(wc as never, devEntry)

    const event = { preventDefault: vi.fn() }
    wc.handlers.get('will-attach-webview')!(event as never)
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
