import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard api keys page performance boundary', () => {
  it('keeps the create API key dialog outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./api-keys.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(page).toMatch(/<LazyFlipDialog\b[^>]*\bv-if="showCreateModal"/s)
    expect(page).toContain('createTriggerRef')
    expect(page).toContain('emptyCreateTriggerRef')
    expect(page).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(page).not.toContain('<FlipDialog')
  })
})
