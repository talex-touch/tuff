import { describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/electron/renderer'

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ enabled: true, anonymous: false })),
  warn: vi.fn()
}))

vi.mock('@sentry/electron/renderer', () => ({
  init: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn()
}))

vi.mock('@talex-touch/utils/env', () => ({
  isDevEnv: () => false
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAuthState: () => ({ authState: { user: null } })
}))

vi.mock('../../utils/build-info', () => ({
  getBuildInfo: () => ({
    version: '2.4.14-beta.14',
    buildType: 'beta',
    isRelease: true
  })
}))

vi.mock('../platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({ platform: 'darwin' }),
  getCurrentRendererUserAgent: () => 'test-agent'
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: mocks.warn })
}))

import { initSentryRenderer } from './sentry-renderer'

describe('renderer Sentry privacy boundary', () => {
  it('drops breadcrumbs before ScopeToMain can persist sensitive payload previews', async () => {
    await initSentryRenderer()

    const options = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0]
    expect(
      options?.beforeBreadcrumb?.({
        category: 'console',
        data: {
          arguments: ['Save provider credential config', { payloadPreview: 'acceptance-canary' }]
        }
      })
    ).toBeNull()
  })
})
