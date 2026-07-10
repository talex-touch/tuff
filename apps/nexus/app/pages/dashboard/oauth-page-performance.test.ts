import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard oauth page performance boundary', () => {
  it('keeps the create OAuth app dialog outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./oauth.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(page).toContain('<LazyFlipDialog')
    expect(page).toMatch(/<LazyFlipDialog\b[^>]*\bv-if="createDialogVisible"/s)
    expect(page).toContain('dashboard.sections.oauth.actions.create')
    expect(page).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(page).not.toContain('<FlipDialog')
  })
})
