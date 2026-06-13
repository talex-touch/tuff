// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissionRequestToast from '~/components/permission/PermissionRequestToast.vue'

const toastState = vi.hoisted(() => ({
  custom: vi.fn(),
  dismiss: vi.fn()
}))

vi.mock('vue-sonner', () => ({
  toast: toastState
}))

describe('permission request card', () => {
  beforeEach(() => {
    vi.resetModules()
    toastState.custom.mockReset()
    toastState.dismiss.mockReset()
    toastState.custom.mockReturnValue('toast-id')
  })

  it('renders the dark permission request layout and action order', async () => {
    const actions = [
      { label: '拒绝', tone: 'danger' as const, onSelect: vi.fn() },
      { label: '仅本次允许', tone: 'neutral' as const, onSelect: vi.fn() },
      { label: '始终允许', tone: 'primary' as const, onSelect: vi.fn() }
    ]

    const wrapper = mount(PermissionRequestToast, {
      props: {
        title: '权限请求',
        message: '插件「touch-intelligence」请求以下权限：',
        permissions: [
          {
            id: 'intelligence.basic',
            name: '基础 Intelligence',
            reason: '调用智能能力完成问答'
          },
          {
            id: 'search.root-results',
            name: '推送根搜索结果',
            reason: '将智能问答入口与回答状态推送到 CoreBox 根搜索结果'
          }
        ],
        timeoutText: '⏱ 如无操作，将在 30 秒后自动拒绝',
        actions
      }
    })

    expect(wrapper.get('.PermissionRequestToast-Title').text()).toBe('权限请求')
    expect(wrapper.text()).toContain('基础 Intelligence：调用智能能力完成问答')
    expect(wrapper.text()).toContain(
      '推送根搜索结果：将智能问答入口与回答状态推送到 CoreBox 根搜索结果'
    )

    const buttons = wrapper.findAll('button.PermissionRequestToast-Action')
    expect(buttons.map((button) => button.text())).toEqual(['拒绝', '仅本次允许', '始终允许'])
    expect(buttons[0].classes()).toContain('PermissionRequestToast-Action--danger')
    expect(buttons[1].classes()).toContain('PermissionRequestToast-Action--neutral')
    expect(buttons[2].classes()).toContain('PermissionRequestToast-Action--primary')

    await buttons[1].trigger('click')
    expect(actions[1].onSelect).toHaveBeenCalledTimes(1)
  })

  it('formats permission names through i18n and resolves the selected decision', async () => {
    vi.useFakeTimers()
    const { showPermissionRequestCard } = await import('./permission-request-card')
    const translations: Record<string, string> = {
      'plugin.permissions.registry.intelligence.basic.name': '基础 Intelligence'
    }

    const { result } = showPermissionRequestCard({
      title: '权限请求',
      message: '插件「touch-intelligence」请求以下权限：',
      permissions: [
        {
          id: 'intelligence.basic',
          reason: '调用智能能力完成问答'
        },
        {
          id: 'search.root-results'
        }
      ],
      actionLabels: {
        deny: '拒绝',
        session: '仅本次允许',
        always: '始终允许'
      },
      timeoutMs: 30_000,
      t: (key: string) => translations[key] ?? key
    })

    const customCall = toastState.custom.mock.calls[0]
    expect(customCall[1].componentProps.permissions).toEqual([
      {
        id: 'intelligence.basic',
        name: '基础 Intelligence',
        reason: '调用智能能力完成问答'
      },
      {
        id: 'search.root-results',
        name: 'search.root-results',
        reason: undefined
      }
    ])

    customCall[1].componentProps.actions[2].onSelect()
    await expect(result).resolves.toBe('always')
    expect(toastState.dismiss).toHaveBeenCalledWith('toast-id')
    vi.runAllTimers()
    expect(toastState.dismiss).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
