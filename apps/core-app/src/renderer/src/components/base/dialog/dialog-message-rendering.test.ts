// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { asTrustedDialogHtml } from '@talex-touch/tuffex/dialog'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TBlowDialog from './TBlowDialog.vue'
import TBottomDialog from './TBottomDialog.vue'
import TDialogMention from './TDialogMention.vue'
import TPopperDialog from './TPopperDialog.vue'
import TouchTip from './TouchTip.vue'

describe('base dialog message rendering', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders TouchTip message as text by default', () => {
    const wrapper = mount(TouchTip, {
      props: {
        title: 'Tip',
        message: '<script>alert(1)</script>\nNext',
        buttons: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.TDialogTip-Content')

    expect(content?.textContent).toBe('<script>alert(1)</script>\nNext')
    expect(content?.querySelector('script')).toBeNull()

    wrapper.unmount()
  })

  it('renders TouchTip messageHtml only through the explicit trusted prop', () => {
    const wrapper = mount(TouchTip, {
      props: {
        title: 'Tip',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        buttons: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.TDialogTip-Content')

    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')

    wrapper.unmount()
  })

  it('renders BottomDialog message as text', () => {
    const wrapper = mount(TBottomDialog, {
      props: {
        title: 'Bottom',
        message: '<img src=x onerror=alert(1)>',
        btns: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.dialog-content')

    expect(content?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(content?.querySelector('img')).toBeNull()

    wrapper.unmount()
  })

  it('renders DialogMention message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TDialogMention, {
      props: {
        title: 'Mention',
        message: '<strong>Text</strong>',
        close: vi.fn()
      },
      attachTo: document.body
    })

    let content = document.body.querySelector<HTMLElement>('.TDialogTip-Content')
    expect(content?.textContent?.trim()).toBe('<strong>Text</strong>')
    expect(content?.querySelector('strong')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TDialogMention, {
      props: {
        title: 'Mention',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        close: vi.fn()
      },
      attachTo: document.body
    })

    content = document.body.querySelector<HTMLElement>('.TDialogTip-Content')
    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })

  it('renders PopperDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TPopperDialog, {
      props: {
        title: 'Text',
        message: '<strong>Text</strong>',
        close: vi.fn()
      },
      attachTo: document.body
    })

    let content = document.body.querySelector<HTMLElement>('.TPopperDialog-Content')
    expect(content?.textContent?.trim()).toBe('<strong>Text</strong>')
    expect(content?.querySelector('strong')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TPopperDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        close: vi.fn()
      },
      attachTo: document.body
    })

    content = document.body.querySelector<HTMLElement>('.TPopperDialog-Content')
    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })

  it('renders BlowDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TBlowDialog, {
      props: {
        title: 'Text',
        message: '<em>Text</em>',
        close: vi.fn()
      },
      attachTo: document.body
    })

    let content = document.body.querySelector<HTMLElement>('.TBlowDialog-Content')
    expect(content?.textContent?.trim()).toBe('<em>Text</em>')
    expect(content?.querySelector('em')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TBlowDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<em>Trusted</em>'),
        close: vi.fn()
      },
      attachTo: document.body
    })

    content = document.body.querySelector<HTMLElement>('.TBlowDialog-Content')
    expect(content?.querySelector('em')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })
})
