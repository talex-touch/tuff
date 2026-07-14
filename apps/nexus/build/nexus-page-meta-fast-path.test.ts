import { describe, expect, it } from 'vitest'
import { transformEmptyPageMetaRequest } from './nexus-page-meta-fast-path'

const pagesRoot = '/project/app/pages'

describe('transformEmptyPageMetaRequest', () => {
  it('replaces page macro requests without definePageMeta', () => {
    const result = transformEmptyPageMetaRequest(
      '<script setup lang="ts">defineI18nRoute(false)</script>',
      '/project/app/pages/dashboard/account.vue?macro=true',
      pagesRoot,
    )

    expect(result).toBe('<script>export default {}</script>')
  })

  it('preserves pages with runtime page metadata', () => {
    const result = transformEmptyPageMetaRequest(
      '<script setup lang="ts">definePageMeta({ layout: false })</script>',
      '/project/app/pages/sign-in/index.vue?macro=true',
      pagesRoot,
    )

    expect(result).toBeUndefined()
  })

  it('ignores non-page and secondary Vue requests', () => {
    expect(transformEmptyPageMetaRequest(
      '<script setup lang="ts" />',
      '/project/app/components/PageShell.vue?macro=true',
      pagesRoot,
    )).toBeUndefined()
    expect(transformEmptyPageMetaRequest(
      'export default {}',
      '/project/app/pages/index.vue?macro=true&type=script&lang.ts',
      pagesRoot,
    )).toBeUndefined()
  })
})
