// @vitest-environment jsdom

import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

/**
 * 组件在点击时读 `router.currentRoute.value.path`（而不是 setup 时读一次），所以路由状态必须能在挂载
 * 之后被改写；`push` 同时改写它，让「导航到 /home」是一个可观察的落点，而不只是一次调用记录。
 */
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  currentRoute: { value: { path: '/settings' } as { path: string } }
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock
}))

vi.mock('vue-i18n', () => ({
  // key 即文案：断言针对行为，不针对翻译措辞。
  useI18n: () => ({ t: (key: string) => key })
}))

// 平台探测会走 preload/electron 边界；这里只关心 macOS 上的徽章文案。
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: ref(true) })
}))

import ShellBackRow from './ShellBackRow.vue'
import {
  closeMainWindowPalette,
  installMainWindowShortcutCapture,
  mainWindowCommands,
  toggleMainWindowPalette
} from '~/modules/shortcuts/main-window-shortcuts'

/**
 * 设置页的返回行占着两件事：它是回到应用本体的出口，也是 `⌘[` 这条命令在窗口里仅有的注册者。
 *
 * 值得钉住的回归都是「面板和徽章会照着这份注册说话」的那类：行还在却没人注册命令（面板不再提供
 * `⌘[`，快捷键失效）、行已卸载命令却还挂着（面板在设置页之外教一个按下没有反应的键）、目录里的
 * chord 被改掉（徽章和按键漂移）、或者命令被注册成一个不导航的处理器（按下、点击都没反应）。
 */

// 让被 mock 的路由真的落点：断言读的是路由停在哪，而不是「某个函数被调用过」。
routerMock.push.mockImplementation((to: string) => {
  routerMock.currentRoute.value = { path: to }
})

let wrapper: VueWrapper | null = null
let disposeCapture: (() => void) | null = null

function mountRow(): VueWrapper {
  wrapper = mount(ShellBackRow)
  return wrapper
}

function unmountRow(): void {
  wrapper?.unmount()
  wrapper = null
}

/** 捕获层就是真实宿主：⌘ 的按下/松开只有经过它才会传到这里。 */
function installCapture(): void {
  disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })
}

/** 键盘走到捕获层的唯一入口：事件必须落在 window 上，才和真实宿主同路。 */
function press(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', init))
}

/** Transition 的插入/移除发生在下一帧，多等一帧才看得到 DOM 的最终形态。 */
async function settle(): Promise<void> {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await nextTick()
}

function hintBadge(target: VueWrapper): DOMWrapper<Element> | null {
  const badge = target.find('.MetaHintBadge-Key')
  return badge.exists() ? badge : null
}

afterEach(() => {
  unmountRow()
  disposeCapture?.()
  disposeCapture = null
  closeMainWindowPalette()
  routerMock.push.mockClear()
  routerMock.currentRoute.value = { path: '/settings' }
})

describe('shellBackRow command registration', () => {
  it('offers the command only while the row is on screen', async () => {
    // 目录里有 id、窗口里没有 handler 时，面板不能提供它——否则会在设置页之外教一个按下去没反应的
    // 快捷键。所以这个 id 的出现与消失必须严格跟着这一行的挂载与卸载走。
    const beforeMount = mainWindowCommands.value.map((command) => command.id)

    mountRow()
    const whileMounted = mainWindowCommands.value.map((command) => command.id)

    unmountRow()
    const afterUnmount = mainWindowCommands.value.map((command) => command.id)

    expect(beforeMount).not.toContain('back-to-tuff')
    expect(whileMounted).toContain('back-to-tuff')
    expect(afterUnmount).not.toContain('back-to-tuff')
  })

  it('navigates to /home when the row is clicked', async () => {
    const target = mountRow()

    await target.find('button.ShellBackRow').trigger('click')
    await flushPromises()

    expect(routerMock.currentRoute.value.path).toBe('/home')
  })

  it('does not navigate again when the settings are already left behind', async () => {
    // 已经在 `/home` 时再 push 一次是空导航：历史里多一条没有内容的记录，返回键就多按一下。
    routerMock.currentRoute.value = { path: '/home' }
    const target = mountRow()

    await target.find('button.ShellBackRow').trigger('click')
    await flushPromises()

    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('runs the row’s command from the catalog’s chord', async () => {
    // 目录里的 chord、注册的 handler、捕获层三处必须对上：任何一处漂移，⌘[ 就变成一次静默无效的按键。
    mountRow()
    installCapture()

    press({ key: '[', code: 'BracketLeft', metaKey: true })
    await flushPromises()

    expect(routerMock.currentRoute.value.path).toBe('/home')
  })
})

describe('shellBackRow hint badge', () => {
  it('draws the catalog chord while the command key is held, and only then', async () => {
    const target = mountRow()
    installCapture()

    expect(hintBadge(target)).toBeNull()

    press({ key: 'Meta' })
    await settle()
    // 徽章上的键必须与真正生效的键是同一个：文字写死就会和目录里的 chord 各说各话。
    expect(hintBadge(target)?.text()).toBe('⌘[')

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    await settle()
    expect(hintBadge(target)).toBeNull()
  })

  it('hides the hint while the command window is open', async () => {
    // 命令窗口的每一行已经写着自己的键，再叠一层徽章就是噪音；而且窗口打开时 ⌘ 仍然是按着的。
    const target = mountRow()
    installCapture()

    press({ key: 'Meta' })
    await settle()
    expect(hintBadge(target)).not.toBeNull()

    toggleMainWindowPalette()
    await settle()
    expect(hintBadge(target)).toBeNull()
  })
})
