import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./intelligence.vue', import.meta.url), 'utf8')

describe('dashboard intelligence admin page contract', () => {
  it('uses the generated lazy admin panel component name', () => {
    expect(page).toContain('<LazyDashboardIntelligenceAdminPanel />')
    expect(page).not.toContain('LazyDashboardIntelligenceIntelligenceAdminPanel')
  })

  // ClientOnly renders a fragment. As the page root that made Nuxt warn the page
  // "does not have a single root node and will cause errors when navigating between
  // routes", and left the declared fade pageTransition with nothing to animate.
  it('wraps ClientOnly in a single element root so the page transition can animate', () => {
    const template = page.slice(page.indexOf('<template>'))
    const firstTag = template.match(/<(\w[\w-]*)/g)?.[1]
    expect(firstTag).toBe('<div')
    expect(page).toContain('<ClientOnly>')
  })
})

describe('retired intelligence admin routes', () => {
  const retired = ['intelligence-agent.vue', 'intelligence-lab.vue']

  // The pages forward to the live console; the 410 API contract lives in
  // test/api/admin/intelligence-compat-retired.api.test.ts and is deliberately
  // untouched by this. A top-level createError(410) here produced a white screen.
  it.each(retired)('%s forwards to the live console instead of throwing', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')

    expect(source).toContain("redirect: '/dashboard/admin/intelligence'")
    expect(source).not.toContain('createError')
  })

  // `await navigateTo()` in setup still rendered and returned a 200 HTML shell on
  // the server, so the retired URL only forwarded after hydration. Route meta
  // redirects emit a real 302 and never instantiate the component.
  it.each(retired)('%s redirects at the route level, not from setup', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')

    expect(source).not.toContain("navigateTo('/")
  })

  it.each(retired)('%s does not redirect to itself', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    const self = `/dashboard/admin/${file.replace('.vue', '')}`

    expect(source).not.toContain(`redirect: '${self}'`)
  })
})
