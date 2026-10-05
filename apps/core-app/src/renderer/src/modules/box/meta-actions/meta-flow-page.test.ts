// @vitest-environment jsdom
import type { FlowTargetInfo, TuffItem } from '@talex-touch/utils'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { estimateFlowTargetsPanelHeight, useMetaFlowPage } from './meta-flow-page'

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
}))

function target(id: string, pluginId: string, extra: Partial<FlowTargetInfo> = {}): FlowTargetInfo {
  return {
    id,
    fullId: `${pluginId}.${id}`,
    name: id,
    pluginId,
    supportedTypes: ['json'],
    hasFlowHandler: true,
    isEnabled: true,
    ...extra
  }
}

const item = {
  id: 'writing-sprint',
  kind: 'feature',
  source: { type: 'plugin', id: 'plugin-features', name: 'touch-quickops' },
  render: { mode: 'default', basic: { title: 'Writing Sprint' } },
  meta: { pluginName: 'touch-quickops', featureId: 'quickops' }
} as TuffItem

const scopes: Array<ReturnType<typeof effectScope>> = []

function createPage(send: (event: unknown, payload?: unknown) => Promise<unknown>) {
  const scope = effectScope()
  scopes.push(scope)
  const transport = { send: vi.fn(send) }
  const page = scope.run(() =>
    useMetaFlowPage({
      transport: transport as unknown as Parameters<typeof useMetaFlowPage>[0]['transport'],
      t: (key) => key
    })
  )!
  return { page, transport }
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

describe('estimateFlowTargetsPanelHeight', () => {
  it('sizes the page for every target, a titled section per plugin, and one row when there are none', () => {
    // Header 40, list padding 12, rows of 32, titles of 24, 4 between sections, filter 40.
    expect(estimateFlowTargetsPanelHeight([])).toBe(40 + 12 + 32 + 40)
    expect(estimateFlowTargetsPanelHeight([target('a', 'p')])).toBe(40 + 12 + 32 + 24 + 40)
    expect(
      estimateFlowTargetsPanelHeight([target('a', 'p'), target('b', 'q'), target('c', 'p')])
    ).toBe(40 + 12 + 3 * 32 + 2 * 24 + 4 + 40)
  })
})

describe('useMetaFlowPage', () => {
  it('opens on targets a finished prefetch brought, with no load in between', async () => {
    const targets = [target('system-info', 'quickops')]
    const { page, transport } = createPage(async (event) =>
      event === FlowEvents.getTargets ? { success: true, data: targets } : undefined
    )

    page.prefetch(item)
    await flushPromises()
    page.open(item)

    // Synchronously: a frame of the loading row would move the card twice.
    expect(page.loading.value).toBe(false)
    expect(page.targets.value).toBe(targets)
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('waits for a prefetch still running instead of asking twice', async () => {
    const reply = Promise.withResolvers<unknown>()
    const { page, transport } = createPage(() => reply.promise)

    page.prefetch(item)
    page.open(item)
    expect(page.loading.value).toBe(true)

    reply.resolve({ success: true, data: [target('airdrop', 'system-share')] })
    await flushPromises()
    expect(page.loading.value).toBe(false)
    expect(page.flatRows.value.map((row) => row.target.fullId)).toEqual(['system-share.airdrop'])
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('answers a grant with only the tokens main returned', async () => {
    const { page } = createPage(async (event) => {
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: false, requiresConfirmation: false } }
      }
      if (event === FlowEvents.grantConsent) return { success: true, data: { token: 'consent' } }
      return undefined
    })
    page.open(item, [target('notes', 'touch-notes')])

    expect(await page.select(page.flatRows.value[0]!)).toEqual({ kind: 'confirm' })
    expect(page.showAlwaysAction.value).toBe(true)
    expect(page.primaryMode.value).toBe('always')
    expect(await page.grant('always')).toEqual({
      targetId: 'touch-notes.notes',
      consentToken: 'consent'
    })
    // The buttons stay disabled until the card closes: the content is on its way.
    expect(page.consentLoading.value).toBe(true)
  })

  it('drops what was in flight when the page is left, and picks again after', async () => {
    const consent = Promise.withResolvers<unknown>()
    const { page } = createPage(async (event) =>
      event === FlowEvents.checkConsent ? consent.promise : undefined
    )
    page.open(item, [target('system-info', 'quickops')])

    const pending = page.select(page.flatRows.value[0]!)
    page.cancel()
    consent.resolve({ success: true, data: { allowed: true } })

    expect(await pending).toBeNull()
    expect(page.consentTarget.value).toBeNull()
    // Left without a pick: the next one is not locked out.
    page.open(item, [target('system-info', 'quickops')])
    expect(await page.select(page.flatRows.value[0]!)).toEqual({
      kind: 'dispatch',
      selection: { targetId: 'quickops.system-info' }
    })
  })

  it('names the sender the payload names, and falls back to CoreBox', async () => {
    const { page, transport } = createPage(async () => ({ success: true, data: { allowed: true } }))

    page.open(item, [target('system-info', 'quickops')])
    await page.select(page.flatRows.value[0]!)
    page.open(
      { ...item, meta: {}, source: { type: 'application', id: 'app-provider' } } as TuffItem,
      [target('system-info', 'quickops')]
    )
    await page.select(page.flatRows.value[0]!)

    expect(
      transport.send.mock.calls
        .filter(([event]) => event === FlowEvents.checkConsent)
        .map(([, payload]) => (payload as { senderId: string }).senderId)
    ).toEqual(['touch-quickops', 'corebox'])
  })
})
