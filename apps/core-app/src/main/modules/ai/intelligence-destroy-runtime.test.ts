/**
 * onDestroy awaited waitForAgentRuntime(), which starts the runtime when none exists. On a module
 * whose onInit failed before startAgentRuntime(), teardown therefore registered builtin tools and
 * agents and awaited the orchestrator and agent manager -- booting the thing it was about to shut
 * down, and stalling quit for as long as that took (#765).
 *
 * The lazy start itself is deliberate: agent.run, workflow.execute and the agent channels all
 * reach the runtime through waitForAgentRuntime and need it created on demand. So the fix belongs
 * in onDestroy, and these tests pin both halves - teardown must not start one, and the request
 * path must still get one.
 */
import { describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

import { IntelligenceModule } from './intelligence-module'

interface RuntimeInternals {
  agentRuntimePromise: Promise<void> | null
  startAgentRuntime: () => void
  waitForAgentRuntime: () => Promise<void>
  onDestroy: () => Promise<void>
}

function createModule(): RuntimeInternals {
  return new IntelligenceModule() as unknown as RuntimeInternals
}

describe('intelligence teardown does not boot the runtime', () => {
  it('onInit 失败后销毁模块,不会启动 agent runtime', async () => {
    const module = createModule()
    const startSpy = vi.spyOn(module, 'startAgentRuntime')

    // Never started: this is the state after an onInit that threw before startAgentRuntime().
    expect(module.agentRuntimePromise).toBeNull()

    await module.onDestroy()

    expect(startSpy).not.toHaveBeenCalled()
    expect(module.agentRuntimePromise).toBeNull()
  })

  it('已经启动过的 runtime 仍会在销毁时被等待', async () => {
    const module = createModule()
    let settled = false
    module.agentRuntimePromise = Promise.resolve().then(() => {
      settled = true
    })

    await module.onDestroy()

    expect(settled).toBe(true)
  })

  it('销毁不会吞掉一个失败的 runtime promise', async () => {
    const module = createModule()
    module.agentRuntimePromise = Promise.reject(new Error('runtime failed'))

    // The rejection is logged, not rethrown: teardown must continue to the rest of its cleanup.
    await expect(module.onDestroy()).resolves.toBeUndefined()
  })

  it('请求路径仍然按需启动 runtime(守卫不能改成"从不启动")', async () => {
    const module = createModule()
    const startSpy = vi.spyOn(module, 'startAgentRuntime').mockImplementation(() => {
      module.agentRuntimePromise = Promise.resolve()
    })

    await module.waitForAgentRuntime()

    expect(startSpy).toHaveBeenCalledTimes(1)
  })
})
