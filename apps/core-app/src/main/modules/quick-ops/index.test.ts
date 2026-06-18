import type { ModuleDestroyContext, ModuleInitContext, ModuleStopContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const quickOpsProviderMock = vi.hoisted(() => ({
  cleanup: vi.fn()
}))

vi.mock('../box-tool/addon/quick-ops/quick-ops-provider', () => ({
  quickOpsProvider: quickOpsProviderMock
}))

import { QuickOpsModule } from './index'

describe('QuickOpsModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the shared QuickOps provider without cleaning sessions on init', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    expect(module.getProvider()).toBe(quickOpsProviderMock)
    expect(quickOpsProviderMock.cleanup).not.toHaveBeenCalled()
  })

  it('cleans QuickOps sessions on module stop and destroy', () => {
    const module = new QuickOpsModule()

    module.stop({ reason: 'app-quit' } as ModuleStopContext<TalexEvents>)
    module.onDestroy({} as ModuleDestroyContext<TalexEvents>)

    expect(quickOpsProviderMock.cleanup).toHaveBeenNthCalledWith(1, 'module-stop:app-quit')
    expect(quickOpsProviderMock.cleanup).toHaveBeenNthCalledWith(2, 'module-destroy')
  })
})
