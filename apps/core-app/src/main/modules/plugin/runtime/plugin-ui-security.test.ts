import { beforeEach, describe, expect, it, vi } from 'vitest'

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn()
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({
      warn: warnMock
    })
  })
}))

import {
  __resetLegacyPluginUiWarningsForTest,
  createLegacyPluginViewWebPreferences,
  createLegacyPluginWebviewAttrs,
  warnLegacyPluginUiMode
} from './plugin-ui-security'

describe('plugin-ui-security', () => {
  beforeEach(() => {
    warnMock.mockClear()
    __resetLegacyPluginUiWarningsForTest()
  })

  it('keeps legacy plugin ui flags centralized and disables subframe node integration', () => {
    expect(createLegacyPluginViewWebPreferences('/tmp/plugin-preload.js')).toMatchObject({
      preload: '/tmp/plugin-preload.js',
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true
    })

    expect(createLegacyPluginWebviewAttrs('TalexTouch/Test')).toEqual({
      enableRemoteModule: 'false',
      nodeintegration: 'true',
      webpreferences: 'contextIsolation=false',
      websecurity: 'false',
      useragent: 'TalexTouch/Test'
    })
  })

  it('warns once per plugin and surface source', () => {
    warnLegacyPluginUiMode('touch-translation', 'plugin:webview')
    warnLegacyPluginUiMode('touch-translation', 'plugin:webview')
    warnLegacyPluginUiMode('touch-translation', 'core-box:attachUIView')

    expect(warnMock).toHaveBeenCalledTimes(2)
    expect(warnMock.mock.calls[0]?.[0]).toContain('touch-translation')
    expect(warnMock.mock.calls[1]?.[1]).toMatchObject({
      meta: {
        source: 'core-box:attachUIView'
      }
    })
  })
})
