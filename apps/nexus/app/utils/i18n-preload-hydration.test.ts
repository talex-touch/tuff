import { describe, expect, it, vi } from 'vitest'
import { installHydrationAwareMessageLoader } from './i18n-preload-hydration'

function createContext(preloaded: boolean) {
  const load = vi.fn<(locale: string) => Promise<unknown>>()
  const ctx = { preloaded, loadMessages: load }
  return { ctx, load }
}

describe('hydration-aware i18n message loader', () => {
  it('starts but does not await the load while hydrating a preloaded page', async () => {
    const { ctx, load } = createContext(true)
    let resolveLoad: (value: unknown) => void = () => {}
    load.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    installHydrationAwareMessageLoader({ isHydrating: true }, ctx)

    let settled = false
    const call = ctx.loadMessages('en').then(() => { settled = true })
    await Promise.resolve()

    expect(load).toHaveBeenCalledWith('en')
    expect(settled).toBe(true)
    resolveLoad(undefined)
    await call
  })

  it('awaits the load when the page was not preloaded', async () => {
    const { ctx, load } = createContext(false)
    load.mockResolvedValue('loaded')
    installHydrationAwareMessageLoader({ isHydrating: true }, ctx)

    await expect(ctx.loadMessages('en')).resolves.toBe('loaded')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('awaits the load outside hydration', async () => {
    const { ctx, load } = createContext(true)
    load.mockResolvedValue('loaded')
    installHydrationAwareMessageLoader({ isHydrating: false }, ctx)

    await expect(ctx.loadMessages('zh')).resolves.toBe('loaded')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('hands a deferred load back to the next caller instead of fetching twice', async () => {
    const { ctx, load } = createContext(true)
    load.mockResolvedValue('loaded')
    const nuxtApp = { isHydrating: true }
    installHydrationAwareMessageLoader(nuxtApp, ctx)

    await ctx.loadMessages('en')
    nuxtApp.isHydrating = false
    await expect(ctx.loadMessages('en')).resolves.toBe('loaded')
    expect(load).toHaveBeenCalledTimes(1)

    await ctx.loadMessages('en')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not let a failed deferred load reject hydration', async () => {
    const { ctx, load } = createContext(true)
    load.mockRejectedValue(new Error('offline'))
    const nuxtApp = { isHydrating: true }
    installHydrationAwareMessageLoader(nuxtApp, ctx)

    await expect(ctx.loadMessages('en')).resolves.toBeUndefined()
    nuxtApp.isHydrating = false
    await expect(ctx.loadMessages('en')).resolves.toBeUndefined()
  })
})
