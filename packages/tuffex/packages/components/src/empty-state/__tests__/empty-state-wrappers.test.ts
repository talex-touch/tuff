import { renderToString } from 'vue/server-renderer'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import TxBlankSlate from '../../blank-slate/src/TxBlankSlate.vue'
import TxErrorState from '../../error-state/src/TxErrorState.vue'
import TxGuideState from '../../guide-state/src/TxGuideState.vue'
import TxLoadingState from '../../loading-state/src/TxLoadingState.vue'
import TxNoData from '../../no-data/src/TxNoData.vue'
import TxNoSelection from '../../no-selection/src/TxNoSelection.vue'
import TxOfflineState from '../../offline-state/src/TxOfflineState.vue'
import TxPermissionState from '../../permission-state/src/TxPermissionState.vue'
import TxSearchEmpty from '../../search-empty/src/TxSearchEmpty.vue'

describe('empty state wrappers', () => {
  const wrappers = [
    ['blank slate', TxBlankSlate],
    ['error state', TxErrorState],
    ['guide state', TxGuideState],
    ['loading state', TxLoadingState],
    ['no data', TxNoData],
    ['no selection', TxNoSelection],
    ['offline state', TxOfflineState],
    ['permission state', TxPermissionState],
    ['search empty', TxSearchEmpty],
  ] as const

  it.each(wrappers)('renders %s on SSR and forwards slots', async (_, component) => {
    const html = await renderToString(h(component, { title: 'SSR title' }, {
      description: () => 'SSR description',
      actions: () => h('button', 'Retry'),
    }))

    expect(html).toContain('SSR title')
    expect(html).toContain('SSR description')
    expect(html).toContain('Retry')
  })
})
