// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissionRequestToast from '~/components/permission/PermissionRequestToast.vue'
// 纯函数、无模块内状态，静态引入与 vi.resetModules() 后的动态实例算出的身份一致。
import { permissionRequestIdentity } from './permission-request-card'

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

    const identity = permissionRequestIdentity('touch-intelligence', [
      'intelligence.basic',
      'search.root-results'
    ])

    const { result } = showPermissionRequestCard({
      identity,
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

  describe('coalescing duplicate permission requests', () => {
    const installMessage = '插件「touch-intelligence」请求以下权限：'

    /**
     * 组装一次提问。身份由插件 id ＋ 权限集合推导（与两个真实调用方一致），显示文案单独给：
     * 文案里只有插件显示名，两个插件可以重名，不能当身份。
     */
    const promptOptions = (
      message: string,
      pluginId: string,
      permissionIds: readonly string[] = ['intelligence.basic']
    ) => ({
      identity: permissionRequestIdentity(pluginId, permissionIds),
      title: '权限请求',
      message,
      permissions: permissionIds.map((id) => ({ id, reason: '调用智能能力完成问答' })),
      actionLabels: {
        deny: '拒绝',
        session: '仅本次允许',
        always: '始终允许'
      },
      timeoutMs: 30_000,
      t: (key: string) => key
    })

    it('asks the user once when the install confirm and the startup gate ask the same question', async () => {
      vi.useFakeTimers()
      const { showPermissionRequestCard } = await import('./permission-request-card')

      const fromInstallConfirm = showPermissionRequestCard(
        promptOptions(installMessage, 'touch-intelligence')
      )
      const fromStartupGate = showPermissionRequestCard(
        promptOptions(installMessage, 'touch-intelligence')
      )

      expect(toastState.custom).toHaveBeenCalledTimes(1)
      expect(fromStartupGate.result).toBe(fromInstallConfirm.result)

      toastState.custom.mock.calls[0][1].componentProps.actions[2].onSelect()

      await expect(fromInstallConfirm.result).resolves.toBe('always')
      await expect(fromStartupGate.result).resolves.toBe('always')
      expect(toastState.dismiss).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it('keeps another plugin question on its own card', async () => {
      vi.useFakeTimers()
      const { showPermissionRequestCard } = await import('./permission-request-card')

      const first = showPermissionRequestCard(promptOptions(installMessage, 'touch-intelligence'))
      const other = showPermissionRequestCard(
        promptOptions('插件「other-plugin」请求以下权限：', 'other-plugin')
      )

      expect(toastState.custom).toHaveBeenCalledTimes(2)

      toastState.custom.mock.calls[0][1].componentProps.actions[0].onSelect()
      toastState.custom.mock.calls[1][1].componentProps.actions[2].onSelect()

      await expect(first.result).resolves.toBe('deny')
      await expect(other.result).resolves.toBe('always')
      vi.useRealTimers()
    })

    it('asks again once the settled card is gone', async () => {
      vi.useFakeTimers()
      const { showPermissionRequestCard } = await import('./permission-request-card')

      const first = showPermissionRequestCard(promptOptions(installMessage, 'touch-intelligence'))
      const joined = showPermissionRequestCard(promptOptions(installMessage, 'touch-intelligence'))
      expect(toastState.custom).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(30_000)
      await expect(first.result).resolves.toBe('deny')

      const laterAsk = showPermissionRequestCard(
        promptOptions(installMessage, 'touch-intelligence')
      )

      expect(toastState.custom).toHaveBeenCalledTimes(2)
      expect(laterAsk.result).not.toBe(joined.result)

      toastState.custom.mock.calls[1][1].componentProps.actions[1].onSelect()
      await expect(laterAsk.result).resolves.toBe('session')
      await expect(joined.result).resolves.toBe('deny')
      vi.useRealTimers()
    })

    // 回归：显示文案一模一样（同插件显示名），但身份不同 —— 另一个插件，或同一插件的另一套权限。
    // 把请求键退回文案时，第二个调用方会读到用户为**别的插件/别的权限**做出的答复，而答复要拿去给
    // request.pluginId 放行。
    it.each([
      { cause: '另一个插件', pluginId: 'other-plugin', permissionIds: ['intelligence.basic'] },
      {
        cause: '同一插件的另一套权限',
        pluginId: 'touch-intelligence',
        permissionIds: ['search.root-results']
      }
    ])(
      'keeps a decision made about $cause out of the hands of a later caller with identical text',
      async ({ pluginId, permissionIds }) => {
        vi.useFakeTimers()
        const { showPermissionRequestCard } = await import('./permission-request-card')

        const first = showPermissionRequestCard(promptOptions(installMessage, 'touch-intelligence'))
        const later = showPermissionRequestCard(
          promptOptions(installMessage, pluginId, permissionIds)
        )

        // 文案相同也必须开出第二张卡，且两个调用方各拿各的答复
        expect(toastState.custom).toHaveBeenCalledTimes(2)
        expect(later.result).not.toBe(first.result)

        toastState.custom.mock.calls[0][1].componentProps.actions[0].onSelect()
        await expect(first.result).resolves.toBe('deny')

        // 后来者的卡还开着，没有被别人的答复结算掉
        expect(toastState.custom).toHaveBeenCalledTimes(2)
        expect(toastState.dismiss).toHaveBeenCalledTimes(1)

        toastState.custom.mock.calls[1][1].componentProps.actions[2].onSelect()
        await expect(later.result).resolves.toBe('always')
        expect(toastState.dismiss).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
      }
    )
  })

  describe('permissionRequestIdentity', () => {
    it('为同一套权限给出同一个身份，与顺序和重复无关', () => {
      const canonical = permissionRequestIdentity('touch-intelligence', [
        'intelligence.basic',
        'search.root-results'
      ])
      const reordered = permissionRequestIdentity('touch-intelligence', [
        'search.root-results',
        'intelligence.basic'
      ])
      const withDuplicate = permissionRequestIdentity('touch-intelligence', [
        'intelligence.basic',
        'search.root-results',
        'intelligence.basic'
      ])

      expect(reordered).toBe(canonical)
      expect(withDuplicate).toBe(canonical)
    })

    it('区分不同插件与不同权限集合', () => {
      const base = permissionRequestIdentity('touch-intelligence', ['intelligence.basic'])
      const otherPlugin = permissionRequestIdentity('other-plugin', ['intelligence.basic'])
      const otherSet = permissionRequestIdentity('touch-intelligence', ['search.root-results'])
      const widerSet = permissionRequestIdentity('touch-intelligence', [
        'intelligence.basic',
        'search.root-results'
      ])

      expect(otherPlugin).not.toBe(base)
      expect(otherSet).not.toBe(base)
      expect(widerSet).not.toBe(base)
    })
  })
})
