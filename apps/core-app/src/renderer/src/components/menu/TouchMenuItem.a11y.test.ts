// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TouchMenuItem from './TouchMenuItem.vue'

/**
 * TouchMenuItem is the sidebar's primary navigation item and routes on click, but its root was a
 * bare div with no role, no tabindex and no key handler -- reachable only by mouse (#505).
 */

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, afterEach: () => () => {} }),
  useRoute: () => ({ path: '/elsewhere', matched: [] })
}))

function mountItem(props: Record<string, unknown> = {}) {
  return mount(TouchMenuItem, {
    props: { icon: 'i-ri-home-line', name: 'Home', route: '/home', ...props },
    global: {
      directives: { wave: {} },
      provide: { changePointer: () => {} }
    }
  })
}

describe('TouchMenuItem keyboard reachability', () => {
  it('is focusable and announces itself as a link', () => {
    const root = mountItem().get('.TouchMenuItem-Container')

    expect(root.attributes('role')).toBe('link')
    expect(root.attributes('tabindex')).toBe('0')
  })

  it('routes on Enter and on Space, not only on click', async () => {
    const wrapper = mountItem()
    const root = wrapper.get('.TouchMenuItem-Container')

    await root.trigger('keydown.enter')
    expect(push).toHaveBeenCalledWith('/home')

    push.mockClear()
    await root.trigger('keydown.space')
    expect(push).toHaveBeenCalledWith('/home')
  })

  it('marks the active item as the current page', () => {
    // `active` is computed via the doActive prop against the current route, not passed directly.
    const root = mountItem({ doActive: () => true }).get('.TouchMenuItem-Container')

    expect(root.attributes('aria-current')).toBe('page')
  })

  it('leaves aria-current off an inactive item', () => {
    // Otherwise every item would claim to be the current page, which is worse than none doing so.
    const root = mountItem({ doActive: () => false }).get('.TouchMenuItem-Container')

    expect(root.attributes('aria-current')).toBeUndefined()
  })

  it('takes a disabled item out of the tab order and says so', async () => {
    push.mockClear()
    const wrapper = mountItem({ disabled: true })
    const root = wrapper.get('.TouchMenuItem-Container')

    expect(root.attributes('tabindex')).toBe('-1')
    expect(root.attributes('aria-disabled')).toBe('true')

    // Disabled must hold for the keyboard path too, not just for click.
    await root.trigger('keydown.enter')
    expect(push).not.toHaveBeenCalled()
  })
})
