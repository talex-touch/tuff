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

describe('renderer Sentry sanitizer keeps script URLs for main to normalise', async () => {
  const { sanitizeRendererSentryEvent } = await import('./sentry-renderer-sanitizer')

  it('keeps file, app and dev-server script URLs, drops bare paths and module names', () => {
    const event = sanitizeRendererSentryEvent({
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'STORAGE_SAVE_REJECTED',
            stacktrace: {
              frames: [
                {
                  filename:
                    'file:///Applications/Tuff.app/Contents/Resources/app.asar/out/renderer/assets/index-abc.js',
                  abs_path: '/Users/alice/x',
                  function: 'a'
                },
                { filename: 'app:///out/renderer/assets/index-abc.js', function: 'b' },
                {
                  filename: 'http://127.0.0.1:5173/src/views/base/home/HomePage.vue',
                  function: 'c'
                },
                { filename: '/Users/alice/Workspace/private/file.ts', function: 'd' },
                { filename: 'worker.ts', function: 'e' },
                { filename: 'https://evil.example/x.js', function: 'f' }
              ] as never
            }
          }
        ]
      }
    } as Sentry.Event)
    const value = event.exception?.values?.[0]
    expect(value?.value).toBe('STORAGE_SAVE_REJECTED')
    expect(value?.stacktrace?.frames?.map((frame) => frame.filename)).toEqual([
      'file:///Applications/Tuff.app/Contents/Resources/app.asar/out/renderer/assets/index-abc.js',
      'app:///out/renderer/assets/index-abc.js',
      'http://127.0.0.1:5173/src/views/base/home/HomePage.vue',
      undefined,
      undefined,
      undefined
    ])
    expect(value?.stacktrace?.frames?.every((frame) => frame.abs_path === undefined)).toBe(true)
  })

  it('still redacts prose exception values', () => {
    const event = sanitizeRendererSentryEvent({
      exception: { values: [{ type: 'Error', value: 'Failed to open /Users/alice/private.txt' }] }
    } as Sentry.Event)
    expect(event.exception?.values?.[0]?.value).toBe('redacted')
  })
})
