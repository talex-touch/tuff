import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard account page performance boundary', () => {
  it('keeps the profile edit dialog outside the first-visit synchronous import graph', () => {
    const page = readFileSync(new URL('./account.vue', import.meta.url), 'utf8')

    expect(page).toMatch(/import\s*\{[^}]*\bdefineAsyncComponent\b[^}]*\}\s*from ['"]vue['"]/s)
    expect(page).toContain("const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))")
    expect(page).toContain('<LazyFlipDialog')
    expect(page).toContain('v-if="profileEditOverlayVisible"')
    expect(page).not.toContain("import FlipDialog from '~/components/base/dialog/FlipDialog.vue'")
    expect(page).not.toContain('<FlipDialog')
  })
})
