import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { useAdminQueryState } from './useAdminQueryState'

type Query = Record<string, string | string[] | undefined>

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/analytics', hash: '', query: { ...query } as Query })
  const replace = vi.fn(async (location: { path: string, query: Query }) => {
    route.query = { ...location.query }
  })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ replace }))
  return { route, replace }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const SECTIONS = ['overview', 'search', 'docs'] as const

describe('useAdminQueryState', () => {
  it('reads an allowed value and falls back for a missing or retired one', () => {
    installRoute({ section: 'search' })
    expect(useAdminQueryState('section', SECTIONS, 'overview').value).toBe('search')

    installRoute({ section: 'versions' })
    expect(useAdminQueryState('section', SECTIONS, 'overview').value).toBe('overview')

    installRoute({})
    expect(useAdminQueryState('section', SECTIONS, 'overview').value).toBe('overview')

    installRoute({ section: ['docs', 'search'] })
    expect(useAdminQueryState('section', SECTIONS, 'overview').value).toBe('docs')
  })

  it('replaces the history entry and keeps every other query key', async () => {
    const { replace, route } = installRoute({ days: '30' })
    const section = useAdminQueryState('section', SECTIONS, 'overview')

    section.value = 'docs'
    expect(replace).toHaveBeenCalledWith({ path: '/admin/analytics', query: { days: '30', section: 'docs' }, hash: '' })
    expect(section.value).toBe('docs')

    // The default panel has one address: no `?section=overview`.
    section.value = 'overview'
    expect(replace).toHaveBeenLastCalledWith({ path: '/admin/analytics', query: { days: '30' }, hash: '' })
    expect(route.query).toEqual({ days: '30' })
  })

  it('does not navigate to the address it is already at', () => {
    const { replace } = installRoute({ section: 'docs' })
    const section = useAdminQueryState('section', SECTIONS, 'overview')
    section.value = 'docs'
    expect(replace).not.toHaveBeenCalled()

    const fresh = installRoute({})
    useAdminQueryState('section', SECTIONS, 'overview').value = 'overview'
    expect(fresh.replace).not.toHaveBeenCalled()
  })
})
