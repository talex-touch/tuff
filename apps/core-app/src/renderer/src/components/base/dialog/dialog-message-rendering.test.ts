// @vitest-environment jsdom
import {
  asTrustedDialogHtml,
  TxBlowDialog,
  TxBottomDialog,
  TxPopperDialog,
  TxTouchTip
} from '@talex-touch/tuffex/dialog'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TDialogMention from './TDialogMention.vue'

// The dialogs' own labels come from vue-i18n. These tests are about rendering and focus, so the
// translator answers in English instead of installing the catalogs.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'common.confirm': 'Confirm',
        'common.close': 'Close'
      })[key] ?? key
  })
}))

describe('base dialog message rendering', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders TxTouchTip message as text by default', () => {
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        message: '<script>alert(1)</script>\nNext',
        buttons: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.tx-touch-tip__content')

    expect(content?.textContent).toBe('<script>alert(1)</script>\nNext')
    expect(content?.querySelector('script')).toBeNull()

    wrapper.unmount()
  })

  it('renders TxTouchTip messageHtml only through the explicit trusted prop', () => {
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        buttons: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.tx-touch-tip__content')

    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')

    wrapper.unmount()
  })

  it('renders TxBottomDialog message as text', () => {
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Bottom',
        message: '<img src=x onerror=alert(1)>',
        btns: [],
        close: vi.fn()
      },
      attachTo: document.body
    })

    const content = document.body.querySelector<HTMLElement>('.tx-bottom-dialog__content')

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

  it('renders TxPopperDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TxPopperDialog, {
      props: {
        title: 'Text',
        message: '<strong>Text</strong>',
        close: vi.fn()
      },
      attachTo: document.body
    })

    let content = document.body.querySelector<HTMLElement>('.tx-popper-dialog__content')
    expect(content?.textContent?.trim()).toBe('<strong>Text</strong>')
    expect(content?.querySelector('strong')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TxPopperDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        close: vi.fn()
      },
      attachTo: document.body
    })

    content = document.body.querySelector<HTMLElement>('.tx-popper-dialog__content')
    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })

  it('renders TxBlowDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TxBlowDialog, {
      props: {
        title: 'Text',
        message: '<em>Text</em>',
        close: vi.fn()
      },
      attachTo: document.body
    })

    let content = document.body.querySelector<HTMLElement>('.tx-blow-dialog__content')
    expect(content?.textContent?.trim()).toBe('<em>Text</em>')
    expect(content?.querySelector('em')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TxBlowDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<em>Trusted</em>'),
        close: vi.fn()
      },
      attachTo: document.body
    })

    content = document.body.querySelector<HTMLElement>('.tx-blow-dialog__content')
    expect(content?.querySelector('em')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })
})
