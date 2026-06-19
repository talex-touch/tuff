// @vitest-environment jsdom
import type { FlowTargetInfo } from '@talex-touch/utils'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import FlowSelector from './FlowSelector.vue'

const sendMock = vi.fn()

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (!params) return key
      return `${key}:${params.sender}->${params.target}`
    }
  })
}))

vi.mock('@talex-touch/tuffex/utils', () => ({
  nextZIndex: vi.fn(() => 1000)
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'variant'],
    emits: ['click'],
    template:
      '<button class="tx-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/scroll', () => ({
  TxScroll: {
    name: 'TxScroll',
    template: '<div class="tx-scroll-stub"><slot /></div>'
  }
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    template: '<span class="tx-icon-stub" />'
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn()
  })
}))

const confirmTarget: FlowTargetInfo = {
  description: 'Writes a temp file',
  fullId: 'quickops.temp-text-file',
  hasFlowHandler: true,
  icon: 'i-ri-file-text-line',
  id: 'temp-text-file',
  isEnabled: true,
  name: 'Temp Text File',
  pluginId: 'quickops',
  pluginName: 'QuickOps',
  requireConfirm: true,
  supportedTypes: ['json']
}

function createWrapper() {
  return mount(FlowSelector, {
    attachTo: document.body,
    props: {
      payload: {
        type: 'json',
        data: { text: 'hello' }
      },
      visible: false
    }
  })
}

async function showSelector(wrapper: ReturnType<typeof createWrapper>): Promise<void> {
  await wrapper.setProps({ visible: true })
  await nextTick()
  await nextTick()
}

function getTargetItem(): HTMLElement {
  const target = document.body.querySelector<HTMLElement>('.FlowTargetItem')
  expect(target).toBeTruthy()
  return target!
}

async function clickTargetItem(): Promise<void> {
  getTargetItem().click()
  await nextTick()
}

async function clickDialogButton(label: string): Promise<void> {
  const button = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('.tx-button-stub')
  ).find((candidate) => candidate.textContent?.includes(label))
  expect(button).toBeTruthy()
  button!.click()
  await nextTick()
}

describe('FlowSelector confirmation handling', () => {
  beforeEach(() => {
    sendMock.mockReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens execution confirmation instead of directly selecting requireConfirm targets', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(document.body.textContent).toContain('flow.executionConfirmationTitle')
    expect(document.body.textContent).toContain('flow.confirmOnce')
    expect(sendMock).toHaveBeenCalledWith(FlowEvents.checkConsent, {
      senderId: 'corebox',
      targetId: 'quickops.temp-text-file'
    })
  })

  it('cancels confirmation without granting token or dispatching selection', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()
    await clickDialogButton('flow.consentDeny')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(sendMock).not.toHaveBeenCalledWith(FlowEvents.grantConsent, expect.anything())
  })

  it('emits selection with confirmation token after user confirmation', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      if (event === FlowEvents.grantConsent) {
        return { success: true, data: { confirmationToken: 'confirm-token' } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()
    await clickDialogButton('flow.confirmOnce')

    expect(sendMock).toHaveBeenCalledWith(FlowEvents.grantConsent, {
      senderId: 'corebox',
      targetId: 'quickops.temp-text-file',
      mode: 'once'
    })
    expect(wrapper.emitted('select')).toEqual([
      [
        {
          confirmationToken: 'confirm-token',
          consentToken: undefined,
          targetId: 'quickops.temp-text-file'
        }
      ]
    ])
  })

  it('shows combined authorization and confirmation actions when consent is missing', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: false, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()

    expect(document.body.textContent).toContain('flow.authorizationAndConfirmationTitle')
    expect(document.body.textContent).toContain('flow.allowAndConfirmOnce')
    expect(document.body.textContent).toContain('flow.confirmAndSend')
  })
})
