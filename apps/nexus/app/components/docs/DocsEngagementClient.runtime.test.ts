import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { nextTick, ref, watch } from 'vue'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/** What a docs page asks for an administrator's view count when it opens. */

const script = parse(readFileSync(new URL('./DocsEngagementClient.vue', import.meta.url), 'utf8')).descriptor.scriptSetup?.content
if (!script)
  throw new Error('Expected DocsEngagementClient script setup.')

let setupClient: (dependencies: Record<string, unknown>) => Promise<void>

beforeAll(async () => {
  const { code } = await transform(`
export async function setupClient(dependencies) {
  const { onBeforeUnmount, onMounted, ref, watch } = dependencies.vue
  const { defineEmits, defineProps, useDeviceIdentity, useDocEngagementTracker } = dependencies.nuxt
  const { requestJson } = dependencies.request
${script.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')}
}
`, { format: 'esm', loader: 'ts', target: 'esnext' })
  setupClient = (await import(`data:text/javascript,${encodeURIComponent(code)}`) as { setupClient: typeof setupClient }).setupClient
})

describe('docsEngagementClient', () => {
  it('reads an administrator\'s view count once when the page opens', async () => {
    const mounted: Array<() => void> = []
    const requestJson = vi.fn(async () => ({ views: 12 }))
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
    vi.stubGlobal('requestAnimationFrame', () => 0)

    await setupClient({
      vue: { onBeforeUnmount: () => {}, onMounted: (callback: () => void) => mounted.push(callback), ref, watch },
      nuxt: {
        defineEmits: () => () => {},
        defineProps: () => ({ docPath: 'docs/guide', title: 'Guide', enabled: true, isAdmin: true }),
        useDeviceIdentity: () => ({ deviceId: ref('device_1') }),
        useDocEngagementTracker: () => ({ recordAction: vi.fn(), refreshSections: vi.fn() }),
      },
      request: { requestJson },
    })
    for (const callback of mounted)
      callback()
    await nextTick()

    expect(requestJson).toHaveBeenCalledTimes(1)
    expect(requestJson).toHaveBeenCalledWith('/api/docs/view', { method: 'GET', query: { path: 'docs/guide' } })
    vi.unstubAllGlobals()
  })
})
