import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
import { describe, expect, it } from 'vitest'
import { withDetachedErrorHooks } from './detachedErrorHooks'

/** The part of a Nitro app the Sentry plugin touches, recording what it registers. */
function fakeNitroApp() {
  const registered = new Map<string, Array<(...args: any[]) => unknown>>()
  const hooks = {
    hook(name: string, fn: (...args: any[]) => unknown) {
      registered.set(name, [...(registered.get(name) ?? []), fn])
      return () => {}
    },
  }
  return { hooks, registered, localFetch: async () => new Response(''), h3App: { handler: async () => {} } }
}

describe('withDetachedErrorHooks', () => {
  it('lets an error hook run at once without the caller waiting on what it awaits', async () => {
    const app = fakeNitroApp()
    const ran: string[] = []
    const beforeResponse = () => {}
    withDetachedErrorHooks(app, (target) => {
      target.hooks.hook('error', () => {
        ran.push('error')
        return new Promise(() => {})
      })
      target.hooks.hook('beforeResponse', beforeResponse)
    })

    const [errorHook] = app.registered.get('error')!
    expect(errorHook!(new Error('boom'), {})).toBeUndefined()
    expect(ran).toEqual(['error'])
    // Other hooks are registered as given, and registering goes back to normal afterwards.
    expect(app.registered.get('beforeResponse')).toEqual([beforeResponse])
    app.hooks.hook('error', beforeResponse)
    expect(app.registered.get('error')!.at(-1)).toBe(beforeResponse)
  })

  it('detaches the error hook @sentry/nuxt registers, which on its own returns the flush it awaits', () => {
    const plain = fakeNitroApp()
    sentryCloudflareNitroPlugin({})(plain as any)
    expect(plain.registered.get('error')).toHaveLength(1)
    const sentryHook = plain.registered.get('error')![0]!
    const pending = sentryHook(new Error('boom'), {})
    expect(pending).toBeInstanceOf(Promise)

    const detached = fakeNitroApp()
    withDetachedErrorHooks(detached, sentryCloudflareNitroPlugin({}) as any)
    expect(detached.registered.get('error')).toHaveLength(1)
    expect(detached.registered.get('error')![0]!(new Error('boom'), {})).toBeUndefined()
  })
})
