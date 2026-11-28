import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_ROOT = resolve(__dirname, '../../..')

describe('Cloudflare Static Assets & Vite bundle contracts', () => {
  it('configures base "/" and isolated assetsDir "_console" with zero Nuxt dependencies', () => {
    const viteCfg = readFileSync(resolve(APP_ROOT, 'vite.config.ts'), 'utf8')
    expect(viteCfg).toContain(`base: '/'`)
    expect(viteCfg).toContain(`assetsDir: '_console'`)

    const pkg = JSON.parse(readFileSync(resolve(APP_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(allDeps.nuxt).toBeUndefined()
    expect(allDeps['@sidebase/nuxt-auth']).toBeUndefined()
    expect(allDeps['@nuxt/content']).toBeUndefined()
    expect(allDeps.pinia).toBeUndefined()
    expect(allDeps.echarts).toBeUndefined()
  })

  it('configures wrangler.jsonc for Cloudflare Workers SPA static assets', () => {
    const wrangler = JSON.parse(readFileSync(resolve(APP_ROOT, 'wrangler.jsonc'), 'utf8')) as {
      name: string
      assets: { directory: string, not_found_handling: string }
      routes: Array<{ pattern: string }>
    }
    expect(wrangler.name).toBe('tuff-nexus-console')
    expect(wrangler.assets.directory).toBe('dist')
    expect(wrangler.assets.not_found_handling).toBe('single-page-application')

    const patterns = wrangler.routes.map(r => r.pattern)
    expect(patterns).toContain('tuff.tagzxia.com/_console/*')
    expect(patterns).toContain('tuff.tagzxia.com/sign-in')
    expect(patterns).toContain('tuff.tagzxia.com/device-auth')
    expect(patterns).toContain('tuff.tagzxia.com/dashboard/*')
    expect(patterns).toContain('tuff.tagzxia.com/admin/*')
    expect(patterns).toContain('tuff.tagzxia.com/team/*')
  })

  it('emits /* no-cache shell first and detaches Cache-Control for immutable /_console/* assets', () => {
    const headers = readFileSync(resolve(APP_ROOT, 'public/_headers'), 'utf8')
    const wildcardIdx = headers.indexOf('/*')
    const consoleIdx = headers.indexOf('/_console/*')
    expect(wildcardIdx).toBeGreaterThanOrEqual(0)
    expect(consoleIdx).toBeGreaterThan(wildcardIdx)
    const consoleBlock = headers.slice(consoleIdx)
    expect(consoleBlock).toContain('! Cache-Control')
    expect(consoleBlock).toContain('Cache-Control: public, max-age=31536000, immutable')
    expect(headers.slice(0, consoleIdx)).toContain('no-cache, no-store, must-revalidate')
  })
})
