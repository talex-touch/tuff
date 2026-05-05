import { describe, expect, it } from 'vitest'
import { WidgetVueProcessor } from './vue-processor'

describe('WidgetVueProcessor', () => {
  const processor = new WidgetVueProcessor()

  it('allows sandbox-approved package imports', () => {
    const result = processor.validateDependencies(`
      <script setup lang="ts">
      import { computed } from 'vue'
      import { useChannel } from '@talex-touch/utils/plugin/sdk'
      </script>
    `)

    expect(result.valid).toBe(true)
    expect(result.disallowedImports).toEqual([])
    expect(result.allowedImports).toEqual(['vue', '@talex-touch/utils/plugin/sdk'])
  })

  it('keeps rejecting relative imports inside widgets', () => {
    const result = processor.validateDependencies(`
      <script setup lang="ts">
      import legacyShared from '../shared/translation-shared.cjs'
      </script>
    `)

    expect(result.valid).toBe(false)
    expect(result.disallowedImports).toEqual(['../shared/translation-shared.cjs'])
    expect(result.errors[0]?.message).toContain('Allowed packages')
  })
})
