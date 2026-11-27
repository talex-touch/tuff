import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contract for the entire `app/pages/admin/*.vue` directory:
 * every page is either a pure route-level redirect stub (`index`, `codes`,
 * `credits`) or an active admin screen rendered through `AdminPageShell`.
 *
 * Keeping the forwarding stubs on `definePageMeta({ redirect })` avoids
 * server-rendering empty 200 admin shells before client hydration and keeps
 * `admin-route-reachability` at zero orphan waivers.
 */

const EXPECTED_REDIRECT_STUBS: Record<string, string> = {
  'index.vue': '/admin/analytics',
  'codes.vue': '/admin/subscriptions',
  'credits.vue': '/admin/users',
}

const adminDir = fileURLToPath(new URL('.', import.meta.url))

function loadAdminPages(): Array<{ file: string, content: string }> {
  return readdirSync(adminDir, { encoding: 'utf8' })
    .filter(name => name.endsWith('.vue'))
    .sort()
    .map(file => ({
      file,
      content: readFileSync(join(adminDir, file), 'utf8'),
    }))
}

function readRedirectTarget(content: string): string | null {
  const scriptBlock = content.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/)?.[1]
  if (!scriptBlock)
    return null
  const match = scriptBlock.match(/definePageMeta\s*\(\s*\{[^}]*\bredirect\s*:\s*['"]([^'"]+)['"]/s)
  return match?.[1] ?? null
}

describe('admin console page shell and redirect-stub coverage', () => {
  const pages = loadAdminPages()

  it('keeps index, codes, and credits as pure route-level 302 redirect stubs', () => {
    for (const [file, expectedTarget] of Object.entries(EXPECTED_REDIRECT_STUBS)) {
      const page = pages.find(entry => entry.file === file)
      expect(page, `${file} should exist`).toBeDefined()
      expect(readRedirectTarget(page!.content)).toBe(expectedTarget)
      expect(page!.content).toContain('defineI18nRoute(false)')
      expect(page!.content).not.toContain('useAuthUser')
      expect(page!.content).not.toContain('layout:')
      expect(page!.content).toMatch(/<template>\s*<div\s*\/>\s*<\/template>/)
    }
  })

  it('renders every non-forwarding admin page through AdminPageShell', () => {
    const activePages = pages.filter(entry => !(entry.file in EXPECTED_REDIRECT_STUBS))
    expect(activePages.length).toBeGreaterThanOrEqual(13)

    const missingShell = activePages
      .filter(entry => !entry.content.includes('<AdminPageShell'))
      .map(entry => entry.file)

    expect(missingShell).toEqual([])
  })
})
