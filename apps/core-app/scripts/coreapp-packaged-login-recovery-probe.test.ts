import { describe, expect, it } from 'vitest'
import {
  buildScenarioFailures,
  selectSettingsTarget,
  type DevToolsTarget,
  type LoginRecoveryDom
} from './coreapp-packaged-login-recovery-probe'

function makeTarget(id: string, url: string, title = 'Tuff'): DevToolsTarget {
  return {
    id,
    title,
    type: 'page',
    url,
    webSocketDebuggerUrl: `ws://127.0.0.1/${id}`
  }
}

function makeDom(overrides: Partial<LoginRecoveryDom> = {}): LoginRecoveryDom {
  const bodyText =
    '账户\n登录\n系统浏览器未自动打开，登录会话仍在等待。请复制登录链接到浏览器继续授权；短码：TUFF26。'
  return {
    href: 'app://tuff/#/setting',
    title: 'Tuff',
    readyState: 'complete',
    bodyText,
    dialogText: bodyText,
    manualHintText:
      '系统浏览器未自动打开，登录会话仍在等待。请复制登录链接到浏览器继续授权；短码：TUFF26。',
    loginStageText: '已打开授权页面。如页面未打开或已关闭，可以重新打开。剩余 120 秒。',
    visibleButtons: ['复制登录链接', '复制短码', '重新打开', '取消登录'],
    hasLoginRecoveryDialog: true,
    hasAuthorizeUrlCopy: true,
    hasUserCodeCopy: true,
    hasReopenAction: true,
    hasRetryAction: false,
    copyStates: {
      link: 'idle',
      code: 'idle'
    },
    ...overrides
  }
}

describe('coreapp packaged login recovery probe checks', () => {
  it('selects the Settings page over overlay targets', () => {
    const selected = selectSettingsTarget([
      {
        target: makeTarget('overlay', 'app://tuff/#/meta-overlay', 'CoreBox'),
        dom: makeDom({
          href: 'app://tuff/#/meta-overlay',
          bodyText: 'CoreBox'
        })
      },
      {
        target: makeTarget('settings', 'app://tuff/#/setting', 'Settings'),
        dom: makeDom()
      }
    ])

    expect(selected?.target.id).toBe('settings')
  })

  it('passes browser-open failure evidence with copy actions and screenshot', () => {
    expect(
      buildScenarioFailures('browser-open-failure', makeDom(), 'login-browser-open-failure.png', {
        link: 'success',
        code: 'success'
      })
    ).toEqual([])
  })

  it('requires login URL and short-code copy actions for browser-open failure evidence', () => {
    const failures = buildScenarioFailures(
      'browser-open-failure',
      makeDom({
        hasAuthorizeUrlCopy: false,
        hasUserCodeCopy: false
      }),
      'login-browser-open-failure.png'
    )

    expect(failures).toContain('Manual login URL copy action is not visible.')
    expect(failures).toContain('Short user code copy action is not visible.')
  })

  it('requires copy actions to report success when clicked', () => {
    const failures = buildScenarioFailures(
      'browser-open-failure',
      makeDom(),
      'login-browser-open-failure.png',
      {
        link: 'failed',
        code: 'missing'
      }
    )

    expect(failures).toContain('Manual login URL copy action did not report success: failed')
    expect(failures).toContain('Short user code copy action did not report success: missing')
  })

  it('passes timeout evidence when timeout and network copy are readable', () => {
    const failures = buildScenarioFailures(
      'timeout',
      makeDom({
        bodyText:
          '登录会话已超时，请重新打开浏览器登录页后重试。网络连接失败，请检查网络或代理设置。',
        dialogText: '登录会话已超时，请重新打开浏览器登录页后重试。',
        loginStageText: '登录会话已超时，请重新打开浏览器登录页后重试。',
        manualHintText: '',
        hasAuthorizeUrlCopy: false,
        hasUserCodeCopy: false,
        hasReopenAction: false,
        hasRetryAction: true,
        visibleButtons: ['重试', '关闭']
      }),
      'login-timeout-or-network-failure.png',
      {},
      '网络连接失败，请检查网络或代理设置。'
    )

    expect(failures).toEqual([])
  })

  it('fails timeout evidence when network copy or screenshot is missing', () => {
    const failures = buildScenarioFailures(
      'timeout',
      makeDom({
        bodyText: '登录会话已超时，请重新打开浏览器登录页后重试。',
        dialogText: '登录会话已超时，请重新打开浏览器登录页后重试。',
        loginStageText: '登录会话已超时，请重新打开浏览器登录页后重试。',
        hasRetryAction: true
      })
    )

    expect(failures).toContain('Network failure copy is not represented in the probe JSON.')
    expect(failures).toContain('No screenshot artifact path was provided.')
  })
})
