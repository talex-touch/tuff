// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AskPanel from '../../../../../../../plugins/touch-intelligence/widgets/ask-panel.vue'

vi.mock('@talex-touch/tuffex/ai-elements', () => ({
  TxAiConversation: {
    name: 'TxAiConversation',
    props: ['messages'],
    template: `
      <div data-testid="ai-conversation">
        <span
          v-for="message in messages"
          :key="message.id"
          data-testid="ai-conversation-message"
          :data-message-id="message.id"
        >{{ message.content }}</span>
      </div>
    `
  }
}))

const errorPayload = {
  requestId: 'ask-42',
  prompt: 'Summarize the support incident',
  answer: 'The provider rejected the request.',
  status: 'error',
  provider: 'nexus',
  model: 'gpt-4.1-mini',
  latency: 425,
  traceId: 'trace-42',
  capabilityId: 'text.chat',
  inputKinds: ['text'],
  errorCode: 'PROVIDER_UNAVAILABLE',
  errorMessage: 'The configured provider is unavailable.',
  errorReason: 'The configured provider rejected the request.',
  errorRecovery: 'Check the provider configuration and retry.',

  contextMode: 'continue' as const,
  contextPackage: {
    mode: 'continue' as const,
    scope: 'conversation',
    itemCount: 3,
    tokenBudget: 2_000,
    tokenEstimate: 240
  },
  selectedProviderId: 'nexus',
  selectedModel: 'gpt-4.1-mini'
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ask-panel retry action', () => {
  it('exposes retry only for an error and returns the current request context to the host', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const wrapper = mount(AskPanel, {
      props: {
        item: {},
        payload: errorPayload
      }
    })
    const retry = wrapper.get('button[aria-label="重试 AI 请求"]')

    expect(retry.element).toBeInstanceOf(HTMLButtonElement)
    expect(retry.isVisible()).toBe(true)

    await retry.trigger('click')

    const hostActions = wrapper.emitted('host-action')
    expect(hostActions).toHaveLength(1)
    expect(hostActions?.[0]).toEqual([
      expect.objectContaining({
        actionId: 'retry',
        payload: expect.objectContaining({
          prompt: 'Summarize the support incident',
          status: 'error',
          provider: 'nexus',
          model: 'gpt-4.1-mini',
          selectedProviderId: 'nexus',
          selectedModel: 'gpt-4.1-mini',
          errorCode: 'PROVIDER_UNAVAILABLE',
          errorMessage: 'The configured provider is unavailable.',
          errorReason: 'The configured provider rejected the request.',
          errorRecovery: 'Check the provider configuration and retry.',

          contextMode: 'continue',
          contextPackage: errorPayload.contextPackage
        })
      })
    ])

    for (const status of ['ready', 'idle'] as const) {
      await wrapper.setProps({
        payload: { ...errorPayload, status }
      })
      expect(wrapper.find('button[aria-label="重试 AI 请求"]').exists()).toBe(false)
    }

    wrapper.unmount()
  })

  it('renders structured error details as labelled text and hides them when absent', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const wrapper = mount(AskPanel, {
      props: {
        item: {},
        payload: {
          ...errorPayload,
          errorReason: '<b>Provider credentials were rejected.</b>',
          errorRecovery: 'Update credentials, then retry.'
        }
      }
    })
    const details = wrapper.get('[aria-label="错误详情"]')

    expect(details.isVisible()).toBe(true)
    expect(details.findAll('dt').map((label) => label.text())).toEqual(['原因', '建议'])
    expect(details.findAll('dd').map((detail) => detail.text())).toEqual([
      '<b>Provider credentials were rejected.</b>',
      'Update credentials, then retry.'
    ])
    expect(details.find('dd b').exists()).toBe(false)

    await wrapper.setProps({
      payload: {
        ...errorPayload,
        errorReason: undefined,
        errorRecovery: undefined
      }
    })
    expect(wrapper.find('[aria-label="错误详情"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders a terminal error summary only in its actionable notice', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const history = [
      {
        id: 'user-request',
        role: 'user',
        status: 'complete',
        content: 'Summarize the support incident'
      },
      {
        id: 'assistant-answer',
        role: 'assistant',
        status: 'complete',
        content: 'The incident affected only queued requests.'
      },
      {
        id: 'previous-error',
        role: 'assistant',
        status: 'error',
        content: 'A prior request timed out.'
      }
    ]
    const terminalError = {
      id: 'terminal-error',
      role: 'assistant',
      status: 'error',
      content: ` ${errorPayload.errorMessage} `
    }
    const wrapper = mount(AskPanel, {
      props: {
        item: {},
        payload: {
          ...errorPayload,
          messages: [...history, terminalError]
        }
      }
    })

    const receivedMessages = wrapper
      .getComponent({ name: 'TxAiConversation' })
      .props('messages') as Array<{ id: string }>
    expect(receivedMessages.map((message) => message.id)).toEqual(
      history.map((message) => message.id)
    )
    expect(
      wrapper.findAll('[data-testid="ai-conversation-message"]').map((message) => message.text())
    ).toEqual(history.map((message) => message.content))
    expect(wrapper.find('[data-message-id="terminal-error"]').exists()).toBe(false)
    expect(
      wrapper
        .findAll('.AiChatbot__errorNotice > span')
        .filter((message) => message.text() === errorPayload.errorMessage)
    ).toHaveLength(1)
    expect(wrapper.find('.AiChatbot__empty').exists()).toBe(false)

    const completedMessage = {
      id: 'completed-message',
      role: 'assistant',
      status: 'complete',
      content: errorPayload.errorMessage
    }
    await wrapper.setProps({
      payload: {
        ...errorPayload,
        messages: [completedMessage]
      }
    })
    expect(
      (
        wrapper.getComponent({ name: 'TxAiConversation' }).props('messages') as Array<{
          id: string
        }>
      ).map((message) => message.id)
    ).toEqual(['completed-message'])

    const readyError = {
      id: 'ready-error',
      role: 'assistant',
      status: 'error',
      content: errorPayload.errorMessage
    }
    await wrapper.setProps({
      payload: {
        ...errorPayload,
        status: 'ready',
        messages: [readyError]
      }
    })
    expect(
      (
        wrapper.getComponent({ name: 'TxAiConversation' }).props('messages') as Array<{
          id: string
        }>
      ).map((message) => message.id)
    ).toEqual(['ready-error'])
    expect(wrapper.find('.AiChatbot__errorNotice').exists()).toBe(false)

    wrapper.unmount()
  })

  it('offers distinct host-owned recovery for provider and permission failures', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const wrapper = mount(AskPanel, {
      props: {
        item: {},
        payload: errorPayload
      }
    })
    const recovery = wrapper.get('button[aria-label="打开 AI 渠道设置"]')

    expect(recovery.element).toBeInstanceOf(HTMLButtonElement)
    expect(recovery.isVisible()).toBe(true)
    expect(recovery.text()).toBe('检查 AI 渠道')
    expect(wrapper.find('button[aria-label="检查插件权限"]').exists()).toBe(false)

    await recovery.trigger('click')

    const hostActions = wrapper.emitted('host-action')
    expect(hostActions).toHaveLength(1)
    expect(hostActions?.[0]).toEqual([
      expect.objectContaining({ actionId: 'open-intelligence-settings' })
    ])

    const permissionWrapper = mount(AskPanel, {
      props: {
        item: {},
        payload: { ...errorPayload, errorCode: 'PERMISSION_DENIED' }
      }
    })
    const permissionRecovery = permissionWrapper.findAll('button[aria-label="检查插件权限"]')

    expect(permissionRecovery).toHaveLength(1)
    expect(permissionRecovery[0].element).toBeInstanceOf(HTMLButtonElement)
    expect(permissionRecovery[0].isVisible()).toBe(true)
    expect(permissionRecovery[0].text()).toBe('检查插件权限')
    expect(permissionWrapper.find('button[aria-label="打开 AI 渠道设置"]').exists()).toBe(false)

    await permissionRecovery[0].trigger('click')

    expect(permissionWrapper.emitted('host-action')).toEqual([
      [{ actionId: 'open-plugin-permissions' }]
    ])

    for (const payload of [
      { ...errorPayload, errorCode: 'MODEL_UNSUPPORTED' },
      { ...errorPayload, errorCode: 'INVALID_REQUEST' },
      { ...errorPayload, status: 'ready' },
      { ...errorPayload, status: 'idle' }
    ]) {
      await wrapper.setProps({ payload })
      expect(wrapper.find('button[aria-label="打开 AI 渠道设置"]').exists()).toBe(false)
      expect(wrapper.find('button[aria-label="检查插件权限"]').exists()).toBe(false)
    }

    wrapper.unmount()
    permissionWrapper.unmount()
  })
  it('offers an accessible cancellation action only while a request is pending and retains the live request payload', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const pendingPayload = {
      requestId: 'ask-cancel-42',
      prompt: 'Summarize the support incident',
      answer: 'The provider has accepted the request',
      status: 'chat-pending',
      provider: 'nexus',
      model: 'gpt-4.1-mini',
      traceId: 'trace-cancel-42',
      capabilityId: 'text.chat',
      inputKinds: ['text'],
      contextMode: 'continue' as const,
      contextPackage: {
        mode: 'continue' as const,
        scope: 'conversation',
        itemCount: 3
      }
    }
    const wrapper = mount(AskPanel, {
      props: { item: {}, payload: pendingPayload }
    })

    for (const status of ['ocr-pending', 'chat-pending'] as const) {
      await wrapper.setProps({ payload: { ...pendingPayload, status } })
      const stop = wrapper.get('button[aria-label="停止生成"]')
      expect(stop.element).toBeInstanceOf(HTMLButtonElement)
      expect(stop.isVisible()).toBe(true)
    }

    await wrapper.get('button[aria-label="停止生成"]').trigger('click')
    expect(wrapper.emitted('host-action')).toEqual([
      [
        expect.objectContaining({
          actionId: 'cancel-request',
          payload: expect.objectContaining({
            requestId: pendingPayload.requestId,
            prompt: pendingPayload.prompt,
            answer: pendingPayload.answer,
            provider: pendingPayload.provider,
            model: pendingPayload.model,
            contextMode: 'continue',
            contextPackage: pendingPayload.contextPackage
          })
        })
      ]
    ])

    for (const status of ['ready', 'error', 'idle'] as const) {
      await wrapper.setProps({ payload: { ...pendingPayload, status } })
      expect(wrapper.find('button[aria-label="停止生成"]').exists()).toBe(false)
    }

    wrapper.unmount()
  })

  it('keeps a cancelled partial answer actionable without presenting it as a failure', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)

    const cancelledPayload = {
      requestId: 'ask-cancelled-43',
      prompt: 'Explain the incident timeline',
      answer: 'The first incident update was delivered.',
      status: 'cancelled',
      provider: 'nexus',
      model: 'gpt-4.1-mini',
      contextMode: 'new' as const,
      messages: [
        {
          id: 'partial-answer',
          role: 'assistant',
          status: 'complete',
          content: 'The first incident update was delivered.'
        }
      ]
    }
    const wrapper = mount(AskPanel, {
      props: { item: {}, payload: cancelledPayload }
    })

    expect(wrapper.text()).toContain('已停止生成')
    expect(wrapper.find('.AiChatbot__errorNotice').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="停止生成"]').exists()).toBe(false)
    const answerActions = wrapper.findAll('.AiChatbot__answerActions button')
    expect(answerActions).toHaveLength(2)
    expect(answerActions[0].text()).toBe('复制回答')
    expect(answerActions[1].text()).toBe('替换选中文本')

    await answerActions[0].trigger('click')
    await answerActions[1].trigger('click')
    expect(wrapper.emitted('host-action')).toEqual([
      [
        expect.objectContaining({
          actionId: 'copy-answer',
          payload: expect.objectContaining({
            requestId: cancelledPayload.requestId,
            answer: cancelledPayload.answer
          })
        })
      ],
      [
        expect.objectContaining({
          actionId: 'replace-answer',
          payload: expect.objectContaining({
            requestId: cancelledPayload.requestId,
            answer: cancelledPayload.answer
          })
        })
      ]
    ])

    wrapper.unmount()
  })
})
